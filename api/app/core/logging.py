"""Structured logging + optional error tracking.

Before this, an unhandled exception in production surfaced only as a plain
500 to the client — nothing was logged anywhere, so a real outage was only
ever noticed via a user complaint. This module fixes that with two
independent, additive pieces:

1. `setup_logging()` — a JSON line per log record (timestamp, level, logger,
   message, plus any extra fields) to stdout, which every serverless/host
   platform (Vercel, Render, etc.) already captures and makes searchable.
   No new infrastructure required.
2. `init_sentry()` — wires up Sentry IF `SENTRY_DSN` is set. Completely
   inert (does nothing, imports nothing extra at call time beyond the
   already-installed SDK) when the DSN is empty, which is the default for
   local dev and CI. Getting a DSN requires a Sentry account, so this is
   scaffolding: flip it on by setting one env var, no code change needed.
"""
import json
import logging
import sys
import time
from typing import Any

from app.core.config import settings

_RESERVED = frozenset(logging.LogRecord("", 0, "", 0, "", (), None).__dict__) | {"message"}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        # Anything passed via logging's `extra={...}` rides along as-is —
        # e.g. request_id, path, status_code, duration_ms (see main.py).
        for key, value in record.__dict__.items():
            if key not in _RESERVED:
                payload[key] = value
        return json.dumps(payload, default=str)


_configured = False


def setup_logging(level: int = logging.INFO) -> None:
    """Idempotent: `create_app()` runs once in production but once PER TEST in
    the test suite (see conftest.py). Clearing root's handlers on every call
    used to wipe out pytest's own `caplog` handler along with ours — configure
    once per process and leave other handlers alone after that."""
    global _configured
    if _configured:
        return
    root = logging.getLogger()
    root.setLevel(level)
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root.addHandler(handler)
    # Quiet the noisiest third-party loggers down to warnings-only.
    for name in ("uvicorn.access", "httpx"):
        logging.getLogger(name).setLevel(logging.WARNING)
    _configured = True


def init_sentry() -> bool:
    """Returns True if Sentry was actually initialised (DSN present)."""
    dsn = getattr(settings, "SENTRY_DSN", "") or ""
    if not dsn:
        return False
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration

    sentry_sdk.init(
        dsn=dsn,
        integrations=[FastApiIntegration()],
        traces_sample_rate=0.1,   # light perf tracing; raise if you need more
        send_default_pii=False,  # this app handles real financial data
    )
    return True


def timed_ms(start: float) -> float:
    return round((time.perf_counter() - start) * 1000, 2)
