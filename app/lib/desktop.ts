// Tipos e acesso à ponte exposta pelo preload do Electron (window.aat).

export type Settings = {
  outputDir: string;
  cookiesBrowser: string;
  spotifyClientId: string;
  spotifyFormat: "mp3" | "m4a" | "flac";
  embedCover: boolean;
};

export type JobMode = "split" | "audio" | "video";
export type JobRequest = {
  url: string;
  mode: JobMode;
  audioFormat?: "m4a" | "mp3" | "opus" | "flac";
  silenceLen?: number;
  silenceThresh?: number;
  videoQuality?: string;
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

export type ToolsStatus = {
  ytdlp: string | null;
  ytdlpPath: string;
  ffmpeg: string | null;
  jsRuntime: string;
  platform: string;
  arch: string;
  appVersion: string;
};

export type RecordingMeta = {
  title: string;
  artist: string;
  album: string;
  coverUrl?: string;
};

export type DesktopApi = {
  isDesktop: true;
  platform: "win32" | "darwin" | "linux" | string;
  getSettings(): Promise<Settings>;
  setSettings(patch: Partial<Settings>): Promise<Settings>;
  chooseOutputDir(): Promise<Settings>;
  toolsStatus(): Promise<ToolsStatus>;
  installYtdlp(): Promise<string | null>;
  updateYtdlp(): Promise<string>;
  startJob(req: JobRequest): Promise<Job>;
  cancelJob(id: string): Promise<void>;
  listJobs(): Promise<Job[]>;
  onJobUpdate(cb: (job: Job) => void): () => void;
  saveRecording(data: ArrayBuffer, meta: RecordingMeta): Promise<string>;
  showInFolder(path: string): Promise<void>;
  openPath(path: string): Promise<string>;
  openOutputDir(): Promise<string>;
  openExternal(url: string): Promise<void>;
};

declare global {
  interface Window {
    aat?: DesktopApi;
  }
}

export function desktop(): DesktopApi | null {
  return typeof window !== "undefined" && window.aat ? window.aat : null;
}

export function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}
