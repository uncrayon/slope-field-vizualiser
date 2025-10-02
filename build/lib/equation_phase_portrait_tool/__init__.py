# -*- coding: utf-8 -*-
"""Top-level package for the ``equation_phase_portrait_tool`` project.

This package exposes a stable import path and the package version. It attempts to
import the existing ``backend`` package but keeps that import tolerant so that
import-time metadata inspection doesn't fail when optional dependencies are
missing.
"""
from ._version import __version__  # re-export package version

try:
    # Import the project backend into the package namespace for convenience.
    # Keep this tolerant so importing the top-level package won't fail when
    # optional backend dependencies are missing.
    import backend as backend  # type: ignore
except Exception:
    backend = None  # type: ignore

__all__ = ["__version__", "backend"]