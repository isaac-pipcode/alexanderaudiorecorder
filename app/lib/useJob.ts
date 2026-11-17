"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { desktop, type Job, type JobRequest } from "./desktop";

/** Dispara um job no processo principal e acompanha os eventos de progresso. */
export function useJob() {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Eventos podem chegar antes de startJob() resolver; guardamos o mais recente.
  const latest = useRef(new Map<string, Job>());

  useEffect(() => {
    const api = desktop();
    if (!api) return;
    return api.onJobUpdate((j) => {
      latest.current.set(j.id, j);
      setJob((cur) => (cur && cur.id === j.id ? j : cur));
    });
  }, []);

  const start = useCallback(async (req: JobRequest) => {
    const api = desktop();
    if (!api) return;
    setError(null);
    try {
      const j = await api.startJob(req);
      setJob(latest.current.get(j.id) ?? j);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(e));
    }
  }, []);

  const cancel = useCallback(() => {
    if (job) void desktop()?.cancelJob(job.id);
  }, [job]);

  const busy = job?.status === "pending" || job?.status === "running";
  return { job, error, busy, start, cancel };
}
