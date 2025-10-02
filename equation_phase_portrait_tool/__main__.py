# -*- coding: utf-8 -*-
"""CLI entry point for the equation_phase_portrait_tool package.

This module allows running the package with:
    python -m equation_phase_portrait_tool

It attempts to delegate to ``backend.cli.main()``. Import errors are caught
and presented as helpful messages so metadata tooling and simple imports do not
fail during installation or inspection.
"""
from __future__ import annotations


def main() -> int:
    """Run the project's CLI if available.

    Returns an exit code (0 success, >0 on error). Does not raise on import-time
    failures so that running metadata tools (or simple imports) remains safe.
    """
    try:
        from backend import cli as _cli  # local import to keep startup fast
    except Exception as exc:  # ImportError or other runtime errors
        print("equation_phase_portrait_tool: backend.cli is unavailable:", exc)
        print("If you intended to use the CLI, install the optional backend dependencies.")
        return 2

    if not hasattr(_cli, "main"):
        print("equation_phase_portrait_tool: backend.cli has no 'main()' function.")
        return 3

    try:
        # Delegate to backend.cli.main(); allow it to return an exit code.
        result = _cli.main()
        # If backend.cli.main() does not return an int, normalize to 0.
        return int(result) if isinstance(result, int) else 0
    except SystemExit:
        # Re-raise SystemExit so the expected exit code propagates when used as a script.
        raise
    except Exception as exc:
        print("equation_phase_portrait_tool: error while running CLI:", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())