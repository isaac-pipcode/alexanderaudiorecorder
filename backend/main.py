"""
API FastAPI para a aba YouTube.
Endpoints:
  POST /jobs          -> cria um job de processamento (assíncrono)
  GET  /jobs/{id}     -> status + arquivos resultantes
  GET  /files/{id}/... -> download dos MP3s gerados
"""

import os
import uuid
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from splitter import SplitterError, process

OUTPUT_ROOT = Path(os.environ.get("OUTPUT_DIR", "output")).resolve()
OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

# CORS: defina ALLOWED_ORIGINS=https://seu-app.vercel.app (separado por vírgula)
origins = os.environ.get("ALLOWED_ORIGINS", "*").split(",")

app = FastAPI(title="Alexander Audio Recorder — YouTube API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Jobs em memória (para produção use Redis/DB — ver README).
JOBS: dict[str, dict] = {}


class JobRequest(BaseModel):
    url: str
    silence_len: float = 2.0
    silence_thresh: int = -40


def _public_base() -> str:
    # Render expõe RENDER_EXTERNAL_URL automaticamente; usamos como fallback
    # para não precisar definir PUBLIC_BASE_URL à mão.
    base = os.environ.get("PUBLIC_BASE_URL") or os.environ.get("RENDER_EXTERNAL_URL", "")
    return base.rstrip("/")


def _run_job(job_id: str, req: JobRequest):
    JOBS[job_id]["status"] = "running"
    try:
        out_dir = OUTPUT_ROOT / job_id
        files = process(req.url, out_dir, req.silence_len, req.silence_thresh)
        base = _public_base()
        JOBS[job_id]["files"] = [
            {
                "name": f.name,
                "url": f"{base}/files/{job_id}/{f.relative_to(out_dir).as_posix()}",
            }
            for f in files
        ]
        JOBS[job_id]["status"] = "done"
    except SplitterError as e:
        JOBS[job_id].update(status="error", message=str(e))
    except Exception as e:  # noqa: BLE001
        JOBS[job_id].update(status="error", message=f"Erro inesperado: {e}")


@app.post("/jobs")
def create_job(req: JobRequest, background: BackgroundTasks):
    job_id = uuid.uuid4().hex
    JOBS[job_id] = {"id": job_id, "status": "pending", "files": []}
    background.add_task(_run_job, job_id, req)
    return JOBS[job_id]


@app.get("/jobs/{job_id}")
def get_job(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    return job


@app.get("/health")
def health():
    return {"ok": True}


# Servir os arquivos gerados.
app.mount("/files", StaticFiles(directory=str(OUTPUT_ROOT)), name="files")
