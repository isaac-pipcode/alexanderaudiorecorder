"use client";

import { useState } from "react";
import { useJob } from "../lib/useJob";
import FormatPicker, { type AudioFormat } from "./FormatPicker";
import JobView from "./JobView";

export default function YoutubePanel() {
  const [url, setUrl] = useState("");
  const [silenceLen, setSilenceLen] = useState(2.0);
  const [silenceThresh, setSilenceThresh] = useState(-40);
  const [audioFormat, setAudioFormat] = useState<AudioFormat>("m4a");
  const { job, error, busy, start, cancel } = useJob();

  const submit = () =>
    start({ url, mode: "split", audioFormat, silenceLen, silenceThresh });

  return (
    <div className="panel">
      <div className="flex items-center justify-between">
        <span className="label-marker text-xl text-ink">✂ Mesa de corte</span>
        <span className="text-2xl">✂</span>
      </div>
      <p className="mt-1 text-sm">
        Cole a fita (URL). Tem capítulos? Cortamos faixa a faixa. Não tem? Cortamos
        no meio de cada silêncio — emendando como fita magnética. Cada faixa sai
        numerada, com título, álbum e capa.
      </p>

      <div className="magtape my-4 splice" />

      <div className="space-y-4">
        <input
          type="url"
          placeholder="https://www.youtube.com/watch?v=..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && url && !busy && submit()}
          className="field"
        />

        <FormatPicker value={audioFormat} onChange={setAudioFormat} />

        <div className="grid grid-cols-2 gap-4">
          <label className="text-sm">
            <span className="label-marker text-ink">Silêncio mín. (s)</span>
            <input
              type="number"
              step="0.5"
              min="0.5"
              value={silenceLen}
              onChange={(e) => setSilenceLen(parseFloat(e.target.value) || 2)}
              className="field mt-1"
            />
          </label>
          <label className="text-sm">
            <span className="label-marker text-ink">Limiar (dBFS)</span>
            <input
              type="number"
              max="0"
              value={silenceThresh}
              onChange={(e) => setSilenceThresh(parseInt(e.target.value, 10) || -40)}
              className="field mt-1"
            />
          </label>
        </div>
        <p className="text-xs text-ink/60">
          Os parâmetros de silêncio só valem quando o vídeo não tem capítulos.
        </p>

        <button onClick={submit} disabled={!url || busy} className="btn-key btn-stop">
          {busy ? "✂ cortando…" : "✂ CORTAR FITA"}
        </button>
      </div>

      <JobView job={job} error={error} onCancel={cancel} numbered />
    </div>
  );
}
