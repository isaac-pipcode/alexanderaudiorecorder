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

  // Refs para o estado mutável do loop de gravação.
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const currentTrackRef = useRef<Track | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    handleRedirectCallback().finally(() => setAuthed(isLoggedIn()));
  }, []);

  // Salva a faixa que estava sendo gravada com os metadados certos.
  const flushCurrent = useCallback(() => {
    const rec = mediaRecRef.current;
    const track = currentTrackRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop(); // dispara onstop, que monta o Blob
    }
    currentTrackRef.current = null;
    void track;
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
      // Pausado/parado: fecha a faixa atual (igual ao script original).
      if (mediaRecRef.current?.state === "recording") flushCurrent();
      return;
    }

    const prev = currentTrackRef.current;
    if (!prev || prev.id !== track.id) {
      // Trocou de faixa: fecha a anterior e abre a nova.
      if (mediaRecRef.current?.state === "recording") {
        mediaRecRef.current.stop();
      }
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
      // Não precisamos do vídeo — economiza recursos.
      stream.getVideoTracks().forEach((t) => t.stop());

      streamRef.current = stream;
      setRecording(true);

      // Se o usuário encerrar o compartilhamento pela barra do navegador.
      stream.getAudioTracks()[0].onended = () => stop();

      await tick();
      pollRef.current = setInterval(tick, POLL_MS);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Falha ao iniciar a captura de áudio."
      );
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
      <Card>
        <h2 className="text-lg font-semibold">Configuração necessária</h2>
        <p className="mt-2 text-sm text-neutral-400">
          Defina <code className="text-brand">NEXT_PUBLIC_SPOTIFY_CLIENT_ID</code> nas
          variáveis de ambiente do Vercel. Crie um app em{" "}
          <a className="text-brand underline" href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">
            developer.spotify.com
          </a>{" "}
          e adicione a Redirect URI <code>{typeof window !== "undefined" ? `${window.location.origin}/spotify` : "/spotify"}</code>.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      {!authed ? (
        <div>
          <h2 className="text-lg font-semibold">Conectar ao Spotify</h2>
          <p className="mt-2 text-sm text-neutral-400">
            Faça login para detectar a faixa atual e nomear as gravações automaticamente.
          </p>
          <button onClick={() => login()} className="btn-primary mt-4">
            Entrar com Spotify
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Gravador</h2>
            <button
              onClick={() => { logout(); setAuthed(false); }}
              className="text-xs text-neutral-500 hover:text-neutral-300"
            >
              Sair
            </button>
          </div>

          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-neutral-400">
            <li>Abra o Spotify (web player ou app) e comece a tocar.</li>
            <li>Clique em “Iniciar gravação” e compartilhe a aba/tela <b>com áudio</b>.</li>
            <li>Cada troca de faixa vira um arquivo separado, nomeado automaticamente.</li>
          </ol>

          <div className="mt-4 flex gap-3">
            {!recording ? (
              <button onClick={start} className="btn-primary">● Iniciar gravação</button>
            ) : (
              <button onClick={stop} className="btn-danger">■ Parar</button>
            )}
          </div>

          {recording && (
            <div className="mt-4 rounded-md border border-neutral-800 bg-neutral-950 p-3 text-sm">
              {current?.isPlaying ? (
                <span className="text-brand">
                  ▶ Gravando: {current.artist} — {current.title}
                </span>
              ) : (
                <span className="text-neutral-500">Aguardando reprodução no Spotify…</span>
              )}
            </div>
          )}

          {error && (
            <p className="mt-4 rounded-md bg-red-950/50 p-3 text-sm text-red-300">{error}</p>
          )}

          {recordings.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold text-neutral-300">
                Gravações ({recordings.length})
              </h3>
              <ul className="space-y-2">
                {recordings.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-neutral-800 bg-neutral-950 p-3 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{r.artist} — {r.title}</div>
                      <div className="truncate text-xs text-neutral-500">{r.album}</div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {r.mp3 ? (
                        <button
                          onClick={() => downloadBlob(r.mp3!, `${sanitize(`${r.artist} - ${r.title}`)}.mp3`)}
                          className="btn-small"
                        >
                          ⬇ MP3
                        </button>
                      ) : (
                        <button
                          onClick={() => convert(r)}
                          disabled={r.converting}
                          className="btn-small"
                        >
                          {r.converting ? "Convertendo…" : "→ MP3"}
                        </button>
                      )}
                      <button
                        onClick={() => downloadBlob(r.blob, `${sanitize(`${r.artist} - ${r.title}`)}.webm`)}
                        className="btn-small-ghost"
                      >
                        ⬇ WebM
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Card>
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

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
      {children}
    </div>
  );
}
