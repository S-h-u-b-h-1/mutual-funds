"""
MF Pulse REST API (FastAPI).

Read-only endpoints over the warehouse, plus a write endpoint for user_events
(the behavioural tracking that powers the analytics story). Runs against the
same Postgres the ingestion writes to.

    uvicorn api.main:app --reload
"""

from __future__ import annotations

import json
import os
import re
from typing import Optional

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from api import cache
from ingestion.db import connect

ALLOWED_EVENTS = {
    "page_view", "search", "search_click", "amc_view",
    "watchlist_add", "watchlist_remove", "alert_signup",
}

# Error tracking — no-op unless SENTRY_DSN is set.
_SENTRY_DSN = os.getenv("SENTRY_DSN")
if _SENTRY_DSN:
    import sentry_sdk

    sentry_sdk.init(dsn=_SENTRY_DSN, traces_sample_rate=0.1)

app = FastAPI(title="MF Pulse API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to the frontend origin before launch
    allow_methods=["*"],
    allow_headers=["*"],
)


def query(sql: str, params: tuple = ()) -> list[dict]:
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            cols = [c.name for c in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]


@app.get("/health")
def health():
    row = query("SELECT 1 AS ok")
    return {"status": "up", "db": row[0]["ok"] == 1}


@app.get("/api/overview")
def overview():
    """Headline counts for the dashboard hero (cached 1h in Redis)."""
    return _overview()


@cache.cached(ttl=3600)
def _overview():
    rows = query(
        """
        SELECT d.asset_class,
               COUNT(*)                       AS schemes,
               ROUND(AVG(f.nav_value), 2)     AS avg_nav,
               MAX(f.nav_date)                AS latest_nav_date
        FROM dim_scheme d
        JOIN fact_nav_daily f USING (scheme_code)
        GROUP BY d.asset_class
        ORDER BY schemes DESC
        """
    )
    return {"by_asset_class": rows}


@app.get("/api/amcs")
def amcs(asset_class: Optional[str] = Query(None)):
    """Scheme counts per AMC, optionally filtered by asset class (cached 1h)."""
    return _amcs(asset_class)


@cache.cached(ttl=3600)
def _amcs(asset_class: Optional[str]):
    if asset_class:
        rows = query(
            """
            SELECT amc_name, COUNT(*) AS schemes
            FROM dim_scheme WHERE asset_class = %s
            GROUP BY amc_name ORDER BY schemes DESC
            """,
            (asset_class,),
        )
    else:
        rows = query(
            "SELECT amc_name, COUNT(*) AS schemes FROM dim_scheme GROUP BY amc_name ORDER BY schemes DESC"
        )
    return {"amcs": rows}


@app.get("/api/signals")
@cache.cached(ttl=3600)
def signals():
    """Latest flow-spike signals (z-score ≥ threshold)."""
    return {"signals": query("SELECT amc_name, asset_class, month, net_flow_cr, z_score, signal FROM flow_signals ORDER BY abs(z_score) DESC LIMIT 20")}


@app.post("/api/cache/flush")
def flush_cache(request: Request):
    """Invalidate cached aggregations (called by the pipeline after a fresh load)."""
    secret = os.getenv("CACHE_FLUSH_SECRET", "")
    if not secret or request.headers.get("x-flush-secret") != secret:
        raise HTTPException(403, "forbidden")
    return {"flushed": cache.flush()}


@app.get("/api/schemes/{scheme_code}/nav")
def scheme_nav(scheme_code: str, days: int = 30):
    """NAV time series for one scheme (drill-down / sparkline)."""
    rows = query(
        """
        SELECT nav_date, nav_value
        FROM fact_nav_daily
        WHERE scheme_code = %s
        ORDER BY nav_date DESC
        LIMIT %s
        """,
        (scheme_code, days),
    )
    if not rows:
        raise HTTPException(404, "scheme not found or no NAV history")
    return {"scheme_code": scheme_code, "navs": rows}


class Event(BaseModel):
    session_id: str
    event_type: str
    payload: dict = {}
    country: Optional[str] = None


class AlertSub(BaseModel):
    email: str
    alert_type: str = "daily_summary"
    entity_type: Optional[str] = None
    entity_value: str = "*"


@app.post("/api/alerts")
def subscribe(sub: AlertSub):
    """Subscribe an email to daily-summary or spike alerts (idempotent)."""
    if not EMAIL_RE.match(sub.email):
        raise HTTPException(422, "invalid email")
    if sub.alert_type not in ("daily_summary", "spike"):
        raise HTTPException(422, "invalid alert_type")
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO alerts (email, alert_type, entity_type, entity_value) "
                "VALUES (%s, %s, %s, %s) "
                "ON CONFLICT (email, alert_type, entity_value) DO NOTHING",
                (sub.email, sub.alert_type, sub.entity_type, sub.entity_value),
            )
    return {"ok": True}


@app.post("/api/events")
def track(event: Event, request: Request):
    """Behavioural tracking sink — validated, rate-limited, geo-enriched."""
    if event.event_type not in ALLOWED_EVENTS:
        raise HTTPException(422, f"unknown event_type: {event.event_type}")
    if not cache.allow(event.session_id or request.client.host, limit=60, window=60):
        raise HTTPException(429, "rate limit exceeded")

    # Geo enrichment from edge headers (Vercel / Cloudflare) when present.
    country = (
        event.country
        or request.headers.get("x-vercel-ip-country")
        or request.headers.get("cf-ipcountry")
    )
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO user_events (session_id, event_type, payload, country) "
                "VALUES (%s, %s, %s, %s)",
                (event.session_id, event.event_type, json.dumps(event.payload), country),
            )
    return {"ok": True}
