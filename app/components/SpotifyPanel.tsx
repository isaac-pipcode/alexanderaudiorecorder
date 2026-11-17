"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  handleRedirectCallback,
  isConfigured,
  isLoggedIn,
  login,
  logout,
  setClientId,
} from "../lib/spotifyAuth";
import { getCurrentTrack, type Track } from "../lib/spotifyApi";
import { basename, desktop } from "../lib/desktop";
import VuMeter from "./VuMeter";

type Recording = {
  id: string;
  title: string;
  artist: string;
  album: string;
  partial: boolean;
  status: "saving" | "saved" | "error";
  path?: string;
  error?: string;
};

type Source = { id: string; label: string };

const POLL_MS = 1500;
const SYSTEM = "system";

export default function SpotifyPanel({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const api = desktop();
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [recording, setRecording] = useState(false);
  const [current, setCurrent] = useState<Track | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [source, setSource] = useState<string>("");

  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const currentTrackRef = useRef<Track | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Client ID vem dos Ajustes; só então tratamos o ?code= do redirect OAuth.
  useEffect(() => {
    (async () => {
      const s = await api?.getSettings();
      if (s?.spotifyClientId) setClientId(s.spotifyClientId);
      await handleRedirectCallback().catch(() => false);
      setAuthed(isLoggedIn());
      setReady(true);
    })();
  }, [api]);

  // Fontes de áudio: loopback do sistema (Win/macOS) + dispositivos de entrada
  // (no Linux, escolha um "Monitor of …"; no macOS, BlackHole/Loopback também servem).
  const loadSources = useCallback(async () => {
    const list: Source[] = [];
    if (api?.platform === "win32") list.push({ id: SYSTEM, label: "🔊 Áudio do sistema (tudo que toca no computador)" });
    if (api?.platform === "darwin") list.push({ id: SYSTEM, label: "🔊 Áudio do sistema (experimental no macOS)" });
    try {
      // pede permissão uma vez para os rótulos dos dispositivos aparecerem
      const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
      tmp.getTracks().forEach((t) => t.stop());
    } catch { /* sem permissão: rótulos vazios */ }
    const devices = await navigator.mediaDevices.enumerateDevices();
    for (const d of devices) {
      if (d.kind === "audioinput" && d.deviceId !== "default" && d.deviceId !== "communications") {
        list.push({ id: d.deviceId, label: `🎙 ${d.label || "Entrada de áudio"}` });
      }
    }
    setSources(list);
    setSource((cur) => {
      if (cur && list.some((s) => s.id === cur)) return cur;
      const monitor = list.find((s) => /monitor|blackhole|loopback|stereo mix|mixagem/i.test(s.label));
      const system = list.find((s) => s.id === SYSTEM);
      // No macOS, um dispositivo virtual (BlackHole) é mais confiável que o loopback.
      const pick = api?.platform === "darwin" ? (monitor ?? system) : (system ?? monitor);
      return (pick ?? list[0])?.id ?? "";
    });
  }, [api]);

  useEffect(() => { if (authed) void loadSources(); }, [authed, loadSources]);

  const saveSegment = useCallback(async (blob: Blob, track: Track, startedAt: number) => {
    const elapsed = (Date.now() - startedAt) / 1000;
    const rec: Recording = {
      id: `${track.id}-${startedAt}`,
      title: track.title,
      artist: track.artist,
      album: track.album,
      partial: elapsed < track.durationSec * 0.9,
      status: "saving",
    };
    setRecordings((prev) => [rec, ...prev]);
    try {
      const path = await api!.saveRecording(await blob.arrayBuffer(), {
        title: track.title, artist: track.artist, album: track.album, coverUrl: track.coverUrl,
      });
      setRecordings((prev) => prev.map((r) => (r.id === rec.id ? { ...r, status: "saved", path } : r)));
    } catch (e) {
      setRecordings((prev) => prev.map((r) =>
        r.id === rec.id ? { ...r, status: "error", error: e instanceof Error ? e.message : String(e) } : r));
    }
  }, [api]);

  const startSegmentRecorder = useCallback((stream: MediaStream, track: Track) => {
    const chunks: BlobPart[] = [];
    const startedAt = Date.now();
    const mr = new MediaRecorder(stream, { mimeType: pickMime(), audioBitsPerSecond: 256_000 });
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(chunks, { type: mr.mimeType });
      if (blob.size > 0) void saveSegment(blob, track, startedAt);
    };
    mr.start(1000);
    mediaRecRef.current = mr;
    currentTrackRef.current = track;
  }, [saveSegment]);

  const flushCurrent = useCallback(() => {
    const rec = mediaRecRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    currentTrackRef.current = null;
  }, []);

  const tick = useCallback(async () => {
    const track = await getCurrentTrack().catch(() => null);
    setCurrent(track);
    const stream = streamRef.current;
    if (!stream) return;

    if (!track || !track.isPlaying) {
      if (mediaRecRef.current?.state === "recording") flushCurrent();
      return;
    }
    const prev = currentTrackRef.current;
    if (!prev || prev.id !== track.id) {
      if (mediaRecRef.current?.state === "recording") mediaRecRef.current.stop();
      startSegmentRecorder(stream, track);
    }
  }, [flushCurrent, startSegmentRecorder]);

  const stop = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    flushCurrent();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setRecording(false);
    setCurrent(null);
  }, [flushCurrent]);

  const openStream = async (): Promise<MediaStream> => {
    if (source === SYSTEM) {
      // O processo principal responde com loopback do sistema, sem diálogo.
      const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      s.getVideoTracks().forEach((t) => { t.stop(); s.removeTrack(t); });
      return s;
    }
    return navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: source },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 2,
      },
    });
  };

  const start = async () => {
    setError(null);
    try {
      const stream = await openStream();
      if (stream.getAudioTracks().length === 0) {
        stream.getTracks().forEach((t) => t.stop());
        setError("Nenhuma trilha de áudio capturada. Escolha outra fonte de áudio.");
        return;
      }
      streamRef.current = stream;
      setRecording(true);
      stream.getAudioTracks()[0].onended = () => stop();
      await tick();
      pollRef.current = setInterval(tick, POLL_MS);
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : "Falha ao iniciar a captura de áudio.") +
        (api?.platform === "darwin"
          ? " — no macOS, libere “Gravação de Tela e Áudio do Sistema” para o app em Ajustes do Sistema › Privacidade."
          : ""));
    }
  };

  useEffect(() => () => stop(), [stop]);

  if (!ready) return <div className="panel text-sm">carregando…</div>;

  if (!isConfigured()) {
    return (
      <div className="panel">
        <h2 className="label-marker text-2xl text-rust">Falta configurar</h2>
        <p className="mt-2 text-sm">
          Informe o <b>Client ID</b> do seu app Spotify na aba Ajustes. É gratuito e
          leva dois minutos; não precisa de client secret.
        </p>
        <button onClick={onOpenSettings} className="btn-key btn-rec mt-4">⚙ ABRIR AJUSTES</button>
      </div>
    );
  }

  return (
    <div className="panel">
      {!authed ? (
        <div className="text-center">
          <h2 className="label-marker text-2xl text-rust">Conecte sua conta</h2>
          <p className="mx-auto mt-2 max-w-md text-sm">
            Entre no Spotify para etiquetar cada faixa automaticamente — como
            escrever o nome da música na capa da fita.
          </p>
          <button onClick={() => login()} className="btn-key btn-rec mt-4">
            ⦿ INSERIR FITA · ENTRAR
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="label-marker text-xl text-ink">Lado A · Gravação</span>
            <button
              onClick={() => { stop(); logout(); setAuthed(false); }}
              className="text-xs text-ink/60 underline hover:text-ink"
            >
              ejetar fita
            </button>
          </div>

          <div className="cassette mt-4">
            <div className="flex items-center justify-between gap-4 px-2">
              <div className={`reel ${recording && current?.isPlaying ? "reel-spin" : ""}`} />
              <div className="tape-window flex-1 text-center">
                {recording ? (
                  current?.isPlaying ? (
                    <span className="label-marker text-mustard">▶ {current.artist} — {current.title}</span>
                  ) : (
                    <span className="text-sm text-paper/60">▮▮ aguardando o play…</span>
                  )
                ) : (
                  <span className="text-sm text-paper/60">▣ fita parada</span>
                )}
              </div>
              <div className={`reel ${recording && current?.isPlaying ? "reel-spin" : ""}`} />
            </div>
            <div className="mt-4">
              <VuMeter stream={streamRef.current} active={recording} />
            </div>
            <div className="mt-3 text-center text-[10px] tracking-[0.3em] text-paper/40">
              NORMAL · POSITION · TYPE&nbsp;I &nbsp;—&nbsp; 90&nbsp;MIN
            </div>
          </div>

          <label className="mt-4 block text-sm">
            <span className="label-marker text-ink">Fonte de áudio</span>
            <div className="mt-1 flex gap-2">
              <select value={source} onChange={(e) => setSource(e.target.value)}
                      disabled={recording} className="field">
                {sources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <button onClick={loadSources} disabled={recording} className="btn-key shrink-0" title="Atualizar lista">⟳</button>
            </div>
          </label>
          {api?.platform === "darwin" && (
            <p className="mt-1 text-xs text-ink/60">
              macOS: se “Áudio do sistema” gravar silêncio, instale o driver gratuito
              BlackHole 2ch, crie um “Dispositivo de Saída Múltipla” (alto-falantes +
              BlackHole) no Configuração de Áudio e MIDI, e escolha BlackHole aqui.
            </p>
          )}
          {api?.platform === "linux" && (
            <p className="mt-1 text-xs text-ink/60">
              Linux: escolha o dispositivo “Monitor of …” da sua saída de som
              (PulseAudio/PipeWire) para gravar o que está tocando.
            </p>
          )}

          <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm">
            <li>Abra o Spotify (app ou web) e dê o play.</li>
            <li>Aperte REC. Cada música vira um arquivo separado, etiquetado e com capa.</li>
            <li>Evite outros sons no computador durante a gravação (o áudio do sistema é capturado inteiro).</li>
          </ol>

          <div className="mt-4 flex gap-3">
            {!recording ? (
              <button onClick={start} disabled={!source} className="btn-key btn-rec">⦿ REC</button>
            ) : (
              <button onClick={stop} className="btn-key btn-stop">■ STOP</button>
            )}
            <button onClick={() => api?.openOutputDir()} className="btn-key">📂 PASTA</button>
          </div>

          {error && <p className="error-box mt-4">{error}</p>}

          {recordings.length > 0 && (
            <div className="mt-6">
              <div className="label-marker mb-2 text-lg text-ink">
                Capa da fita · {recordings.length} faixa(s)
              </div>
              <ul className="cassette-label space-y-2">
                {recordings.map((r, i) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <span className="label-marker mr-2 text-rust">{recordings.length - i}.</span>
                      <span className="font-bold">{r.artist} — {r.title}</span>
                      {r.partial && <span className="ml-2 text-xs text-rust" title="Gravação começou ou terminou no meio da música">(incompleta)</span>}
                      {r.status === "error" && <div className="text-xs text-rust">{r.error}</div>}
                      {r.path && <div className="truncate text-xs text-ink/50">{basename(r.path)}</div>}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {r.status === "saving" && <span className="text-xs">gravando no disco…</span>}
                      {r.path && (
                        <>
                          <button onClick={() => api?.openPath(r.path!)} className="btn-key">▶</button>
                          <button onClick={() => api?.showInFolder(r.path!)} className="btn-key">📂</button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function pickMime(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg"];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "audio/webm";
}
