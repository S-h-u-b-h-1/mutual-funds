# MF Pulse

Daily Indian mutual-fund flow & NAV tracker. Free public data (AMFI + SEBI) →
Postgres → FastAPI → (Next.js dashboard). See [PROGRESS.md](PROGRESS.md) for status.

## Stack
- **Ingestion**: Python 3, `psycopg` 3, AMFI `NAVAll.txt` parser
- **Warehouse**: Postgres + TimescaleDB (Docker), dbt for transforms
- **Orchestration**: Airflow (daily 8:30pm IST)
- **API**: FastAPI
- **Cache/queue**: Redis

## Quick start
```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
docker compose up -d
docker exec -i mfpulse-db psql -U mfpulse -d mfpulse < sql/001_schema.sql
.venv/bin/python -m ingestion.load_nav
.venv/bin/uvicorn api.main:app --reload
```

## Data source notes (verified 2026-06-21)
- AMFI daily NAV: `https://portal.amfiindia.com/spages/NAVAll.txt` — semicolon-separated,
  stateful (category header → AMC header → data rows), **NAV only, no AUM**.
- AUM & net flows come from **SEBI monthly** reports → `fact_flow_monthly` (Phase 2).

## Project layout
```
ingestion/   amfi_parser.py · load_nav.py · db.py
sql/         001_schema.sql
dbt/         staging + marts models, tests
airflow/     dags/mfpulse_daily.py
api/         FastAPI app
tests/       parser data-quality tests
```

## Known constraints
- dbt-core 1.9 doesn't run on Python 3.14 yet — use Python 3.12/3.13 or the dbt Docker image.
