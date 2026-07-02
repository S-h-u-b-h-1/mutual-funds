"""
Deterministic market-reaction rule engine (Phase 4). Maps news keywords to mutual-fund
categories, sectors, and AMCs — every connection traces to an explicit, inspectable rule_id,
never an LLM guess. Language is always hedged ("may affect" / "relevant to" / "worth
monitoring") per the mission's explicit instruction not to overstate certainty.

Each rule: (rule_id, [trigger keywords, any match], category, [(entity_type, name), ...], relation).
Keyword matching is case-insensitive substring match on title + summary — simple, auditable,
zero hallucination risk. A rule fires at most once per article (first match wins per rule).
"""
from __future__ import annotations

import re

RULES = [
    ("rbi_rate_action",
     ["repo rate", "policy rate", "rate cut", "rate hike", "monetary policy committee", "mpc meet"],
     "rbi", [("category", "Debt"), ("category", "Liquid"), ("category", "Banking and PSU"), ("sector", "Banking")],
     "may affect"),
    ("sebi_mf_circular",
     # narrow, SEBI-specific triggers only — "asset management compan[y]" alone was removed:
     # it fired on routine AMC business news (AUM milestones, fund launches) that has nothing
     # to do with SEBI regulation, mislabeling it under the "sebi" category. Caught by manual
     # trace-through during verification, not assumed correct.
     ["sebi circular", "sebi press release", "sebi mutual fund", "sebi guidelines", "sebi norms", "sebi order"],
     "sebi", [("category", "Mutual Funds — AMC/Distributor"), ("sector", "Financial Services")],
     "relevant to"),
    ("mutual_fund_industry",
     # Deliberately distinct from sebi_mf_circular above (that one is SEBI *regulatory* action
     # only). This rule is for routine MF industry/business news: NFO launches, fund manager
     # moves, AUM/SIP milestones, scheme mergers, new category launches — none of which are
     # SEBI circulars and shouldn't be mislabeled "sebi". No overlapping keywords with that rule.
     ["nfo alert", "new fund offer", "fund manager change", "fund manager exit", "fund manager joins",
      "aum milestone", "crosses aum", "lakh crore aum", "crore aum", "scheme merger", "fund merger",
      "mutual fund launches", "amc launches", "mutual fund crosses", "sip book"],
     "mutual_fund", [("category", "Mutual Funds — Industry")],
     "relevant to"),
    ("oil_price",
     ["crude oil", "oil price", "opec", "brent crude"],
     "sector", [("sector", "Energy"), ("sector", "Transport")],
     "may affect"),
    ("banking_earnings",
     ["bank results", "bank earnings", "bank profit", "quarterly results", "q1 results", "q2 results", "q3 results", "q4 results"],
     "earnings", [("sector", "Banking"), ("sector", "Financial Services"), ("category", "Large Cap")],
     "may affect"),
    ("inflation_data",
     ["inflation", "cpi data", "wpi data", "consumer price index", "wholesale price index"],
     "macro", [("category", "Debt"), ("category", "Gilt")],
     "worth monitoring"),
    ("gdp_growth",
     ["gdp growth", "gdp data", "economic growth rate", "gva growth"],
     "macro", [("category", "Large Cap"), ("category", "Flexi Cap")],
     "relevant to"),
    ("fii_dii_flows",
     ["fii inflow", "fii outflow", "dii inflow", "foreign portfolio investor", "institutional flows"],
     "market_moving", [("category", "Large Cap"), ("category", "Flexi Cap"), ("category", "Mid Cap")],
     "worth monitoring"),
    ("rupee_currency",
     ["rupee falls", "rupee gains", "rupee depreciat", "rupee appreciat", "dollar index", "usd/inr"],
     "macro", [("category", "Debt"), ("sector", "IT"), ("sector", "Export-linked")],
     "may affect"),
    ("it_sector",
     ["it sector", "software export", "technology stocks", "it services"],
     "sector", [("sector", "IT"), ("category", "Sectoral/ Thematic")],
     "relevant to"),
    ("pharma_sector",
     ["pharma sector", "drug approval", "usfda", "healthcare stocks", "pharma stocks"],
     "sector", [("sector", "Healthcare"), ("category", "Sectoral/ Thematic")],
     "relevant to"),
    ("auto_sector",
     ["auto sales", "vehicle sales", "automobile sector", "ev sales"],
     "sector", [("sector", "Auto"), ("category", "Sectoral/ Thematic")],
     "relevant to"),
    ("gold_price",
     ["gold price", "bullion", "gold rate"],
     "sector", [("sector", "Commodities"), ("category", "Gold ETF")],
     "may affect"),
    ("sensex_nifty_move",
     ["sensex surges", "sensex falls", "sensex crashes", "nifty surges", "nifty falls", "nifty crashes",
      "sensex rallies", "nifty rallies", "sensex plunges", "nifty plunges"],
     "market_moving", [("index", "Nifty 50"), ("index", "Sensex")],
     "relevant to"),
    ("ipo_market",
     ["ipo listing", "public offer", "ipo subscription", "ipo allotment"],
     "market_moving", [("category", "Small Cap"), ("category", "Mid Cap")],
     "worth monitoring"),
    ("amfi_data",
     ["amfi data", "mutual fund aum", "sip inflow", "folio count", "industry aum"],
     "amfi", [("category", "Mutual Funds — Industry")],
     "relevant to"),
    ("global_cues",
     ["federal reserve", "fed rate", "wall street", "us markets", "global markets", "fomc"],
     "global", [("category", "Large Cap"), ("sector", "IT")],
     "may affect"),
    ("credit_rating",
     ["rating downgrade", "rating upgrade", "credit rating action", "crisil rating", "icra rating"],
     "corporate", [("category", "Credit Risk"), ("category", "Corporate Bond")],
     "may affect"),
    ("liquidity_rbi",
     ["liquidity infusion", "reverse repo", "vrrr", "banking liquidity", "system liquidity"],
     "rbi", [("category", "Liquid"), ("category", "Overnight"), ("category", "Money Market")],
     "relevant to"),
]

POSITIVE_WORDS = ["surge", "rally", "gain", "growth", "rise", "upgrade", "record high", "outperform",
                   "recovery", "beat estimates", "robust", "strong quarter"]
NEGATIVE_WORDS = ["fall", "decline", "crash", "plunge", "downgrade", "weak", "concern", "slowdown",
                   "penalty", "fraud", "crisis", "default", "miss estimates", "sell-off", "selloff"]

# Canonical AMC names, sourced from the 51 distinct `amc` field values in
# frontend/app/data/funds.json (read and extracted directly — not guessed from memory).
# Matched as whole-word/whole-phrase, case-insensitive, against title+summary.
#
# Deliberately EXCLUDED (precision-over-recall, same discipline as the sebi_mf_circular fix —
# each of these was checked against real ET Markets/ET MF RSS data and produces false positives
# or collides with a distinct, unrelated real-world entity of the same name):
#   - Union            -> "Union Bank", "Union Budget", "Union government/minister" (confirmed
#                          false positive live: "Dividend Alert...Union Bank" matched as "Union")
#   - Trust             -> generic English word ("investor trust", "trust the market", etc.)
#   - Choice            -> generic English word
#   - Quantum           -> generic word (physics, "quantum leap", unrelated brand names)
#   - quant             -> generic finance jargon; substring/whole-word inside "quantitative",
#                          "quant fund" used generically for the fund style, not this specific AMC
#                          (confirmed live: matched inside "quantitative" in an unrelated NFO story)
#   - Navi              -> "Navi Mumbai" is one of the most common place names in Indian business
#                          news; also generic "navigate/navigating" collides on substring match
#                          (confirmed live: matched inside "navigating" in an unrelated MF story)
#   - Bank of India     -> that's a full-fledged bank; "AMC's" business news would be swamped by
#                          unrelated Bank of India (the lender) stock/results coverage
#   - LIC               -> LIC (Life Insurance Corporation) is a giant, extremely frequently
#                          covered entity in its own right (IPO, stock, policies); using it as an
#                          "AMC mention" rule would mislabel most LIC-the-insurer news as MF-relevant
#   - NJ                -> two letters, far too generic/short to safely match
#   - Helios, Taurus, Unifi -> generic English/brand words used across unrelated industries
#                          (Greek myth/sun, zodiac sign, well-known Wi-Fi router brand); no live
#                          false positive caught in this session's sample, but the collision risk
#                          is well-known and the sample size fetched doesn't rule it out
#
# Kept names were verified either as safe/distinctive on their own (multi-word phrases, unusual
# proper nouns, unambiguous finance-specific acronyms), or matched correctly with no observed
# false positive in the ~100 live articles spot-checked this session.
AMC_NAMES = [
    "360 ONE", "Abakkus", "Aditya Birla Sun Life", "Angel One", "Bajaj Finserv",
    "Baroda BNP Paribas", "Canara Robeco", "Capitalmind", "DSP", "Edelweiss",
    "Franklin Templeton", "Groww", "ICICI Prudential", "IL&FS", "ITI",
    "Invesco", "JM Financial", "Jio BlackRock", "Mahindra Manulife",
    "Mirae Asset", "Motilal Oswal", "Nippon India", "Old Bridge", "PGIM India", "PPFAS",
    "Samco", "Shriram", "Sundaram", "The Wealth Company",
    "WhiteOak Capital", "Zerodha",
]

# These names are real AMC names from funds.json, but the SAME brand name also belongs to a much
# larger, much more frequently covered non-MF entity (a bank, an auto/telecom/insurance group, or
# a PSU) — a bare substring/whole-word match on the group name alone is very often about that
# other business, not the AMC. Confirmed live this session: "HDFC Bank shares...", "Tata Motors
# CV posts...", "Kotak Mahindra Bank signs deal", "Axis Bank CFO resigns", "Bandhan Bank CFO to
# step down", "SBI Report" (on EVs, unrelated to SBI MF), "HSBC" sponsoring an economy PMI survey
# — none of these are mutual-fund news, yet a bare-name rule would have linked all of them to the
# AMC. Rather than skip these entirely (real MF news about these AMCs is common and worth
# capturing — e.g. "HDFC Mid Cap Fund hits Rs 1 lakh crore AUM"), require an MF-context qualifier
# word to co-occur in the same blob before linking. This keeps recall for genuine MF stories about
# these AMCs while dropping the bank/group noise.
AMC_NAMES_REQUIRE_CONTEXT = [
    "Axis", "Bandhan", "HDFC", "HSBC", "Kotak Mahindra", "SBI", "Tata",
]
AMC_CONTEXT_QUALIFIERS = [
    "mutual fund", "amc", "asset management", "fund house", "nfo", "new fund offer",
    " sip ", "sip inflow", "sip book", "aum", " mf ", "fund manager", "fund scheme",
    "equity fund", "debt fund", "hybrid fund", "index fund", "liquid fund", "gold etf",
    "cap fund", "duration fund", "folio",
]


def detect_amc_mentions(blob: str, amc_names: list[str], context_names: list[str] | None = None,
                         context_qualifiers: list[str] | None = None) -> list[dict]:
    """Whole-word/whole-phrase, case-insensitive match of canonical AMC names against the
    already-lowercased title+summary blob. Returns entity links with rule_id="amc_mention" so
    every match traces back to exactly which name fired — no fuzzy/inferred matching.

    Names in `context_names` (e.g. "HDFC", "Tata") also match a much larger non-MF sibling brand
    (a bank, an auto/insurance group, etc.) — for those, only link if an MF-context qualifier
    (e.g. "mutual fund", "AMC", "NFO") also appears in the blob, so a plain "HDFC Bank shares
    fall" story doesn't get mislabeled as HDFC AMC news."""
    context_names = context_names or []
    context_qualifiers = context_qualifiers or []
    has_context = any(q in blob for q in context_qualifiers)

    hits = []
    for name in amc_names:
        pat = r"\b" + re.escape(name.lower()) + r"\b"
        if not re.search(pat, blob):
            continue
        if name in context_names and not has_context:
            continue
        hits.append({"entity_type": "amc", "name": name, "relation": "relevant to", "rule_id": "amc_mention"})
    return hits


def classify(title: str, summary: str) -> dict:
    """Deterministic classification: category, linked entities (with rule_id), sentiment, scores.
    Every field traces to a keyword hit — nothing here is a model's guess."""
    blob = f"{title} {summary or ''}".lower()

    links = []  # (entity_type, name, relation, rule_id)
    categories_hit = []
    for rule_id, keywords, category, entities, relation in RULES:
        if any(k in blob for k in keywords):
            categories_hit.append(category)
            for etype, ename in entities:
                links.append({"entity_type": etype, "name": ename, "relation": relation, "rule_id": rule_id})

    category = categories_hit[0] if categories_hit else None

    links.extend(detect_amc_mentions(blob, AMC_NAMES + AMC_NAMES_REQUIRE_CONTEXT, AMC_NAMES_REQUIRE_CONTEXT, AMC_CONTEXT_QUALIFIERS))

    pos_hits = [w for w in POSITIVE_WORDS if w in blob]
    neg_hits = [w for w in NEGATIVE_WORDS if w in blob]
    if pos_hits and neg_hits:
        sentiment, matched = "mixed", pos_hits + neg_hits
    elif pos_hits:
        sentiment, matched = "positive", pos_hits
    elif neg_hits:
        sentiment, matched = "negative", neg_hits
    else:
        sentiment, matched = "neutral", []

    # importance: base is 0, rises with each distinct rule matched (real signal density), capped
    importance = min(100, len(categories_hit) * 20)
    # market relevance: how many entities this article connects to, capped
    relevance = min(100, len(links) * 15)

    return {
        "category": category, "links": links, "sentiment_label": sentiment,
        "matched_keywords": matched, "importance_score": importance, "market_relevance_score": relevance,
    }


def strip_html(text: str) -> str:
    """RSS descriptions sometimes carry inline HTML — strip tags, collapse whitespace. Never
    rewrites or summarizes content, only removes markup so it's readable plain text."""
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&nbsp;|&#160;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:500]
