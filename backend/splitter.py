"""
Núcleo de download + corte de áudio do YouTube.
Refatorado do script CLI original para uso como serviço:
- sem sys.exit / prints de controle de fluxo (usa exceções)
- caminho do ffmpeg configurável por ambiente
- retorna resultados estruturados
"""

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path


class SplitterError(Exception):
    pass


def _cookie_args() -> list[str]:
    """
    Cookies do YouTube ajudam a contornar o bloqueio de IPs de datacenter
    (HTTP 429 / "Sign in to confirm you're not a bot"). Defina no host UMA destas
    variáveis (em ordem de prioridade):
      - YT_COOKIES_FILE: caminho para um cookies.txt (formato Netscape)
      - YT_COOKIES_B64:  o cookies.txt inteiro codificado em base64 (RECOMENDADO —
                         evita que o painel do host estrague os TABs do arquivo)
      - YT_COOKIES:      o conteúdo do cookies.txt direto na variável (frágil:
                         alguns painéis convertem TAB em espaço e quebram o parse)
    """
    path = os.environ.get("YT_COOKIES_FILE")

    if not path:
        b64 = os.environ.get("YT_COOKIES_B64")
        content = os.environ.get("YT_COOKIES")
        data: str | None = None
        if b64:
            import base64
            try:
                data = base64.b64decode(b64).decode("utf-8")
            except Exception as e:  # noqa: BLE001
                raise SplitterError(f"YT_COOKIES_B64 inválido: {e}")
        elif content:
            data = content

        if data:
            path = os.path.join(tempfile.gettempdir(), "yt_cookies.txt")
            with open(path, "w", encoding="utf-8", newline="\n") as f:
                f.write(data)

    if path and os.path.isfile(path):
        return ["--cookies", path]
    return []


def _common_opts() -> list[str]:
    """Opções compartilhadas para tornar a extração mais resiliente."""
    return [
        "--retries", "5",
        "--extractor-retries", "3",
        "--sleep-requests", "1",
        *_cookie_args(),
    ]


def cookie_status() -> dict:
    """Diagnóstico seguro: diz se os cookies estão chegando, sem vazar conteúdo."""
    status: dict = {
        "render_service": os.environ.get("RENDER_SERVICE_NAME"),
        "render_url": os.environ.get("RENDER_EXTERNAL_URL"),
        # nomes das chaves relacionadas (NUNCA os valores) para detectar typos
        "matching_env_keys": sorted(
            k for k in os.environ
            if "COOK" in k.upper() or k.upper().startswith("YT")
        ),
        "env_YT_COOKIES_B64": bool(os.environ.get("YT_COOKIES_B64")),
        "env_YT_COOKIES": bool(os.environ.get("YT_COOKIES")),
        "env_YT_COOKIES_FILE": os.environ.get("YT_COOKIES_FILE") or None,
        "cookies_active": False,
        "cookie_file": None,
        "cookie_lines": 0,
        "has_youtube_lines": False,
        "error": None,
    }
    try:
        args = _cookie_args()
        if args:
            path = args[1]
            status["cookies_active"] = True
            status["cookie_file"] = path
            with open(path, "r", encoding="utf-8") as f:
                lines = f.read().splitlines()
            status["cookie_lines"] = len(lines)
            status["has_youtube_lines"] = any("youtube.com" in ln for ln in lines)
    except Exception as e:  # noqa: BLE001
        status["error"] = str(e)
    return status


def sanitize(name: str) -> str:
    return re.sub(r'[\\/:*?"<>|]', "_", name).strip()


def _ytdlp_cmd() -> list[str]:
    return [sys.executable, "-m", "yt_dlp"]


def get_video_info(url: str) -> dict:
    result = subprocess.run(
        [*_ytdlp_cmd(), "--dump-json", "--no-playlist", *_common_opts(), url],
        capture_output=True, text=True, encoding="utf-8",
    )
    if result.returncode != 0:
        raise SplitterError(f"yt-dlp falhou: {result.stderr.strip()[:500]}")
    return json.loads(result.stdout)


def download_audio(url: str, output_path: Path) -> Path:
    template = str(output_path / "%(title)s.%(ext)s")
    result = subprocess.run([
        *_ytdlp_cmd(), "--no-playlist",
        "-x", "--audio-format", "mp3", "--audio-quality", "0",
        *_common_opts(),
        "-o", template, url,
    ], capture_output=True, text=True, encoding="utf-8")
    if result.returncode != 0:
        raise SplitterError(f"Download falhou: {result.stderr.strip()[:500]}")

    mp3_files = sorted(output_path.glob("*.mp3"), key=lambda f: f.stat().st_mtime, reverse=True)
    if not mp3_files:
        raise SplitterError("Nenhum MP3 encontrado após o download.")
    return mp3_files[0]


def get_duration(file: Path) -> float:
    result = subprocess.run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(file),
    ], capture_output=True, text=True)
    return float(result.stdout.strip())


def split_by_chapters(mp3: Path, chapters: list, out_dir: Path) -> list[Path]:
    total = get_duration(mp3)
    files: list[Path] = []
    for i, chapter in enumerate(chapters):
        start = chapter["start_time"]
        end = chapter.get("end_time") or (
            chapters[i + 1]["start_time"] if i + 1 < len(chapters) else total
        )
        title = sanitize(chapter["title"])
        out_file = out_dir / f"{i+1:02d} - {title}.mp3"
        subprocess.run([
            "ffmpeg", "-y", "-i", str(mp3), "-ss", str(start), "-to", str(end),
            "-c", "copy", str(out_file),
        ], capture_output=True)
        files.append(out_file)
    return files


def detect_silence_splits(mp3: Path, min_silence_len: float, silence_thresh: int) -> list[float]:
    result = subprocess.run([
        "ffmpeg", "-i", str(mp3),
        "-af", f"silencedetect=noise={silence_thresh}dB:d={min_silence_len}",
        "-f", "null", "-",
    ], capture_output=True, text=True, encoding="utf-8")

    splits: list[float] = []
    for line in result.stderr.splitlines():
        if "silence_start" in line:
            m = re.search(r"silence_start: ([\d.]+)", line)
            if m:
                splits.append(float(m.group(1)))
    return splits


def split_by_silence(mp3: Path, split_points: list[float], out_dir: Path, base_name: str) -> list[Path]:
    total = get_duration(mp3)
    boundaries = [0.0] + split_points + [total]
    segments = [(boundaries[i], boundaries[i + 1])
                for i in range(len(boundaries) - 1)
                if boundaries[i + 1] - boundaries[i] > 1.0]
    files: list[Path] = []
    for i, (start, end) in enumerate(segments):
        out_file = out_dir / f"{base_name} - Part {i+1:02d}.mp3"
        subprocess.run([
            "ffmpeg", "-y", "-i", str(mp3), "-ss", str(start), "-to", str(end),
            "-c", "copy", str(out_file),
        ], capture_output=True)
        files.append(out_file)
    return files


def process(url: str, out_dir: Path, silence_len: float = 2.0,
            silence_thresh: int = -40) -> list[Path]:
    """Baixa, corta e devolve a lista de arquivos gerados."""
    out_dir.mkdir(parents=True, exist_ok=True)

    info = get_video_info(url)
    title = sanitize(info.get("title", "audio"))
    chapters = info.get("chapters") or []

    mp3 = download_audio(url, out_dir)
    splits_dir = out_dir / title
    splits_dir.mkdir(parents=True, exist_ok=True)

    if chapters:
        files = split_by_chapters(mp3, chapters, splits_dir)
    else:
        points = detect_silence_splits(mp3, silence_len, silence_thresh)
        if not points:
            target = splits_dir / mp3.name
            mp3.rename(target)
            return [target]
        files = split_by_silence(mp3, points, splits_dir, title)

    if mp3.exists():
        mp3.unlink()
    return files
