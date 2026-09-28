"""Independent AMFI comparator. Never imports the publication parser or return calculator.

Fetch official observations anew, preserve sample evidence, and compare Decimal calculations.
The fixture is a dated audit artifact; refresh intentionally, not as part of a normal test run.
"""
import calendar
import csv
import hashlib
import io
import json
import random
import statistics
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HISTORY = "https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx"


def prior_month(day, count):
    y, m = day.year, day.month
    for _ in range(count):
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return date(y, m, min(day.day, calendar.monthrange(y, m)[1]))


def fetch_window(bounds):
    start, end = bounds
    url = f"{HISTORY}?frmdt={start:%d-%b-%Y}&todt={end:%d-%b-%Y}"
    with urllib.request.urlopen(url, timeout=180) as response:
        raw = response.read()
    rows = list(csv.reader(io.StringIO(raw.decode("utf-8-sig")), delimiter=";"))
    header = next(row for row in rows if row and row[0].strip() == "Scheme Code")
    nav_index, date_index = header.index("Net Asset Value"), header.index("Date")
    observations = {}
    for row in rows:
        if not row or not row[0].strip().isdigit() or len(row) != len(header):
            continue
        try:
            day = datetime.strptime(row[date_index].strip(), "%d-%b-%Y").date()
            nav = Decimal(row[nav_index].strip())
        except Exception:
            continue
        if nav.is_finite() and nav > 0 and start <= day <= end:
            observations.setdefault(row[0].strip(), {})[day.isoformat()] = str(nav)
    if not observations:
        raise ValueError(f"No official observations: {url}")
    return {"url": url, "sha256": hashlib.sha256(raw).hexdigest()}, observations


def main():
    bundle = json.loads((ROOT / "frontend/app/data/funds.json").read_text())
    asof = date.fromisoformat(bundle["asOf"])
    candidates = sorted(code for code, f in bundle["funds"].items() if f.get("active") and not f.get("isIdcw") and f.get("r1y") is not None and f.get("navDate") == asof.isoformat())
    codes = random.Random(20260908).sample(candidates, 10)
    # The original audit's discrepancy must stay covered in addition to the random sample.
    if "100033" not in codes:
        codes.append("100033")
    if len({bundle["funds"][code]["amc"] for code in codes}) < 5:
        raise ValueError("Independent validation requires at least five AMCs")
    windows = [(asof - timedelta(days=105), asof - timedelta(days=61)), (asof - timedelta(days=60), asof - timedelta(days=16)), (asof - timedelta(days=15), asof)]
    windows += [(prior_month(asof, months) - timedelta(days=7), prior_month(asof, months)) for months in [6, 12, 36, 60]]
    observations = {code: {} for code in codes}
    sources = []
    with ThreadPoolExecutor(max_workers=2) as executor:
        for source, rows in executor.map(fetch_window, windows):
            sources.append(source)
            for code in codes:
                observations[code].update(rows.get(code, {}))
    samples, failures = [], []
    for code in codes:
        fund, history = bundle["funds"][code], observations[code]
        current = Decimal(history[asof.isoformat()])
        expected = {"nav": float(current), "navDate": asof.isoformat()}
        for key, months in [("r1m", 1), ("r3m", 3), ("r6m", 6), ("r1y", 12), ("r3y", 36), ("r5y", 60)]:
            target = prior_month(asof, months)
            valid = sorted(day for day in history if target - timedelta(days=7) <= date.fromisoformat(day) <= target)
            if not valid:
                expected[key] = None
                continue
            anchor = valid[-1]
            ratio = current / Decimal(history[anchor])
            if months > 12:
                ratio = ratio ** (Decimal("365.25") / Decimal((asof - date.fromisoformat(anchor)).days))
            expected[key] = round(float((ratio - 1) * 100), 2)
        daily = [float(history[day]) for day in sorted(history) if asof - timedelta(days=90) <= date.fromisoformat(day) <= asof]
        changes = [right / left - 1 for left, right in zip(daily, daily[1:])]
        expected["vol90"] = round(statistics.pstdev(changes) * 252 ** .5 * 100, 2)
        peak, worst = daily[0], 0
        for nav in daily:
            peak = max(peak, nav)
            worst = min(worst, nav / peak - 1)
        expected["maxdd90"] = round(worst * 100, 2)
        differences = {key: {"actual": fund.get(key), "expected": value} for key, value in expected.items() if (value != fund.get(key) if value is None or isinstance(value, str) else fund.get(key) is None or abs(value - fund[key]) > .011)}
        if differences:
            failures.append({"code": code, "differences": differences})
        samples.append({"code": code, "name": fund["name"], "amc": fund["amc"], "category": fund["category"], "observations": history, "expected": expected, "differences": differences})
    output = {"asOf": asof.isoformat(), "fetchedAt": datetime.now(timezone.utc).isoformat(), "selection": "Ten random schemes (seed 20260908; active non-IDCW, current NAV and 1Y history), plus original discrepancy scheme 100033", "sources": sources, "samples": samples, "passed": len(samples) - len(failures), "failed": len(failures)}
    target = ROOT / "tests/fixtures/financial/amfi_golden.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(output, indent=2) + "\n")
    print(json.dumps({"passed": output["passed"], "failed": len(failures), "differences": failures}, indent=2))
    return bool(failures)


if __name__ == "__main__":
    raise SystemExit(main())
