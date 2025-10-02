from fastapi import FastAPI, HTTPException, WebSocket, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uuid
from typing import List, Any, Dict, Optional
from pathlib import Path
import logging
import numpy as np
from .validation import validate_job_request
from .db import init_db, save_job_request
from .worker.manager import enqueue_job
from .parser.parser import MathematicaParser

app = FastAPI(title="Equation Phase Portrait Tool API")
 
# Two possible frontend locations:
#  - Packaged static files included in the Python package at backend/static (used when installed from wheel)
#  - Developer frontend build at ../frontend/dist (used during development)
# We attempt to detect packaged static files in the active site-packages so that running
# the installed wheel (even when current working directory is the repo) will serve the
# packaged frontend. If not found, fall back to the local package static or the dev build.
import site
PACKAGED_FRONTEND: Path = None
for p in site.getsitepackages():
    candidate = Path(p) / "backend" / "static"
    if candidate.exists() and candidate.is_dir():
        PACKAGED_FRONTEND = candidate
        break
if PACKAGED_FRONTEND is None:
    # fallback to local package static (useful for editable installs or running from repo)
    PACKAGED_FRONTEND = Path(__file__).resolve().parent / "static"

DEV_FRONTEND = Path(__file__).resolve().parent.parent / "frontend" / "dist"
logger = logging.getLogger(__name__)

@app.on_event("startup")
def startup_event():
    # Initialize SQLite DB for job persistence
    init_db()

    # Mount frontend static files from packaged location if present, otherwise fall back to developer build
    try:
        if PACKAGED_FRONTEND and PACKAGED_FRONTEND.exists() and PACKAGED_FRONTEND.is_dir():
            app.mount("/", StaticFiles(directory=str(PACKAGED_FRONTEND), html=True), name="frontend")
            logger.info(f"Serving packaged frontend from: {PACKAGED_FRONTEND}")
        elif DEV_FRONTEND.exists() and DEV_FRONTEND.is_dir():
            app.mount("/", StaticFiles(directory=str(DEV_FRONTEND), html=True), name="frontend")
            logger.info(f"Serving developer frontend from: {DEV_FRONTEND}")
        else:
            logger.warning(f"Frontend not found in packaged location {PACKAGED_FRONTEND} or dev location {DEV_FRONTEND}; static mount disabled.")
    except Exception as e:
        logger.warning(f"Failed to mount frontend static files: {e}")

class JobRequest(BaseModel):
    equations: str
    name: str = ""
    parameters: Dict[str, float] = {}
    timespan: List[float]
    initial_conditions: List[List[float]]
    integrator: Dict[str, Any] = {}
    projection: List[int] = []
    animate: bool = False

class SlopeFieldRequest(BaseModel):
    equations: str
    x_min: float
    x_max: float
    y_min: float
    y_max: float
    z_min: Optional[float] = None
    z_max: Optional[float] = None
    grid_size: int = 30

jobs = {}

@app.get("/health")
def health():
    return {"status":"ok"}

@app.post("/submit")
async def submit_job(req: JobRequest, background_tasks: BackgroundTasks):
    # validate input and raise HTTPException with Problem Details on failure
    validate_job_request(req.dict())

    job_id = str(uuid.uuid4())
    # persist request to DB immediately
    save_job_request(job_id, req.dict())

    # mark in-memory jobs mapping for quick status checks (kept for backward compatibility)
    jobs[job_id] = {"status": "queued", "request": req.dict()}

    # enqueue the real worker task (enqueue_job will persist status/results)
    background_tasks.add_task(enqueue_job, job_id, req.dict())

    return {"job_id": job_id}

@app.get("/status/{job_id}")
def job_status(job_id:str):
    if job_id not in jobs:
        raise HTTPException(404,"job not found")
    payload = {"job_id": job_id, "status": jobs[job_id]["status"]}
    if "error" in jobs[job_id]:
        payload["error"] = jobs[job_id]["error"]
    if "error_details" in jobs[job_id]:
        payload["error_details"] = jobs[job_id]["error_details"]
    if "warnings" in jobs[job_id]:
        payload["warnings"] = jobs[job_id]["warnings"]
    return payload

@app.get("/results/{job_id}")
def job_results(job_id:str):
    if job_id not in jobs or "result" not in jobs[job_id]:
        raise HTTPException(404,"result not found")
    return jobs[job_id]["result"]

@app.post("/slope_field")
def compute_slope_field(req: SlopeFieldRequest):
    try:
        parser = MathematicaParser()
        f, state_vars = parser.parse(req.equations)
        num_vars = len(state_vars)
        if num_vars == 2:
            # 2D
            x = np.linspace(req.x_min, req.x_max, req.grid_size)
            y = np.linspace(req.y_min, req.y_max, req.grid_size)
            X, Y = np.meshgrid(x, y)
            X_flat = X.flatten()
            Y_flat = Y.flatten()
            U = []
            V = []
            for i in range(len(X_flat)):
                vec = f(0, np.array([X_flat[i], Y_flat[i]]), {})
                U.append(vec[0])
                V.append(vec[1])
            return {
                "x": X_flat.tolist(),
                "y": Y_flat.tolist(),
                "u": U,
                "v": V
            }
        elif num_vars == 3 and req.z_min is not None and req.z_max is not None:
            # 3D
            x = np.linspace(req.x_min, req.x_max, req.grid_size)
            y = np.linspace(req.y_min, req.y_max, req.grid_size)
            z = np.linspace(req.z_min, req.z_max, req.grid_size)
            X, Y, Z = np.meshgrid(x, y, z, indexing='ij')
            X_flat = X.flatten()
            Y_flat = Y.flatten()
            Z_flat = Z.flatten()
            U = []
            V = []
            W = []
            for i in range(len(X_flat)):
                vec = f(0, np.array([X_flat[i], Y_flat[i], Z_flat[i]]), {})
                U.append(vec[0])
                V.append(vec[1])
                W.append(vec[2])
            return {
                "x": X_flat.tolist(),
                "y": Y_flat.tolist(),
                "z": Z_flat.tolist(),
                "u": U,
                "v": V,
                "w": W
            }
        else:
            raise HTTPException(400, "Unsupported number of variables or missing z range for 3D")
    except Exception as e:
        raise HTTPException(400, str(e))

@app.websocket("/ws/{job_id}")
async def ws_endpoint(websocket: WebSocket, job_id:str):
    await websocket.accept()
    await websocket.send_json({"status":"connected","job_id":job_id})
    # naive: send updates if job exists
    import asyncio
    while True:
        if job_id in jobs and jobs[job_id]["status"]=="finished":
            await websocket.send_json({"status":"finished","result":jobs[job_id].get("result")})
            break
        await asyncio.sleep(0.5)
    await websocket.close()