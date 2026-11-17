// Localiza/baixa/atualiza as ferramentas nativas usadas pelo app.
//  - ffmpeg: empacotado via ffmpeg-static (fora do asar).
//  - yt-dlp: binário oficial standalone, baixado no 1º uso para userData/bin e
//            auto-atualizável (`yt-dlp -U`) — o YouTube quebra extratores com
//            frequência, então NÃO congelamos a versão dentro do instalador.
//  - runtime JS do yt-dlp (desafios do YouTube): o próprio executável do
//    Electron em modo Node (ELECTRON_RUN_AS_NODE=1). Dispensa Deno.
import { app, net } from "electron";
import fs from "node:fs";
import path from "node:path";
import { run, ToolError } from "./util";

export function ffmpegPath(): string {
  const p: string | null = require("ffmpeg-static");
  if (!p) throw new ToolError("ffmpeg não disponível para esta plataforma.");
  return p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
}

function binDir(): string {
  const d = path.join(app.getPath("userData"), "bin");
  fs.mkdirSync(d, { recursive: true });
  return d;
}

export function ytdlpPath(): string {
  return path.join(binDir(), process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
}

function ytdlpAsset(): string {
  switch (process.platform) {
    case "win32": return process.arch === "arm64" ? "yt-dlp_arm64.exe" : "yt-dlp.exe";
    case "darwin": return "yt-dlp_macos";
    default: return process.arch === "arm64" ? "yt-dlp_linux_aarch64" : "yt-dlp_linux";
  }
}

let installing: Promise<void> | null = null;

/** Garante que o yt-dlp existe; baixa do GitHub na primeira vez. */
export async function ensureYtdlp(onStatus?: (msg: string) => void): Promise<string> {
  const target = ytdlpPath();
  if (fs.existsSync(target)) return target;
  if (!installing) {
    installing = (async () => {
      onStatus?.("baixando yt-dlp (primeiro uso)");
      const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${ytdlpAsset()}`;
      const res = await net.fetch(url);
      if (!res.ok) throw new ToolError(`Falha ao baixar o yt-dlp (HTTP ${res.status}).`);
      const tmp = `${target}.part`;
      fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
      fs.chmodSync(tmp, 0o755);
      fs.renameSync(tmp, target);
    })().finally(() => { installing = null; });
  }
  await installing;
  return target;
}

/** Ambiente para processos do yt-dlp: Electron atua como `node`. */
export function ytdlpEnv(): NodeJS.ProcessEnv {
  return { ...process.env, ELECTRON_RUN_AS_NODE: "1", PYTHONIOENCODING: "utf-8" };
}

export function jsRuntimeArgs(): string[] {
  return ["--no-js-runtimes", "--js-runtimes", `node:${process.execPath}`];
}

export async function ytdlpVersion(): Promise<string | null> {
  if (!fs.existsSync(ytdlpPath())) return null;
  const r = await run(ytdlpPath(), ["--version"], { env: ytdlpEnv() });
  return r.code === 0 ? r.stdout.trim() : null;
}

export async function updateYtdlp(): Promise<string> {
  const p = await ensureYtdlp();
  const r = await run(p, ["-U"], { env: ytdlpEnv() });
  if (r.code !== 0) throw new ToolError((r.stderr || r.stdout).trim().slice(-400));
  return (r.stdout || r.stderr).trim().split("\n").pop() ?? "";
}

export async function ffmpegVersion(): Promise<string | null> {
  try {
    const r = await run(ffmpegPath(), ["-version"]);
    return r.stdout.split("\n")[0]?.replace(/^ffmpeg version\s*/, "").split(" ")[0] ?? null;
  } catch {
    return null;
  }
}
