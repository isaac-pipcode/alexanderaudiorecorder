"use client";

import { useState } from "react";
import { useJob } from "../lib/useJob";
import FormatPicker, { type AudioFormat } from "./FormatPicker";
import JobView from "./JobView";

export default function DownloadPanel() {
  const [url, setUrl] = useState("");
  const [audioFormat, setAudioFormat] = useState<AudioFormat>("m4a");
  const [playlist, setPlaylist] = useState(false);
  const { job, error, busy, start, cancel } = useJob();

  const submit = () => start({ url, mode: "audio", audioFormat, playlist });

  return (
    <div className="panel">
      <div className="flex items-center justify-between">
        <span className="label-marker text-xl text-ink">⬇ Cópia direta</span>
        <span className="text-2xl">📀</span>
      </div>
      <p className="mt-1 text-sm">
        Cole a URL e baixe a música <b>inteira</b>, sem cortes, com metadados e capa.
        Funciona também com playlists inteiras.
      </p>

      <div className="magtape my-4" />

      <div className="space-y-4">
        <input
          type="url"
          placeholder="https://www.youtube.com/watch?v=...  ou  .../playlist?list=..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && url && !busy && submit()}
          className="field"
        />

        <FormatPicker value={audioFormat} onChange={setAudioFormat} />

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={playlist} onChange={(e) => setPlaylist(e.target.checked)} />
          Baixar a playlist inteira (quando a URL tiver <code>list=</code>)
        </label>

        <button onClick={submit} disabled={!url || busy} className="btn-key btn-stop">
          {busy ? "⬇ baixando…" : "⬇ BAIXAR MÚSICA"}
        </button>
      </div>

      <JobView job={job} error={error} onCancel={cancel} numbered={playlist} />
    </div>
  );
}
