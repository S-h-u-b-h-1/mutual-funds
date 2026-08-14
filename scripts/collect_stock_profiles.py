#!/usr/bin/env python3
"""Build a conservative, source-attributed company profile snapshot from Wikidata.

Profiles are accepted when the Wikidata ISIN matches the official exchange/index
universe, or when the label is an exact normalised match. The generated file is
committed with the app so a temporarily unavailable API never empties the UI.
"""

from __future__ import annotations

import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UNIVERSE = ROOT / "frontend/app/data/stock_universe.json"
OUTPUT = ROOT / "frontend/app/data/stock_profiles.json"
API = "https://www.wikidata.org/w/api.php"
SPARQL = "https://query.wikidata.org/sparql"
HEADERS = {"User-Agent": "MFPulseResearch/1.0 (public company profile snapshot)"}


def normalise(value: str) -> str:
    value = re.sub(r"\b(?:LTD|LIMITED|CORPORATION|CORP)\.?\b", "", value.upper())
    return re.sub(r"[^A-Z0-9]", "", value)


def fetch(params: dict, attempts: int = 4) -> dict:
    url = f"{API}?{urllib.parse.urlencode(params)}"
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except Exception:
            if attempt == attempts - 1:
                raise
            time.sleep(1.5 * (attempt + 1))
    return {}


def fetch_sparql(query: str, attempts: int = 5) -> dict:
    url = f"{SPARQL}?{urllib.parse.urlencode({'query': query, 'format': 'json'})}"
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(url, headers={**HEADERS, "Accept": "application/sparql-results+json"})
            with urllib.request.urlopen(request, timeout=60) as response:
                return json.load(response)
        except Exception:
            if attempt == attempts - 1:
                raise
            time.sleep(3 * (attempt + 1))
    return {}


def search(company: dict) -> tuple[str, list[str]]:
    query = re.sub(r"\b(?:LTD|LIMITED)\.?\b", "", company["name"], flags=re.I).strip(" .")
    data = fetch({
        "action": "wbsearchentities", "search": query, "language": "en",
        "uselang": "en", "type": "item", "limit": 5, "format": "json",
        "origin": "*",
    })
    return company["isin"], [row["id"] for row in data.get("search", [])]


def claim_values(entity: dict, property_id: str) -> list:
    values = []
    for claim in entity.get("claims", {}).get(property_id, []):
        value = claim.get("mainsnak", {}).get("datavalue", {}).get("value")
        if value is not None:
            values.append(value)
    return values


def main() -> None:
    universe = json.loads(UNIVERSE.read_text())
    companies = {}
    for index in universe["indices"].values():
        for company in index["constituents"]:
            if company.get("isin"):
                companies[company["isin"]] = company

    isins = sorted(companies)
    values = " ".join(json.dumps(value) for value in isins)
    query = f'''PREFIX wdt: <http://www.wikidata.org/prop/direct/>
SELECT ?company ?isin WHERE {{
  VALUES ?isin {{ {values} }}
  ?company wdt:P946 ?isin.
}}'''
    use_cache = "--from-cache" in sys.argv
    if use_cache:
        mapping_data = json.loads(Path("/tmp/mfpulse-wikidata-map.json").read_text())
    else:
        mapping_data = fetch_sparql(query)
    mapping = {
        row["isin"]["value"].upper(): row["company"]["value"].rsplit("/", 1)[-1]
        for row in mapping_data.get("results", {}).get("bindings", [])
    }
    entities = {}
    qids = sorted(set(mapping.values()))
    for batch_index, offset in enumerate(range(0, len(qids), 40)):
        if use_cache:
            data = json.loads(Path(f"/tmp/mfpulse-wikidata-entities-{batch_index}.json").read_text())
        else:
            data = fetch({
                "action": "wbgetentities", "ids": "|".join(qids[offset:offset + 40]),
                "props": "labels|descriptions|claims|sitelinks", "languages": "en",
                "sitefilter": "enwiki", "format": "json", "origin": "*",
            })
        entities.update(data.get("entities", {}))
        if not use_cache:
            time.sleep(0.4)

    profiles = {}
    for isin, qid in mapping.items():
        entity = entities.get(qid, {})
        websites = claim_values(entity, "P856")
        founded_values = claim_values(entity, "P571")
        founded = None
        if founded_values and isinstance(founded_values[0], dict):
            founded_match = re.search(r"[+-](\d{4})-", founded_values[0].get("time", ""))
            founded = int(founded_match.group(1)) if founded_match else None
        wiki_title = entity.get("sitelinks", {}).get("enwiki", {}).get("title")
        profiles[isin] = {
            "qid": qid,
            "label": entity.get("labels", {}).get("en", {}).get("value"),
            "description": entity.get("descriptions", {}).get("en", {}).get("value"),
            "officialWebsite": websites[0] if websites else None,
            "founded": founded,
            "wikipediaUrl": f"https://en.wikipedia.org/wiki/{urllib.parse.quote(wiki_title.replace(' ', '_'))}" if wiki_title else None,
            "sourceUrl": f"https://www.wikidata.org/wiki/{qid}",
            "matchBasis": "verified_isin",
        }

    payload = {
        "schemaVersion": 1,
        "retrievedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": {
            "name": "Wikidata",
            "url": "https://www.wikidata.org/wiki/Wikidata:Data_access",
            "license": "CC0",
        },
        "coveredCompanies": len(profiles),
        "universeCompanies": len(companies),
        "profilesByIsin": profiles,
    }
    OUTPUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {len(profiles)}/{len(companies)} verified or exact-match profiles to {OUTPUT}")


if __name__ == "__main__":
    main()
