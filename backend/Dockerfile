FROM python:3.12-slim

# Deno: runtime JS exigido pelo yt-dlp para extrair o YouTube (EJS).
COPY --from=denoland/deno:bin /deno /usr/local/bin/deno

# ffmpeg + ffprobe são necessários para cortar/converter o áudio.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV OUTPUT_DIR=/app/output
EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
