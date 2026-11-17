"use client";

import { useEffect, useState } from "react";

// Repositório PÚBLICO de onde saem os instaladores (GitHub Releases).
const REPO = process.env.NEXT_PUBLIC_RELEASES_REPO || "isaac-pipcode/alexanderaudiorecorder";
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;

type Platform = "win" | "mac-arm64" | "mac-x64" | "appimage" | "deb";

const TARGETS: { id: Platform; label: string; sub: string; match: RegExp }[] = [
  { id: "win", label: "Windows", sub: "10/11 · 64 bits · .exe", match: /-win-x64\.exe$/ },
  { id: "mac-arm64", label: "macOS Apple Silicon", sub: "M1/M2/M3/M4 · .dmg", match: /-mac-arm64\.dmg$/ },
  { id: "mac-x64", label: "macOS Intel", sub: "Macs até 2020 · .dmg", match: /-mac-x64\.dmg$/ },
  { id: "appimage", label: "Linux", sub: "qualquer distro · .AppImage", match: /\.AppImage$/ },
  { id: "deb", label: "Linux Debian/Ubuntu", sub: ".deb", match: /\.deb$/ },
];

type Asset = { name: string; browser_download_url: string; size: number };
type Release = { tag_name: string; published_at: string; html_url: string; assets: Asset[] };

async function detectPlatform(): Promise<Platform | null> {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "win";
  if (/Macintosh|Mac OS X/i.test(ua)) {
    // Chromium informa a arquitetura; Safari não (padrão: Apple Silicon, maioria desde 2020).
    const uad = (navigator as Navigator & {
      userAgentData?: { getHighEntropyValues(h: string[]): Promise<{ architecture?: string }> };
    }).userAgentData;
    try {
      const v = await uad?.getHighEntropyValues(["architecture"]);
      if (v?.architecture === "x86") return "mac-x64";
    } catch { /* ignora */ }
    return "mac-arm64";
  }
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return "appimage";
  return null;
}

const mb = (n: number) => `${Math.round(n / 1_000_000)} MB`;

export default function DownloadPage() {
  const [release, setRelease] = useState<Release | null>(null);
  const [failed, setFailed] = useState(false);
  const [platform, setPlatform] = useState<Platform | null>(null);

  useEffect(() => {
    void detectPlatform().then(setPlatform);
    fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setRelease)
      .catch(() => setFailed(true));
  }, []);

  const assetFor = (p: Platform) =>
    release?.assets.find((a) => TARGETS.find((t) => t.id === p)!.match.test(a.name));
  const sourceAssets = release?.assets.filter((a) => /^ffmpeg-source-.*\.tar\.xz$/.test(a.name)) ?? [];
  const primary = platform ? TARGETS.find((t) => t.id === platform) : null;
  const primaryAsset = platform ? assetFor(platform) : undefined;
  const version = release?.tag_name?.replace(/^v/, "");

  return (
    <main className="space-y-6">
      {/* ── DESTAQUE ── */}
      <div className="panel text-center">
        <span className="label-marker text-2xl text-rust">Agora é um programa de verdade</span>
        <p className="mx-auto mt-2 max-w-xl text-sm">
          Grave o Spotify faixa a faixa, corte álbuns do YouTube em músicas e baixe
          vídeos — tudo no seu computador, sem servidor, sem fila, sem bloqueio.
        </p>

        <div className="cassette mx-auto mt-5 max-w-md">
          <div className="flex items-center justify-between gap-4 px-2">
            <div className="reel reel-spin" />
            <div className="tape-window flex-1 text-center">
              <span className="label-marker text-mustard">
                {version ? `▶ versão ${version}` : "▶ lado A"}
              </span>
            </div>
            <div className="reel reel-spin" />
          </div>
        </div>

        <div className="mt-5">
          {primary && primaryAsset ? (
            <a href={primaryAsset.browser_download_url} className="btn-key btn-rec text-base">
              ⬇ BAIXAR PARA {primary.label.toUpperCase()} · {mb(primaryAsset.size)}
            </a>
          ) : (
            <a href={RELEASES_URL} className="btn-key btn-rec text-base">⬇ BAIXAR</a>
          )}
          {release && (
            <p className="mt-2 text-xs text-ink/60">
              Publicado em {new Date(release.published_at).toLocaleDateString("pt-BR")} ·{" "}
              <a className="underline" href={release.html_url}>notas da versão</a>
            </p>
          )}
          {failed && (
            <p className="mt-2 text-xs text-ink/60">
              Não consegui listar os arquivos aqui; o botão acima leva à página de downloads.
            </p>
          )}
        </div>
      </div>

      {/* ── TODAS AS PLATAFORMAS ── */}
      <div className="panel">
        <span className="label-marker text-xl text-ink">Todas as fitas</span>
        <ul className="cassette-label mt-3 space-y-2">
          {TARGETS.map((t) => {
            const a = assetFor(t.id);
            return (
              <li key={t.id} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  <b>{t.label}</b> <span className="text-ink/60">· {t.sub}</span>
                </span>
                <a href={a?.browser_download_url ?? RELEASES_URL} className="btn-key shrink-0">
                  ⬇ {a ? mb(a.size) : "BAIXAR"}
                </a>
              </li>
            );
          })}
        </ul>
      </div>

      {/* ── INSTALAÇÃO (programa sem assinatura paga) ── */}
      <div className="panel space-y-4 text-sm">
        <span className="label-marker text-xl text-ink">Como instalar</span>
        <p className="text-ink/80">
          O programa é gratuito e não tem certificado pago da Microsoft ou da Apple.
          Por isso o sistema mostra um aviso na primeira vez. É esperado — siga os
          passos abaixo uma única vez.
        </p>
        <div>
          <h3 className="label-marker text-lg text-rust">Windows</h3>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Abra o <code>.exe</code> baixado.</li>
            <li>Se aparecer “O Windows protegeu o computador”, clique em <b>Mais informações</b> → <b>Executar assim mesmo</b>.</li>
          </ol>
        </div>
        <div>
          <h3 className="label-marker text-lg text-rust">macOS</h3>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Abra o <code>.dmg</code> e arraste o app para <b>Aplicativos</b>.</li>
            <li>Abra o app. Se o macOS disser que não pode verificá-lo, clique em <b>OK</b>.</li>
            <li>Vá em <b>Ajustes do Sistema › Privacidade e Segurança</b>, role até o fim e clique em <b>Abrir Mesmo Assim</b>.</li>
            <li>
              Se ainda assim disser que o app “está danificado”, rode no Terminal:
              <pre className="mt-1 overflow-x-auto bg-ink/10 p-2 text-xs">xattr -cr &quot;/Applications/Alexander Audio Tools.app&quot;</pre>
            </li>
          </ol>
        </div>
        <div>
          <h3 className="label-marker text-lg text-rust">Linux</h3>
          <p>
            <b>AppImage:</b> dê permissão de execução (<code>chmod +x</code> ou Propriedades › Permitir executar) e abra.{" "}
            <b>.deb:</b> <code>sudo apt install ./arquivo.deb</code>.
          </p>
        </div>
      </div>

      {/* ── PRIMEIROS PASSOS ── */}
      <div className="panel space-y-2 text-sm">
        <span className="label-marker text-xl text-ink">Primeiros passos</span>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>YouTube</b> (cortar, baixar música ou vídeo): funciona direto. No primeiro uso o programa baixa o motor <code>yt-dlp</code>.</li>
          <li>
            <b>Spotify</b>: crie um app gratuito em{" "}
            <a className="underline" href="https://developer.spotify.com/dashboard">developer.spotify.com</a>,
            cadastre a Redirect URI <code className="select-all">http://127.0.0.1:47816/spotify</code> e
            cole o Client ID na aba <b>Ajustes</b> do programa.
          </li>
          <li>Para gravar o Spotify no macOS, instale o driver gratuito <a className="underline" href="https://existential.audio/blackhole/">BlackHole 2ch</a>; no Linux, escolha a fonte “Monitor of …”.</li>
        </ul>
      </div>

      {/* ── LICENÇAS ── */}
      <p className="text-center text-xs text-ink/60">
        Inclui o FFmpeg (GPLv3).{" "}
        {sourceAssets.length > 0 ? (
          <>Código-fonte: {sourceAssets.map((a, i) => (
            <span key={a.name}>{i > 0 && ", "}<a className="underline" href={a.browser_download_url}>{a.name}</a></span>
          ))}.</>
        ) : (
          <>Código-fonte anexado a cada versão na <a className="underline" href={RELEASES_URL}>página de downloads</a>.</>
        )}{" "}
        Detalhes em <code>THIRD-PARTY-NOTICES</code>, dentro do programa (Ajustes › Licenças).
      </p>
    </main>
  );
}
