"""
Playwright acquisition layer — for AMC portals whose factsheet PDF links are JS-generated
and not present in static HTML (HDFC/ICICI/Nippon/Axis/etc.).

Launches a headless browser, navigates the downloads/factsheet page, locates the latest
factsheet PDF link, downloads + validates it, saves the file and records the source URL.
Supports retries, throttling, user-agent rotation, and timeouts.

Requires `pip install playwright && playwright install chromium`. It is intentionally
import-light so the rest of the pipeline runs without Playwright installed; call
`acquire(...)` only in an environment where the browser is available (e.g. CI).

    python -m ingestion.factsheet.playwright_fetch
"""

from __future__ import annotations

import re
import time

UAS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Safari/537.36",
]

# AMC factsheet landing pages + a regex selecting the factsheet PDF link from the DOM.
PORTALS = {
    "HDFC Mutual Fund": ("https://www.hdfcfund.com/information/downloads", r"factsheet.*\.pdf"),
    "ICICI Prudential Mutual Fund": ("https://www.icicipruamc.com/news-and-update/factsheet", r"factsheet.*\.pdf"),
    "Nippon India Mutual Fund": ("https://mf.nipponindiaim.com/investor-service/downloads/factsheet", r"factsheet.*\.pdf"),
    "Axis Mutual Fund": ("https://www.axismf.com/factsheet", r"factsheet.*\.pdf"),
}


def is_pdf(b: bytes) -> bool:
    return b[:5] == b"%PDF-"


def acquire(amc: str, out_dir: str = "data/factsheets", retries: int = 3, throttle_s: float = 3.0):
    """Return (path, source_url) for the latest factsheet PDF, or raise after retries."""
    from playwright.sync_api import sync_playwright  # imported lazily

    page_url, link_re = PORTALS[amc]
    last = None
    for attempt in range(retries):
        ua = UAS[attempt % len(UAS)]
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                ctx = browser.new_context(user_agent=ua, accept_downloads=True)
                page = ctx.new_page()
                page.set_default_timeout(45_000)
                page.goto(page_url, wait_until="networkidle")
                # find the first link whose href matches the factsheet pattern
                href = page.eval_on_selector_all(
                    "a[href$='.pdf'], a[href*='factsheet']",
                    "els => els.map(e => e.href)",
                )
                pdf_url = next((u for u in href if re.search(link_re, u, re.I)), None)
                if not pdf_url:
                    raise RuntimeError("no factsheet PDF link found in DOM")
                resp = ctx.request.get(pdf_url)
                data = resp.body()
                browser.close()
            if not is_pdf(data):
                raise RuntimeError("downloaded resource is not a PDF")
            import os
            os.makedirs(out_dir, exist_ok=True)
            path = os.path.join(out_dir, f"{amc.lower().replace(' ', '_')}.pdf")
            with open(path, "wb") as fh:
                fh.write(data)
            return path, pdf_url
        except Exception as e:  # noqa: BLE001 — retry with backoff + UA rotation
            last = e
            time.sleep(throttle_s * (attempt + 1))
    raise RuntimeError(f"{amc}: acquisition failed after {retries} tries: {last}")


def main():
    for amc in PORTALS:
        try:
            path, url = acquire(amc)
            print(f"OK   {amc}: {path} <- {url}")
        except Exception as e:  # noqa: BLE001
            print(f"FAIL {amc}: {e}")


if __name__ == "__main__":
    main()
