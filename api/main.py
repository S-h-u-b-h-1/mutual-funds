"""
MF Pulse REST API (FastAPI).

Read-only endpoints over the warehouse, plus a write endpoint for user_events
(the behavioural tracking that powers the analytics story). Runs against the
same Postgres the ingestion writes to.

    uvicorn api.main:app --reload
"""

from __future__ import annotations

import json
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ingestion.db import connect

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
    """Headline counts for the dashboard hero."""
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
    """Scheme counts per AMC, optionally filtered by asset class (for the chips)."""
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


@app.post("/api/events")
def track(event: Event):
    """Behavioural tracking sink (search / amc_view / alert_signup / watchlist_add)."""
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO user_events (session_id, event_type, payload, country) "
                "VALUES (%s, %s, %s, %s)",
                (event.session_id, event.event_type, json.dumps(event.payload), event.country),
            )
    return {"ok": True}
