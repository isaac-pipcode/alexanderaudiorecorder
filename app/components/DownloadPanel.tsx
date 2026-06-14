"use client";

import { useCallback, useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_YOUTUBE_API_URL ?? "";

type JobStatus = "pending" | "running" | "done" | "error";
type ResultFile = { name: string; url: string };
type Job = {
  id: string;
  status: JobStatus;
  message?: string;
  files?: ResultFile[];
  progress?: number;
  phase?: string;
};
type AudioFormat = "m4a" | "mp3";

export default function DownloadPanel() {
  const [url, setUrl] = useState("");
  const [audioFormat, setAudioFormat] = useState<AudioFormat>("m4a");
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback((id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/jobs/${id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: Job = await res.json();
        setJob(data);
        if (data.status === "done" || data.status === "error") {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch (e) {
        if (pollRef.current) clearInterval(pollRef.current);
        setError(e instanceof Error ? e.message : "Erro ao consultar o job.");
      }
    }, 2000);
  }, []);

  const submit = useCallback(async () => {
    setError(null);
    setJob(null);
    try {
      const res = await fetch(`${API_URL}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, audio_format: audioFormat, split: false }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Job = await res.json();
      setJob(data);
      poll(data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao iniciar o download.");
    }
  }, [url, audioFormat, poll]);

  if (!API_URL) {
    return (
      <div className="panel">
        <h2 className="label-marker text-2xl text-rust">Toca-discos sem energia</h2>
        <p className="mt-2 text-sm">
          O download usa o mesmo motor da aba YouTube (<code className="text-rust">yt-dlp</code> +{" "}
          <code className="text-rust">ffmpeg</code>), que <b>não roda no Vercel</b>. Configure{" "}
          <code className="text-rust">NEXT_PUBLIC_YOUTUBE_API_URL</code> apontando para o backend.
        </p>
      </div>
    );
  }

  const busy = job?.status === "pending" || job?.status === "running";

  return (
    <div className="panel">
      <div className="flex items-center justify-between">
        <span className="label-marker text-xl text-ink">⬇ Cópia direta</span>
        <span className="text-2xl">📀</span>
      </div>
      <p className="mt-1 text-sm">
        Cole a URL e baixe a música <b>inteira</b>, sem cortes. Igual gravar a faixa
        toda numa fita só.
      </p>

      <div className="magtape my-4" />

      <div className="space-y-4">
        <input
          type="url"
          placeholder="https://www.youtube.com/watch?v=..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="field"
        />

        <div>
          <span className="label-marker text-ink">Formato de saída</span>
          <div className="mt-1 flex gap-3">
            <button
              type="button"
              onClick={() => setAudioFormat("m4a")}
              className={`btn-key ${audioFormat === "m4a" ? "btn-stop" : ""}`}
            >
              M4A · rápido
            </button>
            <button
              type="button"
              onClick={() => setAudioFormat("mp3")}
              className={`btn-key ${audioFormat === "mp3" ? "btn-stop" : ""}`}
            >
              MP3 · lento
            </button>
          </div>
          <p className="mt-1 text-xs text-ink/60">
            {audioFormat === "m4a"
              ? "M4A (AAC): o YouTube já entrega assim — download quase instantâneo, toca em qualquer lugar."
              : "⚠ MP3: precisa reconverter no servidor. Funciona, mas pode levar VÁRIOS minutos (CPU do plano grátis)."}
          </p>
        </div>

        <button onClick={submit} disabled={!url || busy} className="btn-key btn-stop">
          {busy ? "⬇ baixando…" : "⬇ BAIXAR MÚSICA"}
        </button>
      </div>

      {error && (
        <p className="mt-4 border-2 border-rust bg-rust/10 p-3 text-sm text-ink">{error}</p>
      )}

      {job && (
        <div className="mt-6">
          {(job.status === "pending" || job.status === "running") && (
            <div className="mb-3">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="label-marker text-ink">{job.phase ?? "processando"}…</span>
                <span className="text-ink/70">{Math.round(job.progress ?? 0)}%</span>
              </div>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${Math.max(2, job.progress ?? 0)}%` }}
                />
              </div>
            </div>
          )}
          <div className="text-sm">
            Status: <span className="label-marker text-rust">{job.status}</span>
            {job.message ? ` — ${job.message}` : ""}
          </div>
          {job.files && job.files.length > 0 && (
            <ul className="cassette-label mt-3 space-y-2">
              {job.files.map((f) => (
                <li key={f.name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{f.name}</span>
                  <a href={f.url} className="btn-key" download>⬇ PEGAR</a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
