"use client";

import { useCallback, useEffect, useState } from "react";
import { desktop, type Settings, type ToolsStatus } from "../lib/desktop";

const BROWSERS = [
  ["", "Nenhum (padrão)"],
  ["firefox", "Firefox"],
  ["chrome", "Chrome"],
  ["edge", "Edge"],
  ["brave", "Brave"],
  ["chromium", "Chromium"],
  ["opera", "Opera"],
  ["vivaldi", "Vivaldi"],
  ["safari", "Safari (macOS)"],
] as const;

export default function SettingsPanel({ onChange }: { onChange?: (s: Settings) => void }) {
  const api = desktop();
  const [s, setS] = useState<Settings | null>(null);
  const [tools, setTools] = useState<ToolsStatus | null>(null);
  const [toolMsg, setToolMsg] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [clientId, setClientId] = useState("");

  const refreshTools = useCallback(async () => {
    if (api) setTools(await api.toolsStatus());
  }, [api]);

  useEffect(() => {
    if (!api) return;
    api.getSettings().then((v) => { setS(v); setClientId(v.spotifyClientId); });
    void refreshTools();
  }, [api, refreshTools]);

  const patch = async (p: Partial<Settings>) => {
    if (!api) return;
    const next = await api.setSettings(p);
    setS(next);
    onChange?.(next);
  };

  const updateYtdlp = async () => {
    if (!api) return;
    setUpdating(true);
    setToolMsg(null);
    try {
      setToolMsg(tools?.ytdlp ? await api.updateYtdlp() : `instalado: ${await api.installYtdlp()}`);
    } catch (e) {
      setToolMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setUpdating(false);
      void refreshTools();
    }
  };

  if (!api || !s) return null;
  const redirect = `${window.location.origin}/spotify`;

  return (
    <div className="panel space-y-6">
      <div className="flex items-center justify-between">
        <span className="label-marker text-xl text-ink">⚙ Bancada técnica</span>
        <span className="text-2xl">🔧</span>
      </div>

      <section>
        <h3 className="label-marker text-lg text-rust">Pasta de saída</h3>
        <div className="mt-1 flex gap-2">
          <input readOnly value={s.outputDir} className="field" />
          <button onClick={async () => { const n = await api.chooseOutputDir(); setS(n); onChange?.(n); }}
                  className="btn-key shrink-0">ESCOLHER</button>
          <button onClick={() => api.openOutputDir()} className="btn-key shrink-0">📂</button>
        </div>
        <p className="mt-1 text-xs text-ink/60">
          Subpastas: <code>Spotify/Artista</code>, <code>YouTube/</code>, <code>YouTube/Título do vídeo</code> (cortes) e <code>Vídeos/</code>.
        </p>
      </section>

      <section>
        <h3 className="label-marker text-lg text-rust">Metadados</h3>
        <label className="mt-1 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={s.embedCover}
                 onChange={(e) => patch({ embedCover: e.target.checked })} />
          Embutir capa do álbum / thumbnail nos arquivos
        </label>
      </section>

      <section>
        <h3 className="label-marker text-lg text-rust">Spotify</h3>
        <label className="mt-1 block text-sm">
          Client ID do seu app Spotify
          <div className="mt-1 flex gap-2">
            <input value={clientId} onChange={(e) => setClientId(e.target.value.trim())}
                   placeholder="ex.: 1a2b3c4d5e…" className="field" />
            <button onClick={() => patch({ spotifyClientId: clientId })}
                    disabled={clientId === s.spotifyClientId} className="btn-key shrink-0">SALVAR</button>
          </div>
        </label>
        <p className="mt-1 text-xs text-ink/60">
          Crie um app em{" "}
          <button className="underline" onClick={() => api.openExternal("https://developer.spotify.com/dashboard")}>
            developer.spotify.com/dashboard
          </button>{" "}
          (API: Web API) e cadastre a Redirect URI <code className="select-all">{redirect}</code>.
          Não precisa de client secret.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          Formato das gravações:
          {(["mp3", "m4a", "flac"] as const).map((f) => (
            <button key={f} onClick={() => patch({ spotifyFormat: f })}
                    className={`btn-key ${s.spotifyFormat === f ? "btn-stop" : ""}`}>
              {f === "mp3" ? "MP3 320k" : f === "m4a" ? "M4A 256k" : "FLAC"}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="label-marker text-lg text-rust">YouTube · cookies</h3>
        <label className="mt-1 block text-sm">
          Usar os cookies do navegador:
          <select value={s.cookiesBrowser} onChange={(e) => patch({ cookiesBrowser: e.target.value })}
                  className="field mt-1">
            {BROWSERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <p className="mt-1 text-xs text-ink/60">
          Normalmente desnecessário: o app usa a sua conexão residencial. Ative só se
          o YouTube pedir “confirme que você não é um robô” ou para vídeos com
          restrição de idade/membros. No Windows, o Chrome/Edge bloqueiam a leitura
          dos cookies; prefira o Firefox.
        </p>
      </section>

      <section>
        <h3 className="label-marker text-lg text-rust">Motores</h3>
        {tools && (
          <ul className="cassette-label mt-1 space-y-1 text-sm">
            <li>yt-dlp: <b>{tools.ytdlp ?? "não instalado (baixa no 1º uso)"}</b></li>
            <li>ffmpeg: <b>{tools.ffmpeg ?? "indisponível"}</b></li>
            <li>Runtime JS: <b>{tools.jsRuntime}</b></li>
            <li>App: <b>v{tools.appVersion}</b> · {tools.platform}/{tools.arch}</li>
          </ul>
        )}
        <button onClick={updateYtdlp} disabled={updating} className="btn-key mt-2">
          {updating ? "atualizando…" : tools?.ytdlp ? "⟳ ATUALIZAR YT-DLP" : "⬇ INSTALAR YT-DLP"}
        </button>
        {toolMsg && <p className="mt-1 text-xs text-ink/70">{toolMsg}</p>}
        <button onClick={() => api.openLicenses()} className="btn-key mt-2 ml-2">
          § LICENÇAS
        </button>
        <p className="mt-1 text-xs text-ink/60">
          Se downloads do YouTube começarem a falhar, atualize o yt-dlp primeiro — o
          YouTube muda com frequência e o yt-dlp acompanha.
        </p>
      </section>
    </div>
  );
}
