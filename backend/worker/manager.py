"""
Worker manager: orchestrates job execution, solver selection, and result persistence.

This module provides a simple run-once job runner that is suitable for background
execution via FastAPI BackgroundTasks. It uses the parser and solver adapters
already implemented and persists job metadata/results to the SQLite DB.

Design notes:
- For production this would be a separate worker service consuming a queue (Redis/RabbitMQ)
  with proper process isolation, timeouts and resource limits. Here we implement a
  simple in-process runner to keep the prototype self-contained.
"""
import asyncio
import traceback
from typing import Dict, Any
import logging
from pathlib import Path
import numpy as np

from backend.db import save_job_result, update_job_status, save_job_request
from backend.parser.parser import MathematicaParser, ParseError
from backend.solvers.scipy_solver import ScipySolver
from backend.solvers.numba_runner import NumbaRunner
from backend.solvers.abstract_solver import SolverError
from backend.ws import broadcast


def _choose_solver(integrator: Dict[str, Any]):
    backend = integrator.get("backend", None) or integrator.get("backend_hint", None) or integrator.get("method", None)
    # normalized hint
    if isinstance(backend, str) and backend.lower().startswith("numba"):
        return NumbaRunner()
    # default to SciPy
    return ScipySolver()


def _format_result(times: np.ndarray, trajectories: np.ndarray):
    # trajectories may be shaped (n_ic, nt, ndim) or (nt, ndim) for single
    # normalize to list of trajectories per initial condition: list of (nt, ndim)
    if trajectories.ndim == 3:
        # (n_ic, nt, ndim) -> list of lists
        trajs = [[[float(x) for x in row] for row in traj] for traj in trajectories]
    elif trajectories.ndim == 2:
        # (nt, ndim) -> single IC: wrap
        trajs = [[[float(x) for x in row] for row in trajectories]]
    else:
        # unexpected shape; attempt to convert
        trajs = trajectories.tolist()
    return {"times": [float(t) for t in times], "trajectories": trajs}


def _schedule_broadcast(job_id: str, message: Dict[str, Any]) -> None:
    """
    Schedule a broadcast to connected WebSocket clients. This helper will attempt
    to schedule the async broadcast using the running event loop when possible.
    If no running loop exists (e.g., this function runs in a worker thread), it
    will run the broadcast synchronously via a temporary event loop.
    """
    try:
        loop = asyncio.get_running_loop()
        # running loop -> schedule task
        loop.create_task(broadcast(job_id, message))
    except RuntimeError:
        # no running loop -> run it to completion in a new loop
        try:
            asyncio.run(broadcast(job_id, message))
        except Exception as e:
            logging.getLogger(__name__).exception("Failed to run broadcast for job %s: %s", job_id, e)


def _broadcast_status(job_id: str, status: str, **extra: Any) -> None:
    payload = {"job_id": job_id, "status": status}
    if extra:
        payload.update(extra)
    _schedule_broadcast(job_id, {"type": "status", "payload": payload})


def _broadcast_results(job_id: str, result: Dict[str, Any]) -> None:
    _schedule_broadcast(job_id, {"type": "results", "payload": result})

def enqueue_job(job_id: str, request: Dict[str, Any]) -> None:
    """
    Entry point used by FastAPI BackgroundTasks to run a submitted job.

    Behavior changes:
    - Emits broadcast messages for status changes so UI receives timely updates.
    - Adds structured logging for easier debugging.
    - Writes a small worker-run log to backend/worker_runs.log to help diagnose
      whether the worker executed in this process.
    """
    from backend.app import jobs  # Import here to avoid circular import
    logger = logging.getLogger(__name__)
    logger.info("enqueue_job called for job %s", job_id)
    # ensure marker_path is always defined so later cleanup logging won't cause UnboundLocalError
    repo_root = Path(__file__).resolve().parent.parent.parent
    if (repo_root / ".git").exists():
        # Running from repo
        marker_path = Path(__file__).resolve().parent.parent / "worker_runs.log"
    else:
        # Installed package
        marker_path = Path.home() / ".eqpp" / "worker_runs.log"
        marker_path.parent.mkdir(parents=True, exist_ok=True)
    # write a tiny run marker to a file so we can observe which process executed the job
    try:
        with open(marker_path, "a", encoding="utf-8") as f:
            f.write(f"START {job_id}\n")
    except Exception:
        logger.exception("Failed to write worker run marker for job %s", job_id)

    try:
        logger.info("Starting job %s", job_id)
        save_job_request(job_id, request)
        update_job_status(job_id, "running")
        jobs[job_id]["status"] = "running"
        jobs[job_id].pop("error", None)
        jobs[job_id].pop("error_details", None)
        jobs[job_id].pop("warnings", None)
        _broadcast_status(job_id, "running")

        parser = MathematicaParser()
        try:
            func, state_vars = parser.parse(request["equations"])
        except ParseError as e:
            logger.warning("Parser failure for job %s: %s", job_id, e)
            update_job_status(job_id, "failed")
            jobs[job_id]["status"] = "failed"
            jobs[job_id]["error"] = str(e)
            save_job_result(job_id, {"job_id": job_id, "error": f"parser failure: {e}"})
            _broadcast_status(job_id, "failed", error=str(e))
            with open(marker_path, "a", encoding="utf-8") as f:
                f.write(f"FAILED_PARSE {job_id}\n")
            return

        t0, tf = float(request["timespan"][0]), float(request["timespan"][1])
        integrator = request.get("integrator", {}) or {}
        # pick solver
        solver = _choose_solver(integrator)
        logger.info("Job %s using solver %s", job_id, getattr(solver, "options", "unknown"))

        # build t_eval
        t_eval = None
        if "t_eval" in integrator and integrator["t_eval"]:
            t_eval = np.asarray(integrator["t_eval"], dtype=float)
        else:
            t_eval = np.linspace(t0, tf, 201)

        # prepare initial conditions array
        ics = np.asarray(request["initial_conditions"], dtype=float)

        # run batch solve (solver returns (times, trajectories))
        try:
            times, trajs = solver.solve_batch(
                func,
                (t0, tf),
                ics,
                params=request.get("parameters", {}) or {},
                t_eval=t_eval,
            )
        except SolverError as err:
            logger.warning("Solver failure for job %s: %s", job_id, err)
            update_job_status(job_id, "failed")
            jobs[job_id]["status"] = "failed"
            jobs[job_id]["error"] = str(err)
            if getattr(err, "details", None):
                jobs[job_id]["error_details"] = err.details
            save_job_result(
                job_id,
                {
                    "job_id": job_id,
                    "error": str(err),
                    "details": getattr(err, "details", {}),
                },
            )
            _broadcast_status(job_id, "failed", error=str(err), details=getattr(err, "details", {}))
            with open(marker_path, "a", encoding="utf-8") as f:
                f.write(f"FAILED_SOLVER {job_id}\n")
            return

        result = _format_result(times, trajs)
        result["meta"] = {
            "equations": request["equations"],
            "name": request.get("name", ""),
            "initial_conditions": request["initial_conditions"]
        }
        # persist results
        save_job_result(
            job_id,
            {
                "job_id": job_id,
                **result,
                "solver": solver.options.backend if hasattr(solver, "options") else "unknown",
            },
        )
        update_job_status(job_id, "finished")
        jobs[job_id]["status"] = "finished"
        jobs[job_id]["result"] = result
        logger.info("Job %s finished; broadcasting result", job_id)
        _broadcast_status(job_id, "finished")
        _broadcast_results(job_id, result)
        try:
            with open(marker_path, "a", encoding="utf-8") as f:
                f.write(f"FINISHED {job_id}\n")
        except Exception:
            logger.exception("Failed to write worker run finished marker for job %s", job_id)
    except Exception as e:
        # capture traceback and persist as failure
        tb = traceback.format_exc()
        logging.getLogger(__name__).exception("Job %s failed: %s", job_id, e)
        update_job_status(job_id, "failed")
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)
        save_job_result(job_id, {"job_id": job_id, "error": str(e), "traceback": tb})
        extra = {}
        if isinstance(e, SolverError):
            extra["details"] = getattr(e, "details", {})
        _broadcast_status(job_id, "failed", error=str(e), **extra)
        try:
            with open(marker_path, "a", encoding="utf-8") as f:
                f.write(f"EXCEPTION {job_id}\n")
        except Exception:
            logger.exception("Failed to write worker run exception marker for job %s", job_id)