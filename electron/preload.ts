// Ponte segura renderer <-> main. Exposta como window.aat.
import { contextBridge, ipcRenderer } from "electron";

const invoke = (ch: string, ...args: unknown[]) => ipcRenderer.invoke(ch, ...args);

contextBridge.exposeInMainWorld("aat", {
  isDesktop: true,
  platform: process.platform,
  getSettings: () => invoke("settings:get"),
  setSettings: (patch: unknown) => invoke("settings:set", patch),
  chooseOutputDir: () => invoke("settings:chooseOutputDir"),
  toolsStatus: () => invoke("tools:status"),
  installYtdlp: () => invoke("tools:installYtdlp"),
  updateYtdlp: () => invoke("tools:updateYtdlp"),
  startJob: (req: unknown) => invoke("jobs:start", req),
  cancelJob: (id: string) => invoke("jobs:cancel", id),
  listJobs: () => invoke("jobs:list"),
  onJobUpdate: (cb: (job: unknown) => void) => {
    const fn = (_e: unknown, job: unknown) => cb(job);
    ipcRenderer.on("job:update", fn);
    return () => { ipcRenderer.removeListener("job:update", fn); };
  },
  saveRecording: (data: ArrayBuffer, meta: unknown) => invoke("recording:save", data, meta),
  showInFolder: (p: string) => invoke("shell:showInFolder", p),
  openPath: (p: string) => invoke("shell:openPath", p),
  openOutputDir: () => invoke("shell:openOutputDir"),
  openExternal: (url: string) => invoke("shell:openExternal", url),
});
