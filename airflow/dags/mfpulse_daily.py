"""
MF Pulse daily DAG.

Runs every evening after AMFI publishes NAVAll.txt: download -> parse+load ->
dbt run (transformations + tests) -> Slack notification on success/failure.

Drop this file into your Airflow `dags/` folder. It shells out to the project's
own modules so the parsing logic stays in one place (ingestion/), tested
independently of Airflow.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.bash import BashOperator
from airflow.operators.python import PythonOperator

PROJECT_DIR = os.getenv("MFPULSE_DIR", "/opt/mfpulse")
PYTHON = os.getenv("MFPULSE_PYTHON", f"{PROJECT_DIR}/.venv/bin/python")

default_args = {
    "owner": "mfpulse",
    "retries": 2,
    "retry_delay": timedelta(minutes=10),
    "depends_on_past": False,
}


def _load_nav():
    """Download today's AMFI file and load it (uses the tested ingestion module)."""
    import sys
    sys.path.insert(0, PROJECT_DIR)
    from ingestion.load_nav import run
    summary = run()  # no path => download fresh
    if summary["nav_rows_loaded"] == 0:
        raise ValueError("No NAV rows loaded — investigate AMFI file.")
    return summary


def _quality_gate():
    """Halt the pipeline if data-quality checks fail."""
    import sys
    sys.path.insert(0, PROJECT_DIR)
    from ingestion.quality_gate import run_checks
    failures = run_checks()
    if failures:
        raise ValueError("Quality gate failed: " + "; ".join(failures))
    return "passed"


def _deliver_alerts():
    """Send daily-summary / spike emails (no-op without RESEND_API_KEY)."""
    import sys
    sys.path.insert(0, PROJECT_DIR)
    from ingestion.alert_delivery import run
    return run()


def _notify_slack(context):
    """Post a message to Slack on success/failure if a webhook is configured."""
    import json
    import urllib.request

    webhook = os.getenv("SLACK_WEBHOOK_URL")
    if not webhook:
        return
    ti = context.get("task_instance")
    state = context.get("reason", "succeeded")
    text = f":bar_chart: MF Pulse daily run {state} — task `{ti.task_id if ti else 'dag'}`"
    req = urllib.request.Request(
        webhook,
        data=json.dumps({"text": text}).encode(),
        headers={"Content-Type": "application/json"},
    )
    urllib.request.urlopen(req, timeout=10)


with DAG(
    dag_id="mfpulse_daily",
    description="Download AMFI NAV, load to Postgres, run dbt, alert.",
    default_args=default_args,
    # AMFI typically publishes by ~8pm IST; run at 8:30pm IST (15:00 UTC).
    schedule="30 20 * * 1-6",  # Mon–Sat (NAVs aren't published Sundays)
    start_date=datetime(2026, 1, 1),
    catchup=False,
    tags=["mfpulse", "amfi"],
    on_failure_callback=_notify_slack,
) as dag:

    load_nav = PythonOperator(
        task_id="load_nav",
        python_callable=_load_nav,
    )

    dbt_run = BashOperator(
        task_id="dbt_run",
        bash_command=f"cd {PROJECT_DIR}/dbt && {PROJECT_DIR}/.venv/bin/dbt build --profiles-dir .",
    )

    quality_gate = PythonOperator(
        task_id="quality_gate",
        python_callable=_quality_gate,
    )

    deliver_alerts = PythonOperator(
        task_id="deliver_alerts",
        python_callable=_deliver_alerts,
    )

    notify = PythonOperator(
        task_id="notify_success",
        python_callable=lambda **ctx: _notify_slack({**ctx, "reason": "succeeded"}),
    )

    load_nav >> dbt_run >> quality_gate >> deliver_alerts >> notify
