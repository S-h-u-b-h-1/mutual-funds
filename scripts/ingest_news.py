"""
Financial news ingestion (Phase 3, realtime-intelligence sprint) — real RSS/regulatory feeds,
deterministic classification (ingestion/market_reaction.py), Supabase service-role write.
Mirrors cloud_pipeline.py's proven pattern: idempotent, audited, never destructive.

Sources (verified live and reachable — see docs/FINANCIAL_NEWS_SOURCE_REPORT.md for the full
investigation, including sources that were checked and found unavailable):
  - Economic Times: Markets, Mutual Funds, Economy (RSS)
  - Mint (Livemint): Markets, Money (RSS)
  - CNBC-TV18: Markets (RSS)
  - RBI: official Press Releases (RSS, government source)
  - SEBI: official press releases (RSS, regulator source)

Auth: SUPABASE_SERVICE_ROLE_KEY (CI secret, bypasses RLS — same as cloud_pipeline.py). Never
committed. Deduplicates by URL (unique constraint + ignore-duplicates) — a re-run is a no-op
for articles already stored, so history is never lost and never rewritten.

    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python -m scripts.ingest_news
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

from ingestion.market_reaction import classify, strip_html

URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
UA = "Mozilla/5.0 (compatible; MFPulseNewsBot/1.0; +https://mf-pulse.vercel.app)"

# name -> (source_type, url, credibility). Only sources verified reachable this session are
# listed; Moneycontrol/Business Standard (403 bot-blocked) and AMFI (no discoverable RSS) are
# deliberately excluded — see the source report rather than forcing an unreliable fetch.
SOURCES = {
    "Economic Times — Markets": ("rss", "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms", "tier1_business"),
    "Economic Times — Mutual Funds": ("rss", "https://economictimes.indiatimes.com/mf/rssfeeds/359241701.cms", "tier1_business"),
    "Economic Times — Economy": ("rss", "https://economictimes.indiatimes.com/news/economy/rssfeeds/1373380680.cms", "tier1_business"),
    "Mint — Markets": ("rss", "https://www.livemint.com/rss/markets", "tier1_business"),
    "Mint — Money": ("rss", "https://www.livemint.com/rss/money", "tier1_business"),
    "CNBC-TV18 — Markets": ("rss", "https://www.cnbctv18.com/commonfeeds/v1/cne/rss/market.xml", "tier1_business"),
    "RBI — Press Releases": ("regulatory", "https://www.rbi.org.in/pressreleases_rss.xml", "official"),
    "SEBI — Press Releases": ("regulatory", "https://www.sebi.gov.in/sebirss.xml", "official"),
}


def _headers(prefer="resolution=merge-duplicates,return=minimal"):
    return {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json", "Prefer": prefer}


def _post(table, rows, on_conflict=None, prefer="resolution=merge-duplicates,return=minimal"):
    if not rows:
        return []
    ep = f"{URL}/rest/v1/{table}" + (f"?on_conflict={on_conflict}" if on_conflict else "")
    req = urllib.request.Request(ep, data=json.dumps(rows).encode(), method="POST", headers=_headers(prefer))
    with urllib.request.urlopen(req, timeout=60) as r:
        body = r.read()
        return json.loads(body) if body else []


def _get(path):
    req = urllib.request.Request(f"{URL}/rest/v1/{path}", headers=_headers())
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def fetch_rss(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as r:
        raw = r.read()
    root = ET.fromstring(raw)
    items = []
    for it in root.findall(".//item"):
        title = (it.findtext("title") or "").strip()
        link = (it.findtext("link") or it.findtext("guid") or "").strip()
        desc = it.findtext("description") or ""
        pub = it.findtext("pubDate") or ""
        if not title or not link:
            continue
        try:
            published = parsedate_to_datetime(pub).astimezone(timezone.utc).isoformat()
        except Exception:
            published = None
        items.append({"title": title, "url": link, "summary": strip_html(desc), "published_at": published})
    return items


def ensure_source(name, source_type, url, credibility):
    _post("news_sources", [{"name": name, "source_type": source_type, "url": url, "credibility": credibility}],
          on_conflict="name", prefer="resolution=merge-duplicates,return=minimal")
    rows = _get(f"news_sources?name=eq.{urllib.parse_quote(name)}&select=id")
    return rows[0]["id"] if rows else None


def ensure_entities(names):
    """Upsert (entity_type, name) pairs, return {(type,name): id}."""
    if not names:
        return {}
    rows = [{"entity_type": t, "name": n} for t, n in names]
    _post("news_entities", rows, on_conflict="entity_type,name", prefer="resolution=merge-duplicates,return=minimal")
    out = {}
    for t, n in names:
        found = _get(f"news_entities?entity_type=eq.{t}&name=eq.{urllib.parse_quote(n)}&select=id")
        if found:
            out[(t, n)] = found[0]["id"]
    return out


def run_source(name, source_type, url, credibility):
    started = datetime.now(timezone.utc).isoformat()
    status, fetched, new, dup, err, source_id = "failed", 0, 0, 0, None, None
    try:
        source_id = ensure_source(name, source_type, url, credibility)
        items = fetch_rss(url)
        fetched = len(items)

        article_rows = []
        for it in items:
            title_hash = hashlib.sha256(re.sub(r"\s+", " ", it["title"].strip().lower()).encode()).hexdigest()[:16]
            cls = classify(it["title"], it["summary"])
            article_rows.append({
                "source_id": source_id, "title": it["title"], "url": it["url"], "title_hash": title_hash,
                "summary": it["summary"], "published_at": it["published_at"],
                "category": cls["category"], "importance_score": cls["importance_score"],
                "market_relevance_score": cls["market_relevance_score"], "sentiment_label": cls["sentiment_label"],
                "_links": cls["links"], "_matched": cls["matched_keywords"],
            })

        before_ids = {r["url"]: None for r in article_rows}
        clean_rows = [{k: v for k, v in r.items() if not k.startswith("_")} for r in article_rows]
        _post("news_articles", clean_rows, on_conflict="url", prefer="resolution=ignore-duplicates,return=representation")

        # figure out which URLs are genuinely new this run (ignore-duplicates means Supabase
        # silently skips existing ones; look up the resulting ids only for URLs we just tried).
        urls_q = ",".join(f'"{u}"' for u in before_ids)
        stored = _get(f"news_articles?url=in.({urls_q})&select=id,url,fetched_at")
        by_url = {r["url"]: r["id"] for r in stored}
        new = sum(1 for r in stored if r["fetched_at"] >= started[:10])  # rough same-day new-vs-existing signal
        dup = fetched - new if fetched >= new else 0

        # market-reaction links (only meaningful for articles we can resolve an id for)
        all_entities = {(e["entity_type"], e["name"]) for r in article_rows for e in r["_links"]}
        entity_ids = ensure_entities(list(all_entities))
        link_rows, sentiment_rows = [], []
        for r in article_rows:
            aid = by_url.get(r["url"])
            if not aid:
                continue
            for e in r["_links"]:
                eid = entity_ids.get((e["entity_type"], e["name"]))
                if eid:
                    link_rows.append({"article_id": aid, "entity_id": eid, "relation": e["relation"], "rule_id": e["rule_id"]})
            if r["sentiment_label"] != "neutral" or r["_matched"]:
                sentiment_rows.append({"article_id": aid, "label": r["sentiment_label"], "matched_keywords": r["_matched"]})
        if link_rows:
            _post("news_market_links", link_rows, on_conflict="article_id,entity_id", prefer="resolution=ignore-duplicates,return=minimal")
        if sentiment_rows:
            _post("news_sentiment", sentiment_rows, prefer="resolution=merge-duplicates,return=minimal")

        status = "success"
    except Exception as e:
        err = str(e)[:500]
        print(f"  ! {name}: {err}", file=sys.stderr)

    try:
        _post("news_ingestion_runs", [{
            "source_id": source_id, "status": status,
            "articles_fetched": fetched, "articles_new": new, "articles_duplicate": dup, "error": err,
            "started_at": started, "finished_at": datetime.now(timezone.utc).isoformat(),
        }])
    except Exception as e:
        print(f"  ! could not record run for {name}: {e}", file=sys.stderr)

    return status, fetched, new


def main():
    if not URL or not KEY:
        print("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipping.", file=sys.stderr)
        return 0
    total_fetched = total_new = ok = 0
    for name, (source_type, url, credibility) in SOURCES.items():
        status, fetched, new = run_source(name, source_type, url, credibility)
        print(f"{'✓' if status == 'success' else '✗'} {name}: {fetched} fetched, ~{new} new")
        if status == "success":
            ok += 1
        total_fetched += fetched
        total_new += new
        time.sleep(1)  # be a light, polite fetcher — not a rapid-fire scraper
    print(f"-- news ingestion: {ok}/{len(SOURCES)} sources ok, {total_fetched} fetched, ~{total_new} new")
    return 0


if __name__ == "__main__":
    sys.exit(main())
