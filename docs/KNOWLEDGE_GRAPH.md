# Knowledge Graph — MF Pulse

Canonical entities + queryable relationships, built from data already in hand
(`scripts/build_knowledge_graph.py` → `data/warehouse/knowledge_graph.json`). No fabricated edges.

## Entities
| Entity | Count | Coverage |
|---|---:|---|
| Funds | 14,224 | universe (100%) |
| AMCs | 51 | universe |
| Categories | 44 | universe |
| Benchmarks | 61 | universe (90% of funds mapped) |
| Managers (canonical) | 3 | factsheet (SBI) |
| Companies (holdings) | 42 | factsheet (SBI) |
| Sectors | 52 | factsheet (SBI) |

Managers are de-duplicated into canonical people (titles/spelling normalized) so "R. Srinivasan"
is one entity regardless of how a factsheet writes it.

## Queryable relationships (inverted indices, O(1))
- `amc → funds`, `category → funds`, `benchmark → funds` — **universe-wide**.
- `manager → funds`, `company → funds (holding it)`, `sector → AMCs` — **factsheet-sourced (SBI today)**.

## Example queries (answered from the graph)
- **Every fund managed by X** → e.g. Mohit Jain → 8 SBI funds.
- **Every fund holding Reliance Industries** → returns SBI funds with Reliance in disclosed holdings.
- **Every AMC with Banking exposure** → from sector allocations.
- **Every fund benchmarked to NIFTY 50 TRI** → 152 funds.

## Honest coverage note
AMC / category / benchmark edges are complete (universe-wide, from AMFI + the SEBI benchmark map).
Manager / holdings / sector edges are as complete as the factsheet metadata behind them — currently
SBI only. They expand automatically as factsheet adapters come online (see AMC_ADAPTER_ROADMAP.md).
The graph never invents an edge: a fund→manager link exists only if a real factsheet named that manager.
