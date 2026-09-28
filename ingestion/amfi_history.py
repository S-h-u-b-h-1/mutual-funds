"""Strict, header-driven AMFI history parsing and calendar-window return policy."""
import calendar
import math
from datetime import date, datetime, timedelta


class HistorySchemaError(ValueError):
    pass


def parse_history(content, start=None, end=None):
    columns = None
    result = {}
    for line_number, raw in enumerate(content.splitlines(), 1):
        fields = [part.strip() for part in raw.lstrip("\ufeff").split(";")]
        if fields[0].lower() == "scheme code":
            names = [" ".join(field.lower().split()) for field in fields]
            required = ("scheme code", "net asset value", "date")
            if any(names.count(name) != 1 for name in required):
                raise HistorySchemaError(f"Unrecognized AMFI history header at line {line_number}")
            columns = (len(names), *(names.index(name) for name in required))
            continue
        if not fields[0].isdigit():
            continue  # AMC/category section headings
        if columns is None:
            raise HistorySchemaError("AMFI numeric data arrived without a recognized header")
        count, code_i, nav_i, date_i = columns
        if len(fields) != count:
            raise HistorySchemaError(f"AMFI column count changed at line {line_number}")
        try:
            nav = float(fields[nav_i].replace(",", ""))
            nav_date = datetime.strptime(fields[date_i], "%d-%b-%Y").date()
        except ValueError as exc:
            # Official N.A./blank NAVs are unavailable observations, not zero prices.
            if fields[nav_i].upper() in ("", "N.A.", "NA", "N/A", "-"):
                continue
            raise HistorySchemaError(f"Invalid AMFI NAV/date at line {line_number}") from exc
        if not math.isfinite(nav) or nav < 0 or nav > 100_000_000:
            raise HistorySchemaError(f"Implausible AMFI NAV at line {line_number}")
        if (start and nav_date < start) or (end and nav_date > end):
            raise HistorySchemaError(f"AMFI date outside requested window at line {line_number}")
        if nav == 0:
            continue  # wound-up pools are not usable performance prices
        code = fields[code_i]
        previous = result.setdefault(code, {}).get(nav_date)
        if previous is not None and previous != nav:
            raise HistorySchemaError(f"Conflicting AMFI observation for {code} on {nav_date}")
        result[code][nav_date] = nav
    if columns is None:
        raise HistorySchemaError("No recognized AMFI history header")
    return result


def months_before(asof, months):
    index = asof.year * 12 + asof.month - 1 - months
    year, month0 = divmod(index, 12)
    month = month0 + 1
    return date(year, month, min(asof.day, calendar.monthrange(year, month)[1]))


def trailing_return(series, current_nav, asof, *, months=None, days=None, annualized=False):
    target = months_before(asof, months) if months is not None else asof - timedelta(days=days)
    # Nearest prior official observation, maximum seven calendar days back. This handles
    # weekends/holidays without silently stretching a one-month period across a history gap.
    eligible = [(day, value) for day, value in series.items() if target - timedelta(days=7) <= day <= target and value > 0]
    if not eligible or current_nav is None or current_nav <= 0:
        return None
    anchor, value = max(eligible)
    ratio = current_nav / value
    if annualized:
        ratio = ratio ** (365.25 / (asof - anchor).days)
    return round((ratio - 1) * 100, 2)
