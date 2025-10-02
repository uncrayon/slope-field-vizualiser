import logging
import argparse
import sys
from pathlib import Path
import uvicorn

logger = logging.getLogger(__name__)

def main(argv=None):
    parser = argparse.ArgumentParser(prog="eqpp-server", description="Run Equation Phase Portrait Tool server")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind to")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind to")
    parser.add_argument("--reload", action="store_true", help="Enable Uvicorn reload (development)")
    args = parser.parse_args(argv)

    # If package data includes static files, log their location (helpful for debugging)
    try:
        # backend package root
        backend_root = Path(__file__).resolve().parent
        static_dir = backend_root / "static"
        if static_dir.exists() and static_dir.is_dir():
            logger.info(f"Serving packaged frontend static files from: {static_dir}")
        else:
            # Also log the developer frontend location so users know how to build
            dev_frontend = Path(__file__).resolve().parent.parent / "frontend" / "dist"
            logger.warning(f"No packaged static files found at {static_dir}. If you want to serve a packaged frontend, run the build script to copy the frontend into {static_dir}. Developer frontend (unpackaged) would be at: {dev_frontend} (if present).")
    except Exception as e:
        logger.warning(f"Error locating static files: {e}")

    # Import the FastAPI app object directly and run it. Passing the app object
    # avoids an extra import-by-name which can cause import ambiguity when the
    # same package exists both in the working tree and in site-packages.
    from backend.app import app as _app

    # Run uvicorn programmatically so the console script starts the server
    uvicorn.run(_app, host=args.host, port=args.port, reload=args.reload)

if __name__ == "__main__":
    # basic logging setup for console script
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    main(sys.argv[1:])