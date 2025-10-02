"""Compatibility shim to expose main() at equation_phase_portrait_tool.main."""
from __future__ import annotations
from typing import List, Optional
import sys

try:
    from .__main__ import main as _main
except Exception:
    _main = None


def main(argv: Optional[List[str]] = None) -> int:
    """Call the package main() function.

    Allows invoking the CLI with:
        python -m equation_phase_portrait_tool.main

    Delegates to equation_phase_portrait_tool.__main__.main if available.
    """
    if _main is None:
        print("Entry point not available (backend.cli.main missing).", file=sys.stderr)
        return 1
    return _main(argv)


if __name__ == "__main__":
    raise SystemExit(main())