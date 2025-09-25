# Equation Phase Portrait Tool

Professional ODE exploration web service: parser, solvers, visualization, REST + WebSocket API.

Project layout

- [`backend/`](backend/:1) - FastAPI backend and solvers
- [`frontend/`](frontend/:1) - React + TypeScript frontend
- [`api/`](api/:1) - JSON schema and API examples
- [`examples/`](examples/:1) - example problems and demo datasets
- [`k8s/`](k8s/:1) - Kubernetes manifests & Helm chart
- [`docs/`](docs/:1) - architecture, operator runbook, and contribution guide
- [`tests/`](tests/:1) - unit, integration, and e2e tests
- [`.github/workflows/ci.yml`](.github/workflows/ci.yml:1) - CI pipeline

Goals

1. Accept Mathematica-like ODE input, parse safely to numerical functions.
2. Solve ODEs with SciPy/Numba and optional JAX/CuPy backends.
3. Scalable ensemble execution with streaming of results.
4. Interactive 2D/3D visualizations with animation and exports.
5. Production-ready deployment via Docker + Kubernetes.

Detailed local development quickstart

These steps show how to run the backend API and the frontend dev server locally for development. They expand on the short quickstart earlier.

Prerequisites

- Python 3.10+ (system or pyenv)
- Node.js 18+ and npm (or yarn)
- (Optional) Docker for containerized runs

1) Backend — FastAPI (detailed)

a. Create and activate a Python virtual environment at the repo root:

```bash
python -m venv .venv
source .venv/bin/activate
```

b. Install backend Python dependencies:

```bash
pip install -r backend/requirements-dev.txt
```

(Dependencies are listed in [`backend/requirements-dev.txt`](backend/requirements-dev.txt:1).)

c. Start the dev server (Uvicorn) from the repo root:

```bash
uvicorn backend.app:app --reload --host 127.0.0.1 --port 8000
```

- The FastAPI app entrypoint is [`backend/app.py`](backend/app.py:1). On startup it calls the DB initializer [`backend/db.py`](backend/db.py:1) (see startup event in the file).
- Health endpoint: http://127.0.0.1:8000/health
- Swagger / OpenAPI UI: http://127.0.0.1:8000/docs

d. Database & job persistence

- The app uses a local SQLite DB initialized via [`backend/db.py`](backend/db.py:1). If you need to reset the database, delete the file referenced there (check the implementation for the exact path).

e. Background jobs and worker manager

- The FastAPI app enqueues background work via the background tasks API and the internal manager found at [`backend/worker/manager.py`](backend/worker/manager.py:1).
- In development the backend process will run background tasks started by FastAPI's BackgroundTasks (no external worker required). If you adapt the project to use a separate worker process or queue system, run that worker as a separate process and update the manager accordingly.

f. CORS (when frontend runs on a different origin)

- If you run the frontend on a different host/port (e.g., Vite default 5173) the browser will block cross-origin API calls unless CORS is enabled.
- Add this small snippet in [`backend/app.py`](backend/app.py:1) near app creation to enable permissive CORS for development:

```python
from fastapi.middleware.cors import CORSMiddleware
app = FastAPI(title="Equation Phase Portrait Tool API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

2) Frontend — Vite + React (detailed)

a. Install dependencies and run dev server:

```bash
cd frontend
npm install
npm run dev
```

- The frontend entry is [`frontend/index.html`](frontend/index.html:1) which loads [`frontend/src/main.tsx`](frontend/src/main.tsx:1).
- Default dev server URL printed by Vite is typically http://localhost:5173.

b. Proxy API requests (alternative to CORS)

- Instead of enabling CORS on the backend you can configure Vite to proxy API calls in [`frontend/vite.config.ts`](frontend/vite.config.ts:1). Example:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})
```

- Adjust your frontend code to call the proxied path (e.g., fetch('/api/submit')) or configure the proxy to match your endpoints.

3) WebSocket usage

- The backend exposes a WebSocket endpoint at `/ws/{job_id}` (see [`backend/app.py`](backend/app.py:59)). The frontend hook client lives at [`frontend/src/hooks/useWebSocket.ts`](frontend/src/hooks/useWebSocket.ts:1).
- To connect from the browser in development use:

```js
const ws = new WebSocket('ws://127.0.0.1:8000/ws/' + jobId);
```

4) Running both servers in parallel

- Open two terminal tabs/windows:
  - Terminal A: start backend (activate venv then run Uvicorn)
  - Terminal B: run frontend (npm install, npm run dev)
- Alternatively use a terminal multiplexer (tmux) or run processes backgrounded during development.

5) Running tests

- Backend tests:
```bash
pytest -q
```
- Frontend tests:
```bash
npm run test --prefix frontend
```

6) Docker / containerized runs (notes)

- This repo is prepared for containerization in the future; Dockerfiles and k8s manifests will appear under `k8s/` and top-level Dockerfiles. For simple local testing you can run the backend inside a Python container and expose port 8000.

7) Troubleshooting & common issues

- CORS / API calls fail: Ensure CORS is enabled or use Vite proxy as above.
- WebSocket not connecting: confirm correct ws:// URL and that backend is running (port 8000).
- Missing Python packages: use Python 3.10+, activate the venv, and run pip install -r [`backend/requirements-dev.txt`](backend/requirements-dev.txt:1).
- Database errors: check [`backend/db.py`](backend/db.py:1) for the configured file path and permissions.
- Port conflicts: change Uvicorn host/port or Vite dev server port via Vite CLI options or `package.json` scripts.

API pointers and developer notes

- Submit jobs: POST /submit (see request model in [`backend/app.py`](backend/app.py:15)). The POST handler validates the job using [`backend/validation.py`](backend/validation.py:1), persists via [`backend/db.py`](backend/db.py:1), and enqueues work via [`backend/worker/manager.py`](backend/worker/manager.py:1).
- Results & status: GET /status/{job_id} and GET /results/{job_id} (see implementations in [`backend/app.py`](backend/app.py:47) lines).
- Solver adapters: see [`backend/solvers/abstract_solver.py`](backend/solvers/abstract_solver.py:1), [`backend/solvers/scipy_solver.py`](backend/solvers/scipy_solver.py:1), and [`backend/solvers/numba_runner.py`](backend/solvers/numba_runner.py:1).
- Parser implementation: [`backend/parser/parser.py`](backend/parser/parser.py:1).

Contact and contribution

- Open issues and design discussions in docs: [`docs/architecture.md`](docs/architecture.md:1).
- License: MIT


## Packaging, distribution, and local releases

This project can be packaged as a Python wheel that includes a prebuilt frontend (Vite `dist`) so end users can install and run a single Python package locally.

Quick build & create a wheel (developer machine)
1. Build the frontend and produce a wheel (from repository root):
   - bash scripts/build_release.sh
   - This runs:
     - npm --prefix frontend ci
     - npm --prefix frontend run build
     - copies `frontend/dist` → `backend/static`
     - python -m build
   - Result: wheel and sdist in the `dist/` directory (example: `dist/equation_phase_portrait_tool-0.1.0-py3-none-any.whl`).

Install & run the packaged application
1. Create and activate a venv (repo root or user machine):
   - python -m venv .venv
   - source .venv/bin/activate
2. Install the wheel:
   - python -m pip install dist/equation_phase_portrait_tool-0.1.0-py3-none-any.whl
3. Run the server:
   - eqpp-server --host 127.0.0.1 --port 8000
4. Verify:
   - Open http://127.0.0.1:8000/ — the SPA index should load (served from package static files).
   - Health endpoint: http://127.0.0.1:8000/health

Notes about native dependencies (SciPy / NumPy / Numba)
- SciPy and NumPy include compiled native extensions. The wheel we build is a pure-Python package that declares SciPy/NumPy as dependencies (see [`pyproject.toml`](pyproject.toml:1)). On most platforms pip will download prebuilt wheels for these packages; if a prebuilt wheel is not available for a user's platform or Python version, pip will attempt to build from source — which requires:
  - A C compiler (gcc/clang) and a Fortran compiler (gfortran).
  - BLAS/LAPACK libraries (OpenBLAS/MKL). On macOS, Homebrew-provided `openblas` and `gfortran` or Xcode Command Line Tools may be necessary. On Debian/Ubuntu: apt packages like `build-essential`, `gfortran`, and `libopenblas-dev` are commonly required.
- Numba is optional. We made `numba` an optional extra in [`pyproject.toml`](pyproject.toml:1). To install with Numba support:
  - python -m pip install equation-phase-portrait-tool[numba]
  - Note: Numba may require a compatible LLVM toolchain and can be sensitive to Python / platform compatibility.

Recommended CI for automated release artifacts
- A CI workflow should build the frontend, run tests, build the wheel, and upload the wheel as a release artifact when you create a tag. See `.github/workflows/build-and-release.yml` (CI file will be added to the repo) for an example workflow that runs `scripts/build_release.sh` on tags and uploads the `dist/` directory as artifacts.

Integration test for packaged wheel (suggested)
- Add an integration test that:
  1. Runs `bash scripts/build_release.sh` (CI will already do this).
  2. Creates an isolated venv, installs the built wheel from `dist/`, runs `eqpp-server` in the background and waits for it to become healthy.
  3. Calls `http://127.0.0.1:8000/health` and asserts `{"status":"ok"}` and fetches `/` to ensure the SPA index is served.
- Example test path: `tests/integration/test_packaged_install.py` (CI should run it in a separate job after the wheel is built).

Optional: platform-specific SciPy wheels
- If you need a frictionless experience for end-users across macOS/Windows/Linux, consider publishing platform-specific binary wheels for `scipy` or building manylinux wheels. That is an advanced step (requires dedicated build runners and toolchains) and is optional unless you control the target user platforms.

Troubleshooting
- If the frontend build fails with Monaco worker errors, ensure `frontend/src/components/MonacoEditor.tsx` contains Vite-friendly worker URLs (the repository already patches these).
- If wheel build fails, check `pyproject.toml` formatting and `python -m pip install --upgrade build` locally.
