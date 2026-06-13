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
};

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
        body: JSON.stringify({
          url,
          silence_len: silenceLen,
          silence_thresh: silenceThresh,
        }),
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
      <Card>
        <h2 className="text-lg font-semibold">Backend não configurado</h2>
        <p className="mt-2 text-sm text-neutral-400">
          A aba YouTube precisa de um backend com <code className="text-brand">yt-dlp</code> e{" "}
          <code className="text-brand">ffmpeg</code>, que <b>não roda no Vercel</b>. Deploye o
          serviço em <code>backend/</code> (Railway, Fly.io ou VPS via Docker) e defina{" "}
          <code className="text-brand">NEXT_PUBLIC_YOUTUBE_API_URL</code> nas variáveis de ambiente.
        </p>
        <p className="mt-3 text-sm text-neutral-500">
          Veja as instruções em <code>backend/README.md</code>.
        </p>
      </Card>
    );
  }

  const busy = job?.status === "pending" || job?.status === "running";

  return (
    <Card>
      <h2 className="text-lg font-semibold">Baixar e cortar do YouTube</h2>
      <p className="mt-1 text-sm text-neutral-400">
        Cola a URL. Se o vídeo tiver capítulos, cortamos por capítulo; senão, por silêncios.
      </p>

      <div className="mt-4 space-y-4">
        <input
          type="url"
          placeholder="https://www.youtube.com/watch?v=..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-brand"
        />

        <div className="grid grid-cols-2 gap-4">
          <label className="text-sm">
            <span className="text-neutral-400">Silêncio mín. (s)</span>
            <input
              type="number"
              step="0.5"
              value={silenceLen}
              onChange={(e) => setSilenceLen(parseFloat(e.target.value))}
              className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-brand"
            />
          </label>
          <label className="text-sm">
            <span className="text-neutral-400">Limiar (dBFS)</span>
            <input
              type="number"
              value={silenceThresh}
              onChange={(e) => setSilenceThresh(parseInt(e.target.value, 10))}
              className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 outline-none focus:border-brand"
            />
          </label>
        </div>

        <button onClick={submit} disabled={!url || busy} className="btn-primary">
          {busy ? "Processando…" : "Processar"}
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-950/50 p-3 text-sm text-red-300">{error}</p>
      )}

      {job && (
        <div className="mt-6">
          <div className="text-sm text-neutral-400">
            Status: <span className="font-medium text-neutral-200">{job.status}</span>
            {job.message ? ` — ${job.message}` : ""}
          </div>
          {job.files && job.files.length > 0 && (
            <ul className="mt-3 space-y-2">
              {job.files.map((f) => (
                <li
                  key={f.name}
                  className="flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-950 p-3 text-sm"
                >
                  <span className="truncate">{f.name}</span>
                  <a href={f.url} className="btn-small" download>
                    ⬇ Baixar
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
      {children}
    </div>
  );
}
