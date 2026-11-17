"use client";

export type AudioFormat = "m4a" | "mp3" | "opus" | "flac";

const HINTS: Record<AudioFormat, string> = {
  m4a: "M4A (AAC): formato nativo do YouTube — sem reconversão, quase instantâneo.",
  mp3: "MP3: reconverte no seu computador. Compatível com tudo; leva alguns segundos por música.",
  opus: "Opus: o áudio de maior qualidade do YouTube, sem reconversão. Menos compatível com players antigos.",
  flac: "FLAC: contêiner sem perdas. Não recupera qualidade da fonte (que já é comprimida); útil para fluxos de edição.",
};

export default function FormatPicker({
  value, onChange,
}: { value: AudioFormat; onChange: (f: AudioFormat) => void }) {
  return (
    <div>
      <span className="label-marker text-ink">Formato de saída</span>
      <div className="mt-1 flex flex-wrap gap-2">
        {(Object.keys(HINTS) as AudioFormat[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => onChange(f)}
            className={`btn-key ${value === f ? "btn-stop" : ""}`}
          >
            {f.toUpperCase()}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-ink/60">{HINTS[value]}</p>
    </div>
  );
}
