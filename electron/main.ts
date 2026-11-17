// Processo principal do app desktop Alexander Audio Tools.
// Serve a UI (export estático do Next) num servidor HTTP local em 127.0.0.1 —
// origem fixa que permite o OAuth PKCE do Spotify via redirect de loopback
// (http://127.0.0.1:47816/spotify) sem nenhum backend remoto.
import {
  app, BrowserWindow, desktopCapturer, dialog, ipcMain, session, shell,
  type IpcMainInvokeEvent,
} from "electron";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { ffmpegVersion, ytdlpPath, ytdlpVersion, updateYtdlp, ensureYtdlp } from "./binaries";
import { saveRecording, type RecordingMeta } from "./recorder";
import { getSettings, setSettings, type Settings } from "./settings";
import { cancelJob, listJobs, startJob, type Job, type JobRequest } from "./youtube";

const PORT = 47816;
const HOST = "127.0.0.1";
const DEV_URL = process.env.AAT_DEV_URL; // ex.: http://127.0.0.1:47816 (next dev)
const ORIGIN = DEV_URL ? new URL(DEV_URL).origin : `http://${HOST}:${PORT}`;

let win: BrowserWindow | null = null;

// ───────────── servidor estático local ─────────────
// Next export usa scripts inline; o resto fica restrito ao local + APIs do Spotify.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self'",
  "media-src 'self' blob:",
  "connect-src 'self' https://api.spotify.com https://accounts.spotify.com",
].join("; ");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".txt": "text/plain",
};

function startStaticServer(root: string): Promise<void> {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url ?? "/", ORIGIN).pathname);
    const candidates = [urlPath, `${urlPath}.html`, path.posix.join(urlPath, "index.html")];
    for (const c of candidates) {
      const file = path.join(root, path.normalize(c));
      if (!file.startsWith(root)) break; // path traversal
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        res.writeHead(200, {
          "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream",
          "Content-Security-Policy": CSP,
        });
        fs.createReadStream(file).pipe(res);
        return;
      }
    }
    res.writeHead(404).end("not found");
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, HOST, () => resolve());
  });
}

// ───────────── janela ─────────────
function createWindow() {
  win = new BrowserWindow({
    width: 1080,
    height: 900,
    minWidth: 720,
    minHeight: 600,
    title: "Alexander Audio Tools",
    backgroundColor: "#e9dcc3",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Links externos abrem no navegador do sistema.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  void win.loadURL(ORIGIN);
  win.on("closed", () => { win = null; });
}

function isTrusted(e: IpcMainInvokeEvent): boolean {
  try {
    return new URL(e.senderFrame?.url ?? "").origin === ORIGIN;
  } catch {
    return false;
  }
}

function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => R | Promise<R>) {
  ipcMain.handle(channel, async (e, ...args) => {
    if (!isTrusted(e)) throw new Error("origem não autorizada");
    return fn(...(args as A));
  });
}

function broadcastJob(job: Job) {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send("job:update", job);
}

function registerIpc() {
  handle("settings:get", () => getSettings());
  handle("settings:set", (patch: Partial<Settings>) => setSettings(patch));
  handle("settings:chooseOutputDir", async () => {
    const r = await dialog.showOpenDialog(win!, {
      properties: ["openDirectory", "createDirectory"],
      defaultPath: getSettings().outputDir,
    });
    if (r.canceled || !r.filePaths[0]) return getSettings();
    return setSettings({ outputDir: r.filePaths[0] });
  });

  handle("tools:status", async () => ({
    ytdlp: await ytdlpVersion(),
    ytdlpPath: ytdlpPath(),
    ffmpeg: await ffmpegVersion(),
    jsRuntime: `Electron/Node ${process.versions.node}`,
    platform: process.platform,
    arch: process.arch,
    appVersion: app.getVersion(),
  }));
  handle("tools:installYtdlp", async () => { await ensureYtdlp(); return ytdlpVersion(); });
  handle("tools:updateYtdlp", () => updateYtdlp());

  handle("jobs:start", (req: JobRequest) => startJob(req, broadcastJob));
  handle("jobs:cancel", (id: string) => cancelJob(id));
  handle("jobs:list", () => listJobs());

  handle("recording:save", (data: ArrayBuffer, meta: RecordingMeta) => saveRecording(data, meta));

  handle("shell:showInFolder", (p: string) => shell.showItemInFolder(p));
  handle("shell:openPath", (p: string) => shell.openPath(p));
  handle("shell:openOutputDir", () => {
    fs.mkdirSync(getSettings().outputDir, { recursive: true });
    return shell.openPath(getSettings().outputDir);
  });
  handle("shell:openExternal", (url: string) => {
    if (/^https:\/\//i.test(url)) return shell.openExternal(url);
  });
}

function configureSession() {
  const ses = session.defaultSession;
  const local = (url: string) => { try { return new URL(url).origin === ORIGIN; } catch { return false; } };

  // Microfone / dispositivos de entrada (ex.: "Monitor of …" no Linux, BlackHole no macOS).
  ses.setPermissionRequestHandler((wc, permission, cb) => {
    cb(local(wc.getURL()) && ["media", "display-capture"].includes(permission));
  });
  ses.setPermissionCheckHandler((_wc, permission, origin) =>
    local(origin) && ["media", "display-capture"].includes(permission));

  // getDisplayMedia => áudio do sistema por loopback, sem diálogo de compartilhar aba.
  // Loopback: Windows (suportado), macOS (experimental, ver flags acima);
  // no Linux usa-se um dispositivo "Monitor of …" (PulseAudio/PipeWire).
  ses.setDisplayMediaRequestHandler(async (_req, cb) => {
    const [screen] = await desktopCapturer.getSources({ types: ["screen"] });
    if (process.platform === "linux") cb({ video: screen });
    else cb({ video: screen, audio: "loopback" });
  }, { useSystemPicker: false });
}

// ───────────── ciclo de vida ─────────────
// macOS: o Electron só documenta loopback no Windows. Estas flags do Chromium
// habilitam a captura de áudio do sistema no macOS (ScreenCaptureKit, 13+;
// Core Audio taps, 14.2+). Não-verificado em hardware; fallback = BlackHole.
if (process.platform === "darwin") {
  app.commandLine.appendSwitch("enable-features",
    "MacLoopbackAudioForScreenShare,MacCatapLoopbackAudioForScreenShare");
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(async () => {
    if (!DEV_URL) {
      try {
        await startStaticServer(path.join(app.getAppPath(), "out"));
      } catch (e) {
        dialog.showErrorBox("Porta ocupada",
          `Não foi possível abrir ${ORIGIN} (${(e as Error).message}).\n` +
          "Feche outra instância do app ou o programa que usa essa porta.");
        app.quit();
        return;
      }
    }
    configureSession();
    registerIpc();
    createWindow();
    // Pré-carrega o yt-dlp em segundo plano para o primeiro download ser rápido.
    ensureYtdlp().catch(() => { /* reportado quando o usuário usar */ });
  });

  app.on("window-all-closed", () => app.quit());
  app.on("activate", () => { if (!win) createWindow(); });
}
