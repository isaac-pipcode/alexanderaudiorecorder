"use client";

import { useState } from "react";
import { useJob } from "../lib/useJob";
import JobView from "./JobView";

const QUALITIES = ["best", "2160", "1440", "1080", "720", "480", "360"] as const;
type Quality = (typeof QUALITIES)[number];

export default function VideoPanel() {
  const [url, setUrl] = useState("");
  const [quality, setQuality] = useState<Quality>("1080");
  const [playlist, setPlaylist] = useState(false);
  const { job, error, busy, start, cancel } = useJob();

  const submit = () => start({ url, mode: "video", videoQuality: quality, playlist });

  return (
    <div className="panel">
      <div className="flex items-center justify-between">
        <span className="label-marker text-xl text-ink">🎞 Fita de vídeo</span>
        <span className="text-2xl">📼</span>
      </div>
      <p className="mt-1 text-sm">
        Cole a URL e baixe o <b>vídeo completo</b> em MP4 (vídeo + áudio, com
        capítulos e thumbnail). Como gravar num videocassete.
      </p>

      <div className="magtape my-4" />

      <div className="space-y-4">
        <input
          type="url"
          placeholder="https://www.youtube.com/watch?v=..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && url && !busy && submit()}
          className="field"
        />

        <div>
          <span className="label-marker text-ink">Qualidade máxima</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {QUALITIES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setQuality(q)}
                className={`btn-key ${quality === q ? "btn-stop" : ""}`}
              >
                {q === "best" ? "Melhor" : q === "2160" ? "4K" : `${q}p`}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-ink/60">
            Acima de 1080p o YouTube costuma servir só VP9/AV1; o arquivo pode não
            abrir em players antigos.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={playlist} onChange={(e) => setPlaylist(e.target.checked)} />
          Baixar a playlist inteira
        </label>

        <button onClick={submit} disabled={!url || busy} className="btn-key btn-stop">
          {busy ? "🎞 baixando…" : "🎞 BAIXAR VÍDEO"}
        </button>
      </div>

      <JobView job={job} error={error} onCancel={cancel} numbered={playlist} />
    </div>
  );
}
