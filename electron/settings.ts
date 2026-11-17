// Preferências persistidas em JSON no diretório de dados do usuário.
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

export type Settings = {
  /** Pasta raiz onde tudo é salvo (Spotify/, YouTube/, Vídeos/). */
  outputDir: string;
  /** Navegador de onde o yt-dlp lê cookies ("" = nenhum). */
  cookiesBrowser: string;
  /** Client ID do app Spotify (fluxo PKCE, sem secret). */
  spotifyClientId: string;
  /** Formato das gravações do Spotify. */
  spotifyFormat: "mp3" | "m4a" | "flac";
  /** Embutir capa do álbum / thumbnail nos arquivos. */
  embedCover: boolean;
};

const FILE = () => path.join(app.getPath("userData"), "settings.json");

function defaults(): Settings {
  return {
    outputDir: path.join(app.getPath("music"), "Alexander Audio Tools"),
    cookiesBrowser: "",
    spotifyClientId: process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? "",
    spotifyFormat: "mp3",
    embedCover: true,
  };
}

let cache: Settings | null = null;

export function getSettings(): Settings {
  if (cache) return cache;
  let stored: Partial<Settings> = {};
  try {
    stored = JSON.parse(fs.readFileSync(FILE(), "utf-8"));
  } catch {
    /* primeira execução */
  }
  cache = { ...defaults(), ...stored };
  return cache;
}

const ALLOWED_KEYS: (keyof Settings)[] = [
  "outputDir", "cookiesBrowser", "spotifyClientId", "spotifyFormat", "embedCover",
];

export function setSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings() };
  for (const k of ALLOWED_KEYS) {
    if (k in patch && patch[k] !== undefined) {
      (next as Record<string, unknown>)[k] = patch[k];
    }
  }
  cache = next;
  fs.mkdirSync(path.dirname(FILE()), { recursive: true });
  fs.writeFileSync(FILE(), JSON.stringify(next, null, 2));
  return next;
}
