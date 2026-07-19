# Acquisition Backlog — 2026-07-16

Ranked by user impact. Auto-generated from the coverage audit.

| Priority | Item | Missing | Impact | Expected source | Reason |
|---|---|---:|---|---|---|
| P0 | Missing schemes (NFOs since snapshot) | 3 | critical | AMFI:NAVAll | snapshot lag |
| P1 | Expense ratio | 13,987.0 | high | AMC factsheet PDF | parser not extracting TER / non-SBI factsheets blocked (pdfplumber on Py3.13) |
| P1 | Holdings | 13,983 | high | AMC factsheet PDF / monthly portfolio | monthly portfolio disclosures not yet ingested |
| P1 | Fund manager | 13,404 | high | AMC factsheet PDF | non-SBI factsheets unparsed; SBI manager field sparse |
| P2 | AUM | 13,254 | medium | AMC factsheet PDF / AMFI | only SBI factsheets parsed |
| P2 | Index-return alpha | 3,454 | medium | index NAV series | benchmark index NAV series not ingested — peer-relative only |
| P2 | Benchmark (all schemes) | 2,004 | medium | SEBI category map | FMP/index/niche categories unmapped |

**Highest impact:** factsheet metadata (expense ratio, manager, holdings, AUM) — covered for SBI only.
Unblock by running the non-SBI factsheet parsers on a Python 3.13 worker (pdfplumber/camelot),
which don't install on the 3.14 dev sandbox. Scheme + NAV + performance coverage is already complete.
