// Port do antigo backend/splitter.py para o processo principal do Electron.
// Tudo roda localmente: IP residencial do usuário => sem o bloqueio de
// datacenter que exigia cookies no Render.
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ensureYtdlp, ffmpegPath, jsRuntimeArgs, ytdlpEnv,
} from "./binaries";
import { getSettings } from "./settings";
import { killTree, run, sanitize, ToolError, uniquePath } from "./util";

export type JobMode = "split" | "audio" | "video";

export type JobRequest = {
  url: string;
  mode: JobMode;
  audioFormat?: "m4a" | "mp3" | "opus" | "flac";
  silenceLen?: number;
  silenceThresh?: number;
  videoQuality?: "best" | "2160" | "1440" | "1080" | "720" | "480" | "360";
  playlist?: boolean;
};

export type JobStatus = "pending" | "running" | "done" | "error" | "canceled";

export type Job = {
  id: string;
  mode: JobMode;
  url: string;
  status: JobStatus;
  progress: number;
  phase: string;
  message?: string;
  files: string[];
  outputDir?: string;
  createdAt: number;
};

type Emit = (job: Job) => void;

const jobs = new Map<string, Job>();
const procs = new Map<string, Set<ChildProcess>>();
const canceled = new Set<string>();

export function listJobs(): Job[] {
  return [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function startJob(req: JobRequest, emit: Emit): Job {
  const url = String(req.url ?? "").trim();
  if (!/^https?:\/\//i.test(url)) throw new ToolError("URL inválida.");
  const job: Job = {
    id: crypto.randomUUID(), mode: req.mode, url, status: "pending",
    progress: 0, phase: "na fila", files: [], createdAt: Date.now(),
  };
  jobs.set(job.id, job);
  emit({ ...job });

  const update = (patch: Partial<Job>) => {
    Object.assign(job, patch);
    emit({ ...job, files: [...job.files] });
  };

  void (async () => {
    update({ status: "running", progress: 1, phase: "preparando" });
    try {
      const files = await process_(job.id, { ...req, url }, (progress, phase) =>
        update({ progress: Math.round(progress * 10) / 10, phase }));
      update({ status: "done", progress: 100, phase: "concluído", files,
               outputDir: files[0] ? path.dirname(files[0]) : undefined });
    } catch (e) {
      if (canceled.has(job.id)) update({ status: "canceled", phase: "cancelado" });
      else update({ status: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      procs.delete(job.id);
      canceled.delete(job.id);
    }
  })();

  return { ...job };
}

export function cancelJob(id: string) {
  canceled.add(id);
  for (const p of procs.get(id) ?? []) killTree(p);
}

function track(id: string, p: ChildProcess) {
  if (canceled.has(id)) { killTree(p); return; }
  if (!procs.has(id)) procs.set(id, new Set());
  procs.get(id)!.add(p);
  p.on("close", () => procs.get(id)?.delete(p));
}

// ───────────────────────── yt-dlp ─────────────────────────

function commonArgs(): string[] {
  const s = getSettings();
  const args = [
    ...jsRuntimeArgs(),
    "--ffmpeg-location", ffmpegPath(),
    "--retries", "5",
    "--extractor-retries", "3",
    "--concurrent-fragments", "4",
    "--socket-timeout", "30",
    "--no-mtime",
    "--newline", "--progress",
    "--print", "after_move:AATFILE|%(filepath)s",
  ];
  if (s.cookiesBrowser) args.push("--cookies-from-browser", s.cookiesBrowser);
  return args;
}

type Progress = (pct: number, phase: string) => void;

/** Roda o yt-dlp, traduz progresso e devolve as linhas "AAT*" impressas. */
async function ytdlp(jobId: string, args: string[], onProgress: Progress,
                     lo = 5, hi = 90): Promise<{ files: string[]; info: string[] }> {
  const bin = await ensureYtdlp((m) => onProgress(lo, m));
  const p = spawn(bin, [...commonArgs(), ...args], { env: ytdlpEnv(), windowsHide: true });
  track(jobId, p);

  const files: string[] = [];
  const info: string[] = [];
  const tail: string[] = [];
  let item = 1;
  let items = 1;
  const pctRe = /\[download\]\s+(\d+(?:\.\d+)?)%/;
  const itemRe = /\[download\] Downloading item (\d+) of (\d+)/;

  const onLine = (raw: string) => {
    const line = raw.trimEnd();
    if (!line) return;
    if (line.startsWith("AATFILE|")) { files.push(line.slice(8)); return; }
    if (line.startsWith("AATINFO|")) { info.push(line.slice(8)); return; }
    tail.push(line);
    if (tail.length > 30) tail.shift();
    const it = itemRe.exec(line);
    if (it) { item = Number(it[1]); items = Number(it[2]); return; }
    const m = pctRe.exec(line);
    if (m) {
      const frac = ((item - 1) + Number(m[1]) / 100) / items;
      const label = items > 1 ? `baixando ${item}/${items}` : "baixando";
      onProgress(lo + frac * (hi - lo), label);
    } else if (line.startsWith("[ExtractAudio]")) onProgress(hi, "convertendo áudio");
    else if (line.startsWith("[Merger]")) onProgress(hi, "juntando vídeo + áudio");
    else if (line.startsWith("[EmbedThumbnail]")) onProgress(hi, "embutindo capa");
  };

  const split = (stream: NodeJS.ReadableStream | null) => {
    let buf = "";
    stream?.setEncoding("utf-8");
    stream?.on("data", (d: string) => {
      buf += d;
      const lines = buf.split(/\r?\n|\r/);
      buf = lines.pop() ?? "";
      lines.forEach(onLine);
    });
    stream?.on("end", () => buf && onLine(buf));
  };
  split(p.stdout);
  split(p.stderr);

  const code: number = await new Promise((res, rej) => {
    p.on("error", rej);
    p.on("close", (c) => res(c ?? -1));
  });
  if (code !== 0 && files.length === 0) {
    const errs = tail.filter((l) => l.startsWith("ERROR")).join("\n") || tail.join("\n");
    throw new ToolError(friendlyError(errs));
  }
  return { files, info };
}

function friendlyError(err: string): string {
  if (/Sign in to confirm|not a bot|HTTP Error 429/i.test(err)) {
    return "O YouTube pediu verificação (anti-bot). Em Ajustes, escolha um navegador " +
      "onde você está logado no YouTube para usar os cookies dele.\n\n" + err.slice(-400);
  }
  if (/could not (copy|find).*cookie|cookies database/i.test(err)) {
    return "Não consegui ler os cookies do navegador escolhido. Feche o navegador " +
      "ou tente o Firefox (o Chrome no Windows bloqueia a leitura).\n\n" + err.slice(-400);
  }
  return err.slice(-600) || "Falha desconhecida no yt-dlp.";
}

// ───────────────────────── ffmpeg ─────────────────────────

async function ffmpeg(jobId: string, args: string[]): Promise<string> {
  const r = await run(ffmpegPath(), ["-hide_banner", "-y", ...args], {},
                      (p) => track(jobId, p));
  if (r.code !== 0) throw new ToolError(`ffmpeg falhou: ${r.stderr.slice(-400)}`);
  return r.stderr;
}

async function probeDuration(file: string): Promise<number> {
  const r = await run(ffmpegPath(), ["-hide_banner", "-i", file]);
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(r.stderr);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
}

/** Pontos de corte no MEIO de cada silêncio (o original cortava no início). */
async function detectSilences(jobId: string, file: string, len: number,
                              thresh: number): Promise<number[]> {
  const log = await ffmpeg(jobId, [
    "-i", file, "-af", `silencedetect=noise=${thresh}dB:d=${len}`, "-f", "null", "-",
  ]);
  const points: number[] = [];
  let start: number | null = null;
  for (const line of log.split("\n")) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (s) { start = Math.max(0, Number(s[1])); continue; }
    const e = /silence_end:\s*([\d.]+)/.exec(line);
    if (e && start !== null) { points.push((start + Number(e[1])) / 2); start = null; }
  }
  if (start !== null) points.push(start); // silêncio até o fim
  return points;
}

type Segment = { start: number; end: number; title: string };

async function cutSegments(jobId: string, src: string, segments: Segment[],
                           outDir: string, ext: string, album: string,
                           artist: string, cover: string | null,
                           onProgress: Progress): Promise<string[]> {
  const out: string[] = [];
  for (const [i, seg] of segments.entries()) {
    onProgress(90 + (i / segments.length) * 9, `cortando ${i + 1}/${segments.length}`);
    const file = uniquePath(path.join(
      outDir, `${String(i + 1).padStart(2, "0")} - ${sanitize(seg.title)}.${ext}`));
    const withCover = cover && ext !== "opus";
    // Atenção à ordem: "-t" precisa vir DEPOIS de todos os "-i" (opção de saída).
    await ffmpeg(jobId, [
      "-ss", seg.start.toFixed(3), "-i", src,
      ...(withCover ? ["-i", cover] : []),
      "-t", (seg.end - seg.start).toFixed(3),
      "-map", "0:a",
      ...(withCover ? ["-map", "1:v", "-c:v", "copy", "-disposition:v", "attached_pic"] : []),
      "-c:a", "copy",
      "-metadata", `title=${seg.title}`,
      "-metadata", `album=${album}`,
      "-metadata", `artist=${artist}`,
      "-metadata", `track=${i + 1}/${segments.length}`,
      ...(ext === "mp3" ? ["-id3v2_version", "3"] : []),
      file,
    ]);
    out.push(file);
  }
  return out;
}

// ───────────────────────── orquestração ─────────────────────────

async function process_(jobId: string, req: JobRequest, onProgress: Progress): Promise<string[]> {
  const s = getSettings();
  const ext = req.audioFormat ?? "m4a";
  const cover = s.embedCover;
  const playlist = Boolean(req.playlist) && req.mode !== "split";
  const name = playlist
    ? "%(playlist_title|playlist)s/%(playlist_index|0)03d - %(title)s.%(ext)s"
    : "%(title)s.%(ext)s";
  const plArgs = playlist ? ["--yes-playlist"] : ["--no-playlist"];

  if (req.mode === "video") {
    const dir = path.join(s.outputDir, "Vídeos");
    fs.mkdirSync(dir, { recursive: true });
    const q = req.videoQuality ?? "best";
    const h = q === "best" ? "" : `[height<=${q}]`;
    const fmt = `bestvideo${h}[ext=mp4]+bestaudio[ext=m4a]/bestvideo${h}+bestaudio/best${h}/best`;
    const { files } = await ytdlp(jobId, [
      ...plArgs, "-f", fmt, "--merge-output-format", "mp4",
      "--embed-metadata", "--embed-chapters",
      ...(cover ? ["--embed-thumbnail", "--convert-thumbnails", "jpg"] : []),
      "-o", path.join(dir, name), req.url,
    ], onProgress);
    return files;
  }

  const audioArgs = [
    "-f", `bestaudio[ext=${ext === "m4a" ? "m4a" : "webm"}]/bestaudio/best`,
    "-x", "--audio-format", ext, "--audio-quality", "0",
  ];

  if (req.mode === "audio") {
    const dir = path.join(s.outputDir, "YouTube");
    fs.mkdirSync(dir, { recursive: true });
    const { files } = await ytdlp(jobId, [
      ...plArgs, ...audioArgs, "--embed-metadata",
      ...(cover ? ["--embed-thumbnail", "--convert-thumbnails", "jpg"] : []),
      "-o", path.join(dir, name), req.url,
    ], onProgress);
    return files;
  }

  // mode === "split": baixa num diretório temporário e corta para a pasta final.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aat-"));
  try {
    const { files, info } = await ytdlp(jobId, [
      "--no-playlist", ...audioArgs,
      ...(cover ? ["--write-thumbnail", "--convert-thumbnails", "jpg"] : []),
      "--print", "after_move:AATINFO|%(.{title,uploader,channel,artist,chapters,duration})j",
      "-o", path.join(tmp, "src.%(ext)s"), req.url,
    ], onProgress, 5, 85);
    const src = files[0];
    if (!src || !fs.existsSync(src)) throw new ToolError("Download terminou sem arquivo.");
    const meta = JSON.parse(info[0] ?? "{}") as {
      title?: string; uploader?: string; channel?: string; artist?: string;
      chapters?: { start_time: number; end_time?: number; title: string }[] | null;
      duration?: number;
    };
    const title = meta.title ?? "audio";
    const artist = meta.artist ?? meta.channel ?? meta.uploader ?? "";
    const thumb = fs.readdirSync(tmp).find((f) => f.endsWith(".jpg"));
    const coverPath = thumb ? path.join(tmp, thumb) : null;
    const total = meta.duration || (await probeDuration(src));
    const outDir = path.join(s.outputDir, "YouTube", sanitize(title));
    fs.mkdirSync(outDir, { recursive: true });

    let segments: Segment[];
    const chapters = meta.chapters ?? [];
    if (chapters.length > 0) {
      onProgress(87, `cortando por ${chapters.length} capítulo(s)`);
      segments = chapters.map((c, i) => ({
        start: c.start_time,
        end: c.end_time ?? chapters[i + 1]?.start_time ?? total,
        title: c.title,
      }));
    } else {
      onProgress(86, "detectando silêncios");
      const points = await detectSilences(jobId, src, req.silenceLen ?? 2,
                                          req.silenceThresh ?? -40);
      const bounds = [0, ...points.filter((p) => p > 0 && p < total), total];
      segments = [];
      for (let i = 0; i < bounds.length - 1; i++) {
        if (bounds[i + 1] - bounds[i] > 1) {
          segments.push({ start: bounds[i], end: bounds[i + 1],
                          title: `${title} - Parte ${String(segments.length + 1).padStart(2, "0")}` });
        }
      }
      if (segments.length <= 1) segments = [{ start: 0, end: total, title }];
    }
    return await cutSegments(jobId, src, segments, outDir, ext, title, artist,
                             coverPath, onProgress);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
