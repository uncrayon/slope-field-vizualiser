# Comprehensive technical report: Jobs run under uvicorn but not reliably under the installed console script (eqpp-server)

## Executive summary (2–3 sentences)

Symptom: Submitting a job via the frontend sometimes completes and persists to the SQLite DB when the server is started with Uvicorn (e.g., uvicorn backend.app:app), but the same submission may not be executed/persisted when the app is run using the installed console script (eqpp-server). The UI shows a queued job with no progress while the DB shows no corresponding row in some runs.
Root cause summary: Import / process ambiguity and background-task execution differences caused different runtime contexts (different module instances / paths) and the worker not broadcasting status. Secondary issues included missing imports and logging that hid worker execution details. Fixes were applied to reduce ambiguity and add worker broadcasts and diagnostics.

## Reproduction steps (exact commands you ran)

### Working path (Uvicorn — job completes)

```
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements-dev.txt
uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Open UI at http://127.0.0.1:8000/ (or Vite dev with frontend)
Submit job → DB contains finished row for job id

### Problematic path (installed wheel + console script — job may not persist)

```
bash scripts/build_release.sh
python -m pip install --upgrade dist/equation_phase_portrait_tool-0.1.0-py3-none-any.whl
source .venv/bin/activate
eqpp-server --host 127.0.0.1 --port 8000
```

Submit job → UI shows queued and no DB row for the job id (in some runs)

## Key evidence (logs, DB queries, and file checks)

### DB rows (example):

```
sqlite3 backend/jobs.sqlite "SELECT job_id,status,created_at,finished_at,substr(result_json,1,200) FROM jobs ORDER BY created_at DESC LIMIT 10;"
```

Output sample (shows finished rows when run via uvicorn): b638b2db-ee33-4ec0-a189-2a5ed9bb5d66|finished|2025-09-24 05:25:56|2025-09-24 05:25:56

### Worker-run marker evidence:

backend/worker_runs.log (after fixes) shows which process executed enqueue_job: START 8c6d5a68-... FINISHED 8c6d5a68-...
This file existed when running under uvicorn (worker executed) but was absent or showed errors in earlier runs of eqpp-server.

### Console logs (example problematic output before fixes):

```
NameError: name 'Path' is not defined
UnboundLocalError: cannot access local variable 'marker_path' where it is not associated with a value
```

These tracebacks came from enqueue_job() in backend/worker/manager.py and interfered with observing normal behavior.

### Runtime inspection that mattered:

backend.file printed as /path/to/repo/backend/init.py while DB path used is /path/to/repo/backend/jobs.sqlite — this shows the app imported the repo package when run inside repo, and site-packages/installed package paths can differ.

## Relevant source locations (clickable)

- App & static serving: [backend/app.py](backend/app.py)
- Console script (entry point): [backend/cli.py](backend/cli.py)
- Worker / job runner: [backend/worker/manager.py](backend/worker/manager.py)
- WebSocket broker: [backend/ws.py](backend/ws.py)
- DB layer and DB path: [backend/db.py](backend/db.py)
- Packaging/build helper: [scripts/build_release.sh](scripts/build_release.sh)
- Integration test added: [tests/integration/test_packaged_install.py](tests/integration/test_packaged_install.py)

## Detailed root cause analysis (step-by-step)

### Import / module ambiguity

Uvicorn import-by-name (uvicorn backend.app:app) and running the console script can cause Python to import different backend module instances (repo local vs installed site-packages). When the process imports a different instance, global constants and file paths (e.g., DB_PATH, static directories) may differ and background tasks may write to different files or not run in the expected process.
This mismatch explains why submissions under Uvicorn yield DB rows and worker markers, while some runs under the console script did not show DB writes & markers.

### Console script uvicorn invocation

Previously the console script passed a string name to uvicorn.run (which triggers uvicorn to import the app by name, possibly causing another import resolution path). I changed the script to import the app object and call uvicorn.run with the app object to avoid ambiguities (see backend/cli.py).

### Worker execution and visibility

BackgroundTasks launched via FastAPI run in the server process. If the server process is not the one you think it is (e.g., different module instance, different Python path), the worker will still run somewhere else (or not at all) and the UI will not see updates.
I added explicit broadcast calls in the worker (enqueue_job) to send updates via backend/ws.py and added a marker file backend/worker_runs.log so we can confirm which process executed the worker.

### Masking errors & diagnostics

Early code had small mistakes (missing import of Path, uninitialized marker_path), producing NameError/UnboundLocalError that masked whether the worker logic ran correctly. I fixed imports and ensured marker_path is always defined and logged (so future errors won't hide the real problem).