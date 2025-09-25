import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import requests

WHEEL_GLOB = "dist/*.whl"
BUILD_SCRIPT = "scripts/build_release.sh"

def find_wheel(repo_root: Path) -> Path:
    d = repo_root / "dist"
    for p in sorted(d.glob("*.whl")):
        return p
    return None

def create_venv(venv_dir: Path):
    subprocess.check_call([sys.executable, "-m", "venv", str(venv_dir)])
    # ensure pip is up to date
    pip = venv_dir / "bin" / "pip"
    subprocess.check_call([str(pip), "install", "--upgrade", "pip", "setuptools", "wheel"])

def install_wheel(venv_dir: Path, wheel_path: Path):
    pip = venv_dir / "bin" / "pip"
    subprocess.check_call([str(pip), "install", str(wheel_path)])

def start_server(venv_dir: Path, host="127.0.0.1", port=8001):
    python = venv_dir / "bin" / "python"
    # use the console script directly via python -m backend.cli or via eqpp-server if installed in PATH
    # eqpp-server entrypoint maps to backend.cli:main; run with -m to be safe
    env = os.environ.copy()
    # ensure PATH includes venv bin
    env["PATH"] = str(venv_dir / "bin") + os.pathsep + env.get("PATH", "")
    cmd = [str(python), "-m", "backend.cli", "--host", host, "--port", str(port)]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, text=True)
    return proc

def wait_for_health(url: str, timeout: float = 15.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            r = requests.get(url, timeout=1.0)
            if r.status_code == 200 and r.json().get("status") == "ok":
                return True
        except Exception:
            pass
        time.sleep(0.5)
    return False

def test_packaged_wheel_serves_static_and_health(tmp_path: Path):
    repo_root = Path(__file__).resolve().parents[2]
    wheel = find_wheel(repo_root)
    # If wheel is not present, attempt to build using the provided script (CI should already build)
    if wheel is None:
        build_script = repo_root / BUILD_SCRIPT
        assert build_script.exists(), f"Build script not found at {build_script}"
        subprocess.check_call(["bash", str(build_script)], cwd=str(repo_root))
        wheel = find_wheel(repo_root)
    assert wheel is not None, "Wheel artifact not found in dist/ after build"

    venv_dir = tmp_path / "venv"
    create_venv(venv_dir)
    install_wheel(venv_dir, wheel)

    # Start server on a non-default port to avoid conflicts in CI
    host = "127.0.0.1"
    port = 8001
    proc = start_server(venv_dir, host=host, port=port)

    try:
        health_url = f"http://{host}:{port}/health"
        assert wait_for_health(health_url, timeout=20.0), "Server did not become healthy in time"

        # Verify root serves index.html (static SPA)
        root_url = f"http://{host}:{port}/"
        r = requests.get(root_url, timeout=5.0)
        assert r.status_code == 200
        assert "<!DOCTYPE html>" in r.text or "<html" in r.text.lower()
    finally:
        # terminate server
        try:
            proc.send_signal(signal.SIGINT)
            proc.wait(timeout=5)
        except Exception:
            proc.kill()
            proc.wait(timeout=5)