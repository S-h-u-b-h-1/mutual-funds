# Data Pipeline Map

Every process capable of writing to `fact_nav_daily`, `funds.json`, `performance.json`, or
`daily.json`, confirmed by reading every workflow file, checking git history for deleted
workflows, and directly diffing database contents — not assumed from documentation.

## The one NAV-writing pipeline

**`.github/workflows/production-refresh.yml`** → `scripts/cloud_pipeline.py` is the only process
that writes NAV data anywhere. Schedule: `30 14 * * 1-6` (evening, after AMFI publishes) +
`0 5 * * *` (morning catch-up for stragglers), plus `workflow_dispatch` for manual runs.

Within one run: download AMFI's `NAVAll.txt` once (shared by every later step, specifically to
prevent two downloads catching different snapshots) → `cloud_pipeline.py` writes every parsed row
to **both** Supabase (direct, unwrapped `_post()` calls — the critical path) **and** Neon (via
`ingestion/db.py`'s `dual_write()` — best-effort, catches and logs any exception without failing
the run) → `scripts/build_performance.py` + `scripts/build_daily.py` rebuild the three JSON
bundles from that same downloaded file → `pytest tests/` data-quality gate → commit → deploy →
alias `mf-pulse.vercel.app` → verify.

## Confirmed NOT NAV-writing (checked directly, not assumed)

- **`ci.yml`** — no schedule trigger at all; only reads Supabase via the public anon key for
  build/test purposes.
- **`factsheets.yml`** — real Supabase/Neon writes, but to `factsheet_archive`/metadata tables
  only (expense ratio, manager, holdings). Monthly schedule (`0 6 5 * *`), unrelated to NAV.
- **`news_ingest.yml`** — real Supabase/Neon writes, but to `news_articles` and related tables
  only. Runs every 15 minutes, unrelated to NAV.
- **`daily-nav.yml`** — confirmed genuinely deleted via `git log --diff-filter=D`, not just
  undocumented. Its retirement is recorded in the commit that consolidated everything into
  `production-refresh.yml` ("fix(pipeline): consolidate into one autonomous, self-healing
  production refresh").
- **`mfpulse-mirror` git remote** (`S-h-u-b-h-1/MF-Pulse.git`) — a legacy remote pointing at an
  old, differently-named repo. No evidence found that it runs any active CI against the same
  Supabase/Neon project; not chased further without a concrete reason to believe otherwise.

## Correction to the prior Freshness Matrix report

The earlier finding "Supabase = 2026-07-09, Neon = 2026-07-08" was **wrong, and the error was in
my own diagnostic tooling, not the system**: node-postgres's `pg` driver converts a plain SQL
`date` column into a JavaScript `Date` object using local-timezone interpretation, and
`JSON.stringify`/`console.log` then renders that `Date` in UTC — silently shifting every
unC-cast date I read back by one calendar day (IST is UTC+5:30). A direct `::text`-cast query
proves Neon's true latest `nav_date` is `2026-07-09`, identical to Supabase, with the exact same
2,105 scheme codes at that date in both databases. There is no second pipeline and no real
Supabase/Neon inconsistency — both are correctly, identically populated by the one pipeline
above. Every date comparison built for Mission 3/4 below uses `::text` casts (or otherwise avoids
the raw driver `Date` conversion) specifically to prevent this class of bug recurring.

## What's still real (unaffected by the above correction)

- `funds.json`/`performance.json`/`daily.json`'s baked-in `asOf: "2026-07-08"` is accurate as
  read (plain JSON string, no driver involved) — one day behind the database's raw latest
  (`2026-07-09`) by design: `cloud_pipeline.py`'s `src_date` is deliberately the max date among
  *equity* rows only, not the raw table-wide max, to avoid a `daily.json`/`funds.json` that
  reflects only a handful of early-arriving non-equity schemes.
- `mf-pulse.vercel.app` reporting `asOf: "2026-07-06"` — two full days behind even that bundle —
  is real and confirmed (`/api/freshness`, a plain JSON string comparison, immune to the timezone
  bug above). This is the one genuine, severe, unresolved gap: **the domain alias, not the data
  pipeline.**
