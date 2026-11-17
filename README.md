# Alexander Audio Tools — app desktop

App para **Windows, macOS e Linux** que grava músicas do Spotify e baixa/corta
áudio e vídeo do YouTube em arquivos organizados, com metadados e capa.
Tudo roda no computador do usuário: não há servidor, Render nem Vercel.

| Aba | O que faz | Motor |
|-----|-----------|-------|
| **REC · Fita K7** | Grava o que toca no Spotify; uma faixa por arquivo (MP3 320k / M4A / FLAC), etiquetada e com capa | Captura de áudio do Chromium + Spotify Web API + ffmpeg nativo |
| **Splice · YouTube** | Corta um vídeo em faixas, por capítulos ou silêncios | yt-dlp + ffmpeg |
| **Dub · Baixar** | Baixa a música inteira (ou a playlist) | yt-dlp |
| **Vídeo** | Baixa o MP4 (até 4K), com capítulos e thumbnail | yt-dlp + ffmpeg |
| **Ajustes** | Pasta de saída, Client ID do Spotify, cookies do navegador, atualização do yt-dlp | — |

A proposta técnica da migração web → desktop está em
[`docs/PROPOSTA-DESKTOP.md`](./docs/PROPOSTA-DESKTOP.md).

## Instalar (usuário final)

Baixe o instalador da página **Releases** do repositório:

- **Windows:** `AlexanderAudioTools-x.y.z-win-x64.exe`. Sem assinatura de código,
  o SmartScreen avisa: clique em *Mais informações › Executar assim mesmo*.
- **macOS:** `…-mac-arm64.dmg` (Apple Silicon) ou `…-mac-x64.dmg` (Intel). Sem
  notarização: na primeira vez, clique com o botão direito no app › *Abrir*. Se o
  macOS disser que o app “está danificado”, rode no Terminal:
  ```bash
  xattr -cr "/Applications/Alexander Audio Tools.app"
  ```
- **Linux:** `.AppImage` (qualquer distro; `chmod +x` e execute) ou `.deb`.

No primeiro uso do YouTube, o app baixa o `yt-dlp` oficial (≈35 MB) para a pasta
de dados do usuário. Ele pode ser atualizado em *Ajustes › Atualizar yt-dlp*.

### Configurar o Spotify (uma vez)

1. Crie um app em <https://developer.spotify.com/dashboard> (marque *Web API*).
2. Em *Redirect URIs*, cadastre exatamente: `http://127.0.0.1:47816/spotify`
3. Copie o **Client ID** para *Ajustes › Spotify* no app. Não há client secret.

### Fonte de áudio para gravar o Spotify

- **Windows:** “Áudio do sistema” (loopback), sem configuração.
- **macOS:** “Áudio do sistema” é experimental. O caminho garantido é instalar o
  [BlackHole 2ch](https://existential.audio/blackhole/), criar um *Dispositivo de
  Saída Múltipla* (alto-falantes + BlackHole) e escolher BlackHole no app.
- **Linux:** escolha o dispositivo “Monitor of …” da sua saída (PulseAudio/PipeWire).

## Desenvolvimento

Requer Node 22.

```bash
npm install
```

```bash
npm run dev
```

`npm run dev` sobe o Next em `http://127.0.0.1:47816` e abre o Electron
apontando para ele (hot reload na UI; reinicie para mudanças em `electron/`).

```bash
npm run dist
```

Gera o instalador da plataforma atual em `release/`. Para todas as plataformas,
use o workflow **Desktop build** (GitHub Actions): manualmente gera artifacts;
ao enviar uma tag `v*`, publica um Release.

### Estrutura

```
app/                 UI (Next.js, exportada como estático em out/)
  components/        painéis de cada aba + JobView/Shell/SettingsPanel
  lib/desktop.ts     tipos da ponte window.aat
  lib/useJob.ts      hook de jobs (progresso via IPC)
electron/            processo principal (TypeScript → dist-electron/)
  main.ts            janela, servidor local 127.0.0.1:47816, IPC, captura de áudio
  preload.ts         ponte segura (contextBridge)
  youtube.ts         motor de download/corte (port do antigo backend/splitter.py)
  recorder.ts        finalização das gravações do Spotify
  binaries.ts        ffmpeg empacotado, yt-dlp baixado/atualizado, runtime JS
  settings.ts        preferências em JSON no userData
```

## Aviso

Para uso pessoal/educacional. Respeite os direitos autorais e os Termos de
Serviço do Spotify e do YouTube.
