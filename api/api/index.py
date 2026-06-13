"""Vercel serverless entrypoint for the FastAPI app.

Deployed as a Vercel project with Root Directory = `api`. Vercel's Python runtime
discovers functions in `<root>/api/`, so this file lives at `api/api/index.py`.
It exposes the existing ASGI `app`; a catch-all rewrite (see api/vercel.json)
routes every request here, and FastAPI handles its own paths (/health, /members, ...).
"""
import sys
from pathlib import Path

# Make the package root (`api/`) importable so `app.*` resolves.
sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.main import app  # noqa: E402

# Vercel's ASGI handler picks up the module-level `app`.
__all__ = ["app"]
