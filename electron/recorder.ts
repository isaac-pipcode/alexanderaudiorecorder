// Finaliza gravações da aba Spotify: WebM/Opus capturado no renderer ->
// MP3/M4A/FLAC com metadados e capa, via ffmpeg nativo (substitui ffmpeg.wasm).
import { net } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ffmpegPath } from "./binaries";
import { getSettings } from "./settings";
import { run, sanitize, ToolError, uniquePath } from "./util";

export type RecordingMeta = {
  title: string;
  artist: string;
  album: string;
  coverUrl?: string;
  trackNumber?: number;
};

const CODEC: Record<string, string[]> = {
  mp3: ["-c:a", "libmp3lame", "-b:a", "320k", "-id3v2_version", "3"],
  m4a: ["-c:a", "aac", "-b:a", "256k"],
  flac: ["-c:a", "flac"],
};

export async function saveRecording(data: ArrayBuffer, meta: RecordingMeta): Promise<string> {
  const s = getSettings();
  const fmt = s.spotifyFormat in CODEC ? s.spotifyFormat : "mp3";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aat-rec-"));
  try {
    const input = path.join(tmp, "in.webm");
    fs.writeFileSync(input, Buffer.from(data));

    let cover: string | null = null;
    if (s.embedCover && meta.coverUrl?.startsWith("https://")) {
      try {
        const res = await net.fetch(meta.coverUrl);
        if (res.ok) {
          cover = path.join(tmp, "cover.jpg");
          fs.writeFileSync(cover, Buffer.from(await res.arrayBuffer()));
        }
      } catch { /* sem capa, segue */ }
    }

    const dir = path.join(s.outputDir, "Spotify", sanitize(meta.artist || "Desconhecido"));
    fs.mkdirSync(dir, { recursive: true });
    const out = uniquePath(path.join(dir, `${sanitize(`${meta.artist} - ${meta.title}`)}.${fmt}`));

    const coverArgs = cover
      ? ["-i", cover, "-map", "0:a", "-map", "1:v", "-c:v", "mjpeg",
         "-disposition:v", "attached_pic", "-metadata:s:v", "comment=Cover (front)"]
      : ["-map", "0:a"];
    const r = await run(ffmpegPath(), [
      "-hide_banner", "-y", "-i", input, ...coverArgs, ...CODEC[fmt],
      "-metadata", `title=${meta.title}`,
      "-metadata", `artist=${meta.artist}`,
      "-metadata", `album=${meta.album}`,
      ...(meta.trackNumber ? ["-metadata", `track=${meta.trackNumber}`] : []),
      out,
    ]);
    if (r.code !== 0) throw new ToolError(`Conversão falhou: ${r.stderr.slice(-400)}`);
    return out;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
