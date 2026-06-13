// Conversão WebM/Opus -> MP3 320k com metadados, 100% no navegador.
// Equivalente ao wav_to_mp3() do script original, via ffmpeg.wasm.

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let ffmpeg: FFmpeg | null = null;
let loaded = false;

async function ensureLoaded(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpeg && loaded) return ffmpeg;
  ffmpeg = new FFmpeg();
  if (onLog) ffmpeg.on("log", ({ message }) => onLog(message));

  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });
  loaded = true;
  return ffmpeg;
}

export type Meta = { title: string; artist: string; album: string };

export async function toMp3(
  input: Blob,
  meta: Meta,
  onLog?: (msg: string) => void
): Promise<Blob> {
  const ff = await ensureLoaded(onLog);
  const inName = "in.webm";
  const outName = "out.mp3";

  await ff.writeFile(inName, await fetchFile(input));
  await ff.exec([
    "-i", inName,
    "-codec:a", "libmp3lame",
    "-b:a", "320k",
    "-metadata", `title=${meta.title}`,
    "-metadata", `artist=${meta.artist}`,
    "-metadata", `album=${meta.album}`,
    outName,
  ]);

  const data = (await ff.readFile(outName)) as Uint8Array;
  await ff.deleteFile(inName);
  await ff.deleteFile(outName);
  // Copia para um ArrayBuffer "puro" para satisfazer o tipo BlobPart.
  const buf = new Uint8Array(data.length);
  buf.set(data);
  return new Blob([buf], { type: "audio/mpeg" });
}
