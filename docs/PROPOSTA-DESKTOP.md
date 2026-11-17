# Proposta: migração do Alexander Audio Tools para app desktop

**Status:** implementada no branch `claude/intelligent-tesla-6jgsnl`. A versão
web (Vercel + Render) está suspensa; o código anterior está preservado no
histórico do git (commit `32a457f`).

## 1. Diagnóstico da arquitetura web

A versão online dependia de três peças, cada uma com um custo estrutural:

| Peça | Problema |
|------|----------|
| **Backend no Render (FastAPI + yt-dlp)** | IP de datacenter bloqueado pelo YouTube (HTTP 429/403, “confirm you’re not a bot”), o que exigiu cookies em base64, endpoint de diagnóstico e reexportação periódica. CPU do plano gratuito tornava a conversão para MP3 lenta. Jobs em memória (perdidos no restart), limpeza por TTL, CORS e cold start. |
| **Frontend no Vercel** | Precisava de `NEXT_PUBLIC_YOUTUBE_API_URL` e de `NEXT_PUBLIC_SPOTIFY_CLIENT_ID` no build. Os arquivos eram servidos pelo backend e baixados de novo pelo navegador. |
| **ffmpeg.wasm** | Baixado do unpkg a cada sessão (~30 MB), single-thread, lento para MP3 320k. |

O ponto decisivo é o primeiro: o bloqueio por IP não é contornável de forma
estável num servidor. No computador do usuário, o yt-dlp usa a conexão
residencial, que o YouTube trata como tráfego comum.

## 2. Arquitetura adotada

**Electron + motor portado de Python para o processo principal (Node/TypeScript),
chamando binários nativos.**

```
┌──────────── Electron ───────────────────────────────────────────┐
│ Renderer (UI Next.js exportada)  ◄── IPC (contextBridge) ──►  Main │
│   http://127.0.0.1:47816                                        │
│                                   main: servidor estático local │
│                                         jobs yt-dlp / ffmpeg    │
│                                         captura de áudio        │
│                                         preferências (JSON)     │
└──────────────────────────────────────────────────────────────────┘
      │ spawn                         │ spawn
      ▼                               ▼
  yt-dlp (binário oficial,        ffmpeg (ffmpeg-static,
  baixado no 1º uso, -U)          empacotado no instalador)
      │ runtime JS para desafios do YouTube
      ▼
  o próprio Electron com ELECTRON_RUN_AS_NODE=1
```

### Alternativas descartadas

- **Tauri + Python via PyInstaller (sidecar).** Instalador menor (~15 MB contra
  ~110 MB), mas exige toolchain Rust, mantém dois runtimes (Rust + Python
  congelado) e congela a versão do yt-dlp dentro do sidecar. O yt-dlp precisa de
  atualização a cada poucas semanas porque o YouTube muda os extratores; congelar
  a versão faria o app quebrar entre releases.
- **Electron + backend Python embutido.** Mantém o código existente, mas soma ao
  Electron um interpretador Python inteiro e um servidor HTTP interno. O backend
  tinha cerca de 490 linhas; portá-lo custou menos do que empacotá-lo.
- **PWA.** Não resolve: o navegador não executa yt-dlp nem ffmpeg nativo.

### Decisões que sustentam a escolha (verificadas)

1. **Sem Deno.** O backend precisava do Deno para os desafios JS do YouTube. O
   yt-dlp oficial (2026.10.26) traz o solver EJS embutido e aceita `node` como
   runtime. Passando o executável do Electron com `ELECTRON_RUN_AS_NODE=1`, o
   log mostra `[jsc:node] Solving JS challenges using node`. Também foi
   confirmado que o fuse `RunAsNode` fica ativo no binário empacotado.
2. **yt-dlp fora do instalador.** É baixado do GitHub no primeiro uso e
   atualizado por `yt-dlp -U` (botão em Ajustes). Assim ele acompanha o YouTube
   sem depender de um novo release do app.
3. **Servidor local em `127.0.0.1:47816`.** A UI é servida por um servidor HTTP
   local, com CSP, em vez de `file://`. A origem fixa permite manter o OAuth
   PKCE do Spotify sem backend, com Redirect URI de loopback
   `http://127.0.0.1:47816/spotify` (o Spotify exige IP literal de loopback para
   `http`). O `localStorage` também persiste entre execuções.
4. **IPC com verificação de origem.** O main recusa chamadas de qualquer frame
   fora da origem local (testado: uma página `data:` recebe “origem não
   autorizada”). Renderer em sandbox, `contextIsolation` ligado e
   `nodeIntegration` desligado.

## 3. Mapa de mudanças

| Antes (web) | Depois (desktop) |
|-------------|------------------|
| `backend/main.py` (FastAPI, jobs em memória, `/files`) | `electron/youtube.ts`: jobs no main, progresso por evento IPC, cancelamento real (mata a árvore de processos) |
| `backend/splitter.py` | Portado para `youtube.ts`, com as correções da seção 4 |
| Cookies via `YT_COOKIES_B64` / `/debug/cookies` | `--cookies-from-browser` opcional (Firefox, Chrome, Edge, Brave, Safari…), quase nunca necessário |
| `render.yaml`, `backend/Dockerfile`, `vercel.json` | Removidos |
| `ffmpeg.wasm` via unpkg | `ffmpeg-static` nativo (`electron/recorder.ts`) |
| Download pelo navegador (blob/URL) | Gravação direta em pasta organizada + botões Abrir / Mostrar na pasta |
| `NEXT_PUBLIC_*` no build | Client ID do Spotify configurado no app (aba Ajustes) |
| Três painéis com polling HTTP duplicado | Hook `useJob` + componente `JobView` compartilhados |
| `getDisplayMedia` com diálogo de compartilhar aba | Handler no main: loopback do sistema (Windows) ou escolha de dispositivo de entrada |
| Deploy manual em dois provedores | GitHub Actions gera `.exe`, `.dmg` (arm64/x64), `.AppImage` e `.deb`; uma tag `v*` publica o Release |

## 4. Novas ferramentas e funcionalidades

**Bibliotecas e binários**

- `electron` 38, `electron-builder` 26: janela, empacotamento e instaladores.
- `ffmpeg-static` (ffmpeg 7.0.2): conversão e corte nativos.
- yt-dlp standalone: inclui `mutagen`, `curl_cffi` e o solver EJS, o que
  permite embutir capa em m4a e personificar o TLS do navegador quando preciso.
- Removidos: `@ffmpeg/ffmpeg`, `@ffmpeg/util`, FastAPI, uvicorn e pydantic.
  `next` e `react` passaram a ser dependências só de build.

**Funcionalidades novas**

- **Metadados e capa em tudo:** gravações do Spotify recebem título, artista,
  álbum e capa (via Web API); downloads do YouTube recebem `--embed-metadata` e
  thumbnail; faixas cortadas recebem título, número `n/N`, álbum (título do
  vídeo), artista (canal) e capa.
- **Formatos:** M4A, MP3, Opus e FLAC no YouTube; MP3 320k, M4A 256k e FLAC nas
  gravações do Spotify.
- **Playlists** inteiras nas abas Baixar e Vídeo, em subpasta numerada. Antes,
  timeouts do servidor tornavam isso inviável.
- **Vídeo até 4K**, com capítulos embutidos.
- **Cancelamento** de qualquer job em andamento.
- **Gravação contínua do Spotify:** cada faixa é convertida e salva assim que
  termina, sem clique manual “→ MP3”. Faixas gravadas a partir do meio são
  marcadas como *incompleta*.
- **Painéis persistentes:** trocar de aba não interrompe gravação nem downloads.

**Correções feitas no port**

- Corte por silêncio agora usa o **ponto médio** de cada silêncio (antes era o
  início, o que empurrava todo o silêncio para a faixa seguinte).
- O seek passou para antes de `-i`, o que dá corte rápido.
- Arquivos finais são identificados por `--print after_move:filepath`, não mais
  por “arquivo mais recente da pasta”, que sofria condição de corrida.
- Nomes de arquivo nunca sobrescrevem: o app acrescenta `(2)`, `(3)`.

## 5. Riscos e pendências

| Item | Situação | Ação sugerida |
|------|----------|---------------|
| **Áudio do sistema no macOS** | O Electron documenta loopback **só no Windows**. Ativei flags do Chromium (`MacLoopbackAudioForScreenShare`, `MacCatapLoopbackAudioForScreenShare`) que devem habilitá-lo no macOS 13+/14.2+, mas **não verifiquei em hardware Apple**. | Testar num Mac. Enquanto isso, a UI rotula a opção como experimental e prioriza o BlackHole quando ele existe. |
| **Linux sem loopback** | Usa dispositivos “Monitor of …” (PulseAudio/PipeWire). Não testado com áudio real (container sem som). | Testar em desktop Linux. |
| **Assinatura de código** | Instaladores não assinados: SmartScreen no Windows e Gatekeeper no macOS mostram avisos. Não confirmei se o electron-builder faz assinatura ad-hoc no build arm64 sem identidade; o README documenta `xattr -cr` como contorno. | Apple Developer (US$ 99/ano) para notarizar. Certificado Windows OV/EV ou Azure Trusted Signing. |
| **Tamanho** | ~110–150 MB por instalador. O AppImage tem 147 MB, dos quais 77 MB são o ffmpeg estático. | Aceitável. Para reduzir: build de ffmpeg só com os codecs usados. |
| **Licença** | O binário do ffmpeg-static é GPL. Distribuí-lo obriga a oferecer o código-fonte correspondente. | Incluir aviso e link para o fonte nos Releases. |
| **Transcodificação dupla no Spotify** | A captura sai em Opus (MediaRecorder) e é reconvertida para MP3/FLAC. Gravar em FLAC não recupera o que o Opus descartou. | Próximo passo: capturar PCM via `AudioWorklet` e gravar WAV intermediário sem perdas. |
| **Auto-update do app** | Não implementado; o `publish: github` já gera `latest*.yml`. | Adicionar `electron-updater` quando houver assinatura (no macOS ele exige app assinado). |
| **Porta 47816 ocupada** | O app avisa e encerra. A porta é fixa porque a Redirect URI do Spotify depende dela. | Raro. Se ocorrer com frequência, oferecer porta alternativa e mostrar a URI correspondente. |

## 6. Verificação realizada

Em Linux x64 (container, Xvfb), via Playwright controlando o Electron:

- UI carrega do servidor local, com fontes self-hosted (offline) e todas as abas renderizando.
- `toolsStatus`: yt-dlp 2026.10.26, ffmpeg 7.0.2, runtime JS Electron/Node 22.22.0.
- Gravação sintética (Opus via MediaRecorder) salva como MP3 e como FLAC em
  `Spotify/<Artista>/`, com sanitização de nome. No app **empacotado** isso
  confirma o caminho `app.asar.unpacked` do ffmpeg.
- Comandos de corte com capa (`m4a`, `mp3`) e conversão com capa
  (`mp3`, `m4a`, `flac`) validados com ffmpeg-static. O teste revelou e
  corrigiu um bug de ordem do `-t`.
- Job de YouTube real: o fluxo de erro funciona. O download em si recebeu
  **HTTP 403**, porque o IP de datacenter do container é bloqueado (o mesmo
  problema do Render). **O download completo pelo YouTube não pôde ser
  verificado aqui** e precisa de teste numa máquina doméstica.
- `electron-builder` gerou `.AppImage` e `.deb`. Windows e macOS dependem do
  workflow de CI, que ainda não rodou.
