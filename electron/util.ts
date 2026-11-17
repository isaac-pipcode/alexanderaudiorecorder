import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export class ToolError extends Error {}

export function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().slice(0, 180) || "sem título";
}

/** Devolve um caminho que ainda não existe, acrescentando " (2)", " (3)"… */
export function uniquePath(p: string): string {
  if (!fs.existsSync(p)) return p;
  const { dir, name, ext } = path.parse(p);
  for (let i = 2; ; i++) {
    const cand = path.join(dir, `${name} (${i})${ext}`);
    if (!fs.existsSync(cand)) return cand;
  }
}

export type RunResult = { code: number; stdout: string; stderr: string };

/** Executa um processo e coleta a saída. */
export function run(cmd: string, args: string[], opts: SpawnOptions = {},
                    onSpawn?: (p: ChildProcess) => void): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true, ...opts });
    onSpawn?.(p);
    let stdout = "";
    let stderr = "";
    p.stdout?.setEncoding("utf-8").on("data", (d: string) => { stdout += d; });
    p.stderr?.setEncoding("utf-8").on("data", (d: string) => { stderr += d; });
    p.on("error", reject);
    p.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

/** Mata o processo e seus filhos (yt-dlp dispara ffmpeg). */
export function killTree(p: ChildProcess) {
  if (p.exitCode !== null || !p.pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(p.pid), "/T", "/F"], { windowsHide: true });
  } else {
    p.kill("SIGTERM");
  }
}
