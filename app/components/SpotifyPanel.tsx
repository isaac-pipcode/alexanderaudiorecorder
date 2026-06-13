"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  handleRedirectCallback,
  isConfigured,
  isLoggedIn,
  login,
  logout,
} from "../lib/spotifyAuth";
import { getCurrentTrack, type Track } from "../lib/spotifyApi";
import { sanitize, downloadBlob } from "../lib/util";
import { toMp3 } from "../lib/ffmpeg";
import VuMeter from "./VuMeter";

type Recording = {
  id: string;
  title: string;
  artist: string;
  album: string;
  blob: Blob; // webm/opus
  mp3?: Blob;
  converting?: boolean;
};

const POLL_MS = 1500;

export default function SpotifyPanel() {
  const [authed, setAuthed] = useState(false);
  const [recording, setRecording] = useState(false);
  const [current, setCurrent] = useState<Track | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const currentTrackRef = useRef<Track | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    handleRedirectCallback().finally(() => setAuthed(isLoggedIn()));
  }, []);

  const flushCurrent = useCallback(() => {
    const rec = mediaRecRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    currentTrackRef.current = null;
  }, []);

  const startSegmentRecorder = useCallback((stream: MediaStream, track: Track) => {
    chunksRef.current = [];
    const mr = new MediaRecorder(stream, { mimeType: pickMime() });
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mr.mimeType });
      chunksRef.current = [];
      if (blob.size > 0) {
        setRecordings((prev) => [
          {
            id: `${track.id}-${Date.now()}`,
            title: track.title,
            artist: track.artist,
            album: track.album,
            blob,
          },
          ...prev,
        ]);
      }
    };
    mr.start();
    mediaRecRef.current = mr;
    currentTrackRef.current = track;
  }, []);

  const tick = useCallback(async () => {
    const track = await getCurrentTrack();
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

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      if (stream.getAudioTracks().length === 0) {
        stream.getTracks().forEach((t) => t.stop());
        setError(
          "Nenhuma trilha de áudio capturada. Ao compartilhar, marque a opção " +
            "“Compartilhar áudio da aba” (ou compartilhe a tela inteira com áudio do sistema)."
        );
        return;
      }
      stream.getVideoTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      setRecording(true);
      stream.getAudioTracks()[0].onended = () => stop();
      await tick();
      pollRef.current = setInterval(tick, POLL_MS);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao iniciar a captura de áudio.");
    }
  }, [tick]);

  const stop = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    flushCurrent();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setRecording(false);
    setCurrent(null);
  }, [flushCurrent]);

  useEffect(() => () => stop(), [stop]);

  const convert = useCallback(async (rec: Recording) => {
    setRecordings((prev) =>
      prev.map((r) => (r.id === rec.id ? { ...r, converting: true } : r))
    );
    try {
      const mp3 = await toMp3(rec.blob, {
        title: rec.title,
        artist: rec.artist,
        album: rec.album,
      });
      setRecordings((prev) =>
        prev.map((r) => (r.id === rec.id ? { ...r, mp3, converting: false } : r))
      );
    } catch {
      setRecordings((prev) =>
        prev.map((r) => (r.id === rec.id ? { ...r, converting: false } : r))
      );
      setError("Falha na conversão para MP3. Você ainda pode baixar o WebM.");
    }
  }, []);

  if (!isConfigured()) {
    return (
      <div className="panel">
        <h2 className="label-marker text-2xl text-rust">Falta configurar</h2>
        <p className="mt-2 text-sm">
          Defina <code className="text-rust">NEXT_PUBLIC_SPOTIFY_CLIENT_ID</code> nas
          variáveis de ambiente do Vercel. Crie um app em{" "}
          <a className="text-rust underline" href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">
            developer.spotify.com
          </a>{" "}
          e adicione a Redirect URI{" "}
          <code>{typeof window !== "undefined" ? `${window.location.origin}/spotify` : "/spotify"}</code>.
        </p>
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
              onClick={() => { logout(); setAuthed(false); }}
              className="text-xs underline text-ink/60 hover:text-ink"
            >
              ejetar fita
            </button>
          </div>

          {/* ── A FITA CASSETE ── */}
          <div className="cassette mt-4">
            <div className="flex items-center justify-between gap-4 px-2">
              <div className={`reel ${recording && current?.isPlaying ? "reel-spin" : ""}`} />
              <div className="tape-window flex-1 text-center">
                {recording ? (
                  current?.isPlaying ? (
                    <span className="label-marker text-mustard">
                      ▶ {current.artist} — {current.title}
                    </span>
                  ) : (
                    <span className="text-sm text-paper/60">▮▮ aguardando o play…</span>
                  )
                ) : (
                  <span className="text-sm text-paper/60">▣ fita parada</span>
                )}
              </div>
              <div className={`reel ${recording && current?.isPlaying ? "reel-spin" : ""}`} />
            </div>

            {/* VU meter analógico estéreo */}
            <div className="mt-4">
              <VuMeter stream={streamRef.current} active={recording} />
            </div>

            <div className="mt-3 text-center text-[10px] tracking-[0.3em] text-paper/40">
              NORMAL · POSITION · TYPE&nbsp;I &nbsp;—&nbsp; 90&nbsp;MIN
            </div>
          </div>

          <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm">
            <li>Abra o Spotify (web ou app) e dê o play.</li>
            <li>Aperte REC e compartilhe a aba/tela <b>com áudio</b>.</li>
            <li>Cada música vira uma faixa separada, etiquetada sozinha.</li>
          </ol>

          <div className="mt-4 flex gap-3">
            {!recording ? (
              <button onClick={start} className="btn-key btn-rec">⦿ REC</button>
            ) : (
              <button onClick={stop} className="btn-key btn-stop">■ STOP</button>
            )}
          </div>

          {error && (
            <p className="mt-4 border-2 border-rust bg-rust/10 p-3 text-sm text-ink">{error}</p>
          )}

          {recordings.length > 0 && (
            <div className="mt-6">
              <div className="label-marker mb-2 text-lg text-ink">
                Capa da fita · {recordings.length} faixa(s)
              </div>
              <ul className="cassette-label space-y-2">
                {recordings.map((r, i) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <span className="label-marker mr-2 text-rust">{i + 1}.</span>
                      <span className="font-bold">{r.artist} — {r.title}</span>
                      <span className="ml-2 text-ink/50">({r.album})</span>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {r.mp3 ? (
                        <button
                          onClick={() => downloadBlob(r.mp3!, `${sanitize(`${r.artist} - ${r.title}`)}.mp3`)}
                          className="btn-key"
                        >
                          ⬇ MP3
                        </button>
                      ) : (
                        <button onClick={() => convert(r)} disabled={r.converting} className="btn-key">
                          {r.converting ? "gravando…" : "→ MP3"}
                        </button>
                      )}
                      <button
                        onClick={() => downloadBlob(r.blob, `${sanitize(`${r.artist} - ${r.title}`)}.webm`)}
                        className="btn-key"
                      >
                        ⬇ WEBM
                      </button>
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
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) {
      return c;
    }
  }
  return "audio/webm";
}
