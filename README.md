# Alexander Audio Recorder

Interface web única para **gravar músicas do Spotify** e **baixar/cortar áudio do
YouTube** em arquivos MP3 organizados.

Duas abas, dois motores:

| Aba | Onde processa | Deploy |
|-----|---------------|--------|
| **Spotify** | 100% no navegador (`getDisplayMedia` + Spotify Web API + `ffmpeg.wasm`) | Vercel basta |
| **YouTube** | Backend com `yt-dlp` + `ffmpeg` | Backend separado (Railway/Fly) + UI no Vercel |

## Frontend (Vercel)

```bash
npm install
cp .env.example .env.local   # preencha as variáveis
npm run dev
```

### Variáveis de ambiente

- `NEXT_PUBLIC_SPOTIFY_CLIENT_ID` — Client ID do app Spotify (fluxo PKCE, sem secret).
- `NEXT_PUBLIC_YOUTUBE_API_URL` — URL do backend YouTube (deixe vazio para esconder o processamento).

### Deploy no Vercel

1. Conecte este repositório no Vercel (framework detectado: Next.js).
2. Defina as variáveis de ambiente acima.
3. No app Spotify (developer.spotify.com), adicione a Redirect URI:
   `https://SEU-APP.vercel.app/spotify`

## Backend YouTube

Veja [`backend/README.md`](./backend/README.md). Não roda no Vercel.

## Como funciona a aba Spotify

1. Login no Spotify via PKCE (sem expor secret).
2. O navegador captura o áudio da aba/tela via `getDisplayMedia`.
3. A Web API detecta a faixa atual; a cada troca, fecha um arquivo e abre outro.
4. Conversão para MP3 320k com metadados via `ffmpeg.wasm`, tudo client-side.

> Funciona melhor no **Chrome/Edge** (captura de áudio de aba). Firefox/Safari têm
> suporte limitado. Para uso pessoal/educacional — respeite os ToS e direitos autorais.
