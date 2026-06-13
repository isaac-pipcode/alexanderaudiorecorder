"use client";

import { useCallback, useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_YOUTUBE_API_URL ?? "";

type JobStatus = "pending" | "running" | "done" | "error";
type ResultFile = { name: string; url: string };
type Job = { id: string; status: JobStatus; message?: string; files?: ResultFile[] };

export default function YoutubePanel() {
  const [url, setUrl] = useState("");
  const [silenceLen, setSilenceLen] = useState(2.0);
  const [silenceThresh, setSilenceThresh] = useState(-40);
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
        body: JSON.stringify({ url, silence_len: silenceLen, silence_thresh: silenceThresh }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Job = await res.json();
      setJob(data);
      poll(data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao iniciar o processamento.");
    }
  }, [url, silenceLen, silenceThresh, poll]);

  if (!API_URL) {
    return (
      <div className="panel">
        <h2 className="label-marker text-2xl text-rust">Bancada sem energia</h2>
        <p className="mt-2 text-sm">
          A mesa de corte precisa de um motor com <code className="text-rust">yt-dlp</code> e{" "}
          <code className="text-rust">ffmpeg</code>, que <b>não roda no Vercel</b>. Suba o
          serviço de <code>backend/</code> (Railway, Fly.io ou VPS via Docker) e defina{" "}
          <code className="text-rust">NEXT_PUBLIC_YOUTUBE_API_URL</code> no Vercel.
        </p>
        <p className="mt-3 text-sm text-ink/70">Instruções em <code>backend/README.md</code>.</p>
      </div>
    );
  }

  const busy = job?.status === "pending" || job?.status === "running";

  return (
    <div className="panel">
      <div className="flex items-center justify-between">
        <span className="label-marker text-xl text-ink">✂ Mesa de corte</span>
        <span className="text-2xl">✂</span>
      </div>
      <p className="mt-1 text-sm">
        Cole a fita (URL). Tem capítulos? Cortamos faixa a faixa. Não tem? Cortamos
        nos silêncios — emendando como fita magnética.
      </p>

      {/* fita magnética decorativa */}
      <div className="magtape my-4 splice" />

      <div className="space-y-4">
        <input
          type="url"
          placeholder="https://www.youtube.com/watch?v=..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="field"
        />

        <div className="grid grid-cols-2 gap-4">
          <label className="text-sm">
            <span className="label-marker text-ink">Silêncio mín. (s)</span>
            <input
              type="number"
              step="0.5"
              value={silenceLen}
              onChange={(e) => setSilenceLen(parseFloat(e.target.value))}
              className="field mt-1"
            />
          </label>
          <label className="text-sm">
            <span className="label-marker text-ink">Limiar (dBFS)</span>
            <input
              type="number"
              value={silenceThresh}
              onChange={(e) => setSilenceThresh(parseInt(e.target.value, 10))}
              className="field mt-1"
            />
          </label>
        </div>

        <button onClick={submit} disabled={!url || busy} className="btn-key btn-stop">
          {busy ? "✂ cortando…" : "✂ CORTAR FITA"}
        </button>
      </div>

      {error && (
        <p className="mt-4 border-2 border-rust bg-rust/10 p-3 text-sm text-ink">{error}</p>
      )}

      {job && (
        <div className="mt-6">
          <div className="text-sm">
            Status: <span className="label-marker text-rust">{job.status}</span>
            {job.message ? ` — ${job.message}` : ""}
          </div>
          {job.files && job.files.length > 0 && (
            <ul className="cassette-label mt-3 space-y-2">
              {job.files.map((f, i) => (
                <li key={f.name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">
                    <span className="label-marker mr-2 text-rust">{i + 1}.</span>
                    {f.name}
                  </span>
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
