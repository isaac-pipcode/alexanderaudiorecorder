"use client";

import { basename, desktop, type Job } from "../lib/desktop";

const STATUS_LABEL: Record<Job["status"], string> = {
  pending: "na fila",
  running: "rodando",
  done: "pronto",
  error: "erro",
  canceled: "cancelado",
};

/** Progresso + lista de arquivos gerados de um job (compartilhado pelas abas). */
export default function JobView({
  job, error, onCancel, numbered = false,
}: {
  job: Job | null;
  error: string | null;
  onCancel: () => void;
  numbered?: boolean;
}) {
  const api = desktop();
  const busy = job?.status === "pending" || job?.status === "running";

  return (
    <>
      {error && <p className="error-box mt-4">{error}</p>}
      {job && (
        <div className="mt-6">
          {busy && (
            <div className="mb-3">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="label-marker text-ink">{job.phase}…</span>
                <span className="flex items-center gap-3 text-ink/70">
                  {Math.round(job.progress)}%
                  <button onClick={onCancel} className="underline hover:text-rust">cancelar</button>
                </span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${Math.max(2, job.progress)}%` }} />
              </div>
            </div>
          )}
          <div className="text-sm">
            Status: <span className="label-marker text-rust">{STATUS_LABEL[job.status]}</span>
          </div>
          {job.status === "error" && job.message && (
            <pre className="error-box mt-2 whitespace-pre-wrap text-xs">{job.message}</pre>
          )}
          {job.files.length > 0 && (
            <>
              <ul className="cassette-label mt-3 space-y-2">
                {job.files.map((f, i) => (
                  <li key={f} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate" title={f}>
                      {numbered && <span className="label-marker mr-2 text-rust">{i + 1}.</span>}
                      {basename(f)}
                    </span>
                    <span className="flex shrink-0 gap-2">
                      <button onClick={() => api?.openPath(f)} className="btn-key">▶ ABRIR</button>
                      <button onClick={() => api?.showInFolder(f)} className="btn-key">📂</button>
                    </span>
                  </li>
                ))}
              </ul>
              {job.outputDir && (
                <button onClick={() => api?.openPath(job.outputDir!)} className="btn-key mt-3">
                  📂 ABRIR PASTA
                </button>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
