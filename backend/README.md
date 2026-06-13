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

## Deploy (Railway / Fly.io / Render)

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

## Notas para produção

- Os jobs ficam **em memória**: reiniciar o serviço perde o histórico. Para produção,
  troque por Redis/DB + uma fila (RQ/Celery).
- Limpe a pasta `output/` periodicamente (cron) para não encher o disco.
- Considere rate limiting e validação de URL.
