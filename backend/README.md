# Backend YouTube (yt-dlp + ffmpeg)

Este serviço **não roda no Vercel** (precisa de `yt-dlp` e `ffmpeg` nativos e de
processamento longo). Deploye separadamente e aponte o frontend para ele via
`NEXT_PUBLIC_YOUTUBE_API_URL`.

## Rodar localmente

```bash
cd backend
pip install -r requirements.txt
# ffmpeg precisa estar instalado no sistema
uvicorn main:app --reload --port 8000
```

## Docker

```bash
docker build -t aar-backend ./backend
docker run -p 8000:8000 \
  -e PUBLIC_BASE_URL=http://localhost:8000 \
  -e ALLOWED_ORIGINS=http://localhost:3000 \
  aar-backend
```

## Deploy no Render (recomendado — via Blueprint)

Há um `render.yaml` na raiz do repositório que já configura tudo.

1. No Render: **New > Blueprint** e selecione o repositório `alexanderaudiorecorder`.
2. O Render lê o `render.yaml`, cria o serviço Docker apontando para `backend/` e
   define `ALLOWED_ORIGINS`. Clique em **Apply**.
3. Aguarde o build. Teste `https://SEU-SERVICO.onrender.com/health` → `{"ok": true}`.
4. No Vercel, defina `NEXT_PUBLIC_YOUTUBE_API_URL` com essa URL e faça redeploy.

> O backend descobre a própria URL via `RENDER_EXTERNAL_URL`, então não é preciso
> definir `PUBLIC_BASE_URL` no Render.

### Deploy manual (sem Blueprint)

**New > Web Service** > conecte o repo > **Runtime: Docker** > **Root Directory: `backend`**.
Defina `ALLOWED_ORIGINS` com a URL do Vercel.

## Deploy em outros hosts (Railway / Fly.io)

1. Aponte o serviço para a pasta `backend/` (usa o `Dockerfile`).
2. Variáveis de ambiente:
   - `PUBLIC_BASE_URL` — URL pública do backend (ex.: `https://meu-backend.up.railway.app`)
   - `ALLOWED_ORIGINS` — URL do app no Vercel (ex.: `https://seu-app.vercel.app`)
3. Copie a URL pública e defina `NEXT_PUBLIC_YOUTUBE_API_URL` no Vercel.

## Endpoints

- `POST /jobs` `{ url, silence_len, silence_thresh }` → `{ id, status }`
- `GET /jobs/{id}` → `{ id, status, message?, files: [{ name, url }] }`
- `GET /files/{id}/...` → download dos MP3s
- `GET /health`

## Contornar bloqueio do YouTube (HTTP 429 / "confirm you're not a bot")

IPs de datacenter (Render, Railway, etc.) costumam ser bloqueados pelo YouTube.
A solução confiável é fornecer **cookies** de uma conta logada:

1. No navegador (logado no YouTube), instale a extensão "Get cookies.txt LOCALLY"
   e exporte **somente os cookies de `youtube.com`** (formato Netscape) → `cookies.txt`.
2. Converta o arquivo para **base64** (recomendado — evita que o painel estrague os TABs):
   - Linux/macOS: `base64 -w0 cookies.txt` (no macOS: `base64 cookies.txt | tr -d '\n'`)
   - Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("cookies.txt"))`
3. No Render: serviço → **Environment** → adicione:
   - `YT_COOKIES_B64` = cole a string base64 (uma linha só)
4. Salve — o Render redeploya e o yt-dlp passa a usar os cookies.

> **Dica importante:** exporte os cookies de uma **janela anônima** e feche-a logo após
> exportar. Assim a sessão não é "rotacionada" pelo navegador, o que invalidaria os cookies.
>
> Use uma conta secundária/descartável: cookies dão acesso à sessão do YouTube.
> Eles expiram, então pode ser preciso reexportar de tempos em tempos.
>
> Alternativas: `YT_COOKIES` (conteúdo cru — frágil por causa dos TABs) ou
> `YT_COOKIES_FILE` (caminho de um Secret File montado no host).

O backend também envia `--retries`, `--extractor-retries` e `--sleep-requests`
automaticamente para reduzir os 429.

## Notas para produção

- Os jobs ficam **em memória**: reiniciar o serviço perde o histórico. Para produção,
  troque por Redis/DB + uma fila (RQ/Celery).
- **Limpeza automática:** a cada novo job, pastas em `output/` mais antigas que
  `CLEANUP_TTL_HOURS` (padrão 6h) são apagadas. Ajuste via variável de ambiente.
- Considere rate limiting e validação de URL.
