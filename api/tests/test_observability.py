"""Structured logging + optional Sentry (app/core/logging.py, app/main.py).

Before this, an unhandled exception surfaced only as a bare 500 with nothing
logged anywhere — the app had no way to notice an outage except a user report.
"""
import json
import logging

from app.core.logging import JsonFormatter, init_sentry


def test_health_observability_reports_state(client):
    r = client.get("/health/observability")
    assert r.status_code == 200
    body = r.json()
    assert body["structured_logging"] is True
    assert body["sentry_enabled"] is False  # no SENTRY_DSN set in tests


def test_sentry_disabled_by_default_and_does_not_raise(monkeypatch):
    monkeypatch.setattr("app.core.config.settings.SENTRY_DSN", "", raising=False)
    assert init_sentry() is False


def test_requests_get_an_id_header(client):
    r = client.get("/health")
    assert "x-request-id" in {k.lower() for k in r.headers.keys()}
    rid = r.headers["x-request-id"]
    assert len(rid) == 12  # uuid4 hex, truncated


def test_each_request_gets_a_distinct_request_id(client):
    a = client.get("/health").headers["x-request-id"]
    b = client.get("/health").headers["x-request-id"]
    assert a != b


def test_json_formatter_emits_valid_json_with_core_fields():
    record = logging.LogRecord(
        name="app.request", level=logging.INFO, pathname=__file__, lineno=1,
        msg="request", args=(), exc_info=None,
    )
    record.request_id = "abc123"
    record.status_code = 200
    line = JsonFormatter().format(record)
    parsed = json.loads(line)  # must be valid JSON — this is the whole point
    assert parsed["level"] == "INFO"
    assert parsed["logger"] == "app.request"
    assert parsed["message"] == "request"
    assert parsed["request_id"] == "abc123"
    assert parsed["status_code"] == 200


def test_json_formatter_includes_traceback_on_exception():
    try:
        raise ValueError("boom")
    except ValueError:
        import sys
        record = logging.LogRecord(
            name="app.request", level=logging.ERROR, pathname=__file__, lineno=1,
            msg="unhandled exception", args=(), exc_info=sys.exc_info(),
        )
    line = JsonFormatter().format(record)
    parsed = json.loads(line)
    assert "ValueError" in parsed["exc_info"]
    assert "boom" in parsed["exc_info"]


def test_unhandled_exception_is_logged_before_propagating(caplog):
    """A route that raises a plain (non-HTTP) exception must (a) still
    surface as a request failure and (b) get logged with request context —
    this is the exact gap this change closes."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.main import create_app

    app = create_app()

    @app.get("/__boom")
    def boom():
        raise RuntimeError("kaboom")

    caplog.set_level(logging.ERROR, logger="app.request")
    test_client = TestClient(app, raise_server_exceptions=False)
    r = test_client.get("/__boom")
    assert r.status_code == 500
    assert any("unhandled exception" in rec.message for rec in caplog.records)
    assert any(getattr(rec, "path", None) == "/__boom" for rec in caplog.records)
