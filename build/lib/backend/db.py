import sqlite3
import json
from pathlib import Path
from typing import Any, Dict, Optional, Tuple
import logging

# Use user directory for installed package, repo directory for development
repo_root = Path(__file__).resolve().parent.parent
if (repo_root / ".git").exists():
    # Running from repo
    DB_PATH = Path(__file__).resolve().parent / "jobs.sqlite"
else:
    # Installed package
    DB_PATH = Path.home() / ".eqpp" / "jobs.sqlite"
logger = logging.getLogger(__name__)


def _connect():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    logger.info(f"Initializing DB at: {DB_PATH}")
    conn = _connect()
    cur = conn.cursor()
    cur.execute(
        """
    CREATE TABLE IF NOT EXISTS jobs (
        job_id TEXT PRIMARY KEY,
        status TEXT,
        request_json TEXT,
        result_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        finished_at TIMESTAMP
    )
    """
    )
    conn.commit()
    conn.close()


def save_job_request(job_id: str, request: Dict[str, Any]):
    logger.info("Saving job request for %s", job_id)
    conn = _connect()
    cur = conn.cursor()
    cur.execute(
        "INSERT OR REPLACE INTO jobs (job_id, status, request_json) VALUES (?, ?, ?)",
        (job_id, "queued", json.dumps(request)),
    )
    conn.commit()
    conn.close()
    logger.info("Saved job request for %s", job_id)


def update_job_status(job_id: str, status: str):
    conn = _connect()
    cur = conn.cursor()
    cur.execute("UPDATE jobs SET status = ? WHERE job_id = ?", (status, job_id))
    conn.commit()
    conn.close()


def save_job_result(job_id: str, result: Dict[str, Any]):
    conn = _connect()
    cur = conn.cursor()
    cur.execute(
        "UPDATE jobs SET result_json = ?, status = ?, finished_at = CURRENT_TIMESTAMP WHERE job_id = ?",
        (json.dumps(result), "finished", job_id),
    )
    conn.commit()
    conn.close()


def get_job(job_id: str) -> Optional[Dict[str, Any]]:
    conn = _connect()
    cur = conn.cursor()
    cur.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    return {
        "job_id": row["job_id"],
        "status": row["status"],
        "request": json.loads(row["request_json"]) if row["request_json"] else None,
        "result": json.loads(row["result_json"]) if row["result_json"] else None,
        "created_at": row["created_at"],
        "finished_at": row["finished_at"],
    }