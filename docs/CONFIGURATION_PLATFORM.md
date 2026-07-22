# Configuration Platform (Phase 4.5 — Step 3)

The third shared primitive of the Provider Infrastructure Layer: centralizes environment
validation, fail-fast startup checks, per-provider structured configuration (timeouts, retries,
circuit-breaker thresholds, rate limits), and server-side operational flags.

Code: [frontend/app/lib/platform/config/core.js](../frontend/app/lib/platform/config/core.js)

## 1. Two distinct flag systems — do not confuse them

This module's flags (`isPlatformFlagEnabled`, env prefix `PLATFORM_FLAG_*`) are **server-side
operational toggles** — "is the new BSE adapter enabled," "is the notification engine's
WhatsApp channel enabled." They default off and are never sent to the client.

[`frontend/app/lib/featureFlags.js`](../frontend/app/lib/featureFlags.js) (Phase 8) is a
**separate, pre-existing, working system** for **client-exposed premium-feature gating**
(env prefix `NEXT_PUBLIC_FLAG_*`) — "Daily AI Brief," "Portfolio Analyzer," user-facing tier
switches. It is untouched by this milestone. The two solve different problems for different
audiences; a test in this module (`isPlatformFlagEnabled` reads `PLATFORM_FLAG_*`, not
`NEXT_PUBLIC_FLAG_*`) proves they don't cross-contaminate.

## 2. Startup validation

```js
import { validateStartup, PLATFORM_CONFIG_SCHEMA } from "../platform/config/core.js";

validateStartup(PLATFORM_CONFIG_SCHEMA); // throws ONE aggregated error if anything required is missing
```

`validateStartup` checks every entry in a schema at once and throws a **single** error listing
**every** missing required variable — better startup DX than discovering them one at a time
across separate call sites as the process crashes deeper and deeper into its own logic.

`PLATFORM_CONFIG_SCHEMA` currently lists just `DATABASE_URL` (required by every platform
subsystem). It is deliberately not a dumping ground for every env var the app uses — optional,
already-feature-gated vars (the OAuth client IDs, `RESEND_API_KEY`, etc. in `app/lib/auth.js`)
correctly stay optional; adding them here would make the app fail to start in configurations
where they're legitimately absent by design. Per-provider requirements (a future email
provider's API key) belong in that provider's own schema, validated at its own entry point —
not bolted onto the platform-wide schema.

**Wired into `frontend/scripts/jobs_worker_tick.mjs`** as the first real, low-risk consumer —
the cron worker now fails fast with one clear message instead of `runWorkerTick` eventually
hitting a low-level connection error several calls deep. The workflow's existing shell-level
`DATABASE_URL` guard step in `.github/workflows/jobs-worker.yml` stays in place as harmless,
now-redundant defense-in-depth (not removed in this pass — a CI/CD workflow edit is a separate,
lower-priority cleanup, not required for this milestone to deliver real value).

**Deliberately not wired into `app/lib/db.js`.** `db.js` already has decent fail-fast behavior
of its own (`hasDatabaseUrl`, a clear error thrown on first real use inside `getPool()`) — adding
a second, module-load-time check there would be redundant for zero behavioral gain, and `db.js`
is imported by dozens of files across every route Next.js bundles at build time, which needs
more careful build-time-safety verification than this milestone's scope warrants before touching
a file that central.

## 3. Per-provider structured configuration

```js
import { getProviderConfig } from "../platform/config/core.js";

const cfg = getProviderConfig("bse-star-mf", { timeoutMs: 8000 });
// { name, timeoutMs, maxAttempts, circuitBreaker: { failureThreshold, cooldownMs }, rateLimitPerMinute }
```

Merge order: **built-in defaults** (`timeoutMs: 10000, maxAttempts: 3, circuitBreaker:
{failureThreshold: 0.5, cooldownMs: 30000}, rateLimitPerMinute: 60`) → **caller-supplied
defaults** (the `{timeoutMs: 8000}` above) → **environment overrides**, using a consistent
naming convention derived from the provider name:

| Field | Env var (for `bse-star-mf`) |
|---|---|
| `timeoutMs` | `PROVIDER_BSE_STAR_MF_TIMEOUT_MS` |
| `maxAttempts` | `PROVIDER_BSE_STAR_MF_MAX_ATTEMPTS` |
| `circuitBreaker.failureThreshold` | `PROVIDER_BSE_STAR_MF_CB_FAILURE_THRESHOLD` |
| `circuitBreaker.cooldownMs` | `PROVIDER_BSE_STAR_MF_CB_COOLDOWN_MS` |
| `rateLimitPerMinute` | `PROVIDER_BSE_STAR_MF_RATE_LIMIT_PER_MINUTE` |

Non-alphanumeric characters in the provider name are sanitized to `_` for the env prefix, so
`bse-star-mf` and a hypothetical `bse star mf` both resolve to the same `BSE_STAR_MF_` prefix.
This means any future provider gets env-overridable operational tuning for free — an ops team
can turn down a struggling provider's timeout or tighten its circuit breaker via a deploy-time
env var change, with zero code change.

## 4. Extension guide

**A new provider wanting configuration:**

```js
import { getProviderConfig } from "../platform/config/core.js";
import { createCircuitBreaker } from "../platform/circuitBreaker/core.js";

const config = getProviderConfig("payments-gateway", { timeoutMs: 15_000 });
const breaker = createCircuitBreaker("payments-gateway", config.circuitBreaker);
```

**A new required secret for an existing subsystem:** add an entry to that subsystem's own
schema and call `validateStartup` at its entry point — do not grow `PLATFORM_CONFIG_SCHEMA`
for anything that isn't a genuinely platform-wide dependency.

**A new operational toggle:** `isPlatformFlagEnabled("MY_NEW_TOGGLE")`, set via
`PLATFORM_FLAG_MY_NEW_TOGGLE=true` in the environment. No registration needed — it's a pure
env-var read, matching the simplicity of the existing client-side flag system.

## 5. Failure modes & recovery

| Failure | Behavior | Recovery |
|---|---|---|
| A required platform var is missing at script startup | `validateStartup` throws immediately with every missing var listed, before any real work happens | Set the missing var(s); the error message names each one |
| A provider-specific env override has an invalid (non-numeric) value | `Number(...)` produces `NaN`, which propagates into the returned config silently | Not currently validated — a genuine limitation; a future strict-mode addition could reject non-numeric overrides at read time. No current caller has hit this, so it isn't fixed speculatively (see Testing note below) |
| `getProviderConfig` called without a provider name | Throws immediately (`providerName is required`) | Fix the call site |

## 6. Testing

- **Unit tests** (`core.test.js`, 18 tests): `requireEnv`/`optionalEnv` presence and default
  behavior, `validateStartup`'s single-aggregated-error behavior and its ignoring of
  non-required missing entries, `PLATFORM_CONFIG_SCHEMA`'s DATABASE_URL requirement,
  `isPlatformFlagEnabled`'s exact-match-on-`'true'` semantics and its non-interference with the
  client-side flag system's env prefix, `getProviderConfig`'s three-way merge (built-in →
  caller → env) and provider-name sanitization for the env prefix.
- Tests isolate `process.env` mutations via `vi.stubEnv`/`vi.unstubAllEnvs` (afterEach), so no
  test leaks environment state into another.
- **Integration**: the real, live wiring into `jobs_worker_tick.mjs` — run manually against a
  real `DATABASE_URL` during development (confirmed a silent no-op when the var is present, and
  the rest of the tick executed identically to before this change).
- **Route / Real-Neon tests**: not applicable — this module has no database or route surface of
  its own.
- **Deployment verification**: `npm run build` clean (confirms `db.js`/config module imports
  don't require `DATABASE_URL` at Next.js build time, matching the documented decision not to
  wire validation into `db.js`), full suite green.

## 7. Verification record

- 18/18 unit tests green.
- `jobs_worker_tick.mjs` run manually against production `DATABASE_URL`: `validateStartup`
  passed silently, `runWorkerTick` processed 17 real queued jobs exactly as it did before this
  change was added — proves the wiring adds zero behavioral risk when config is present.
- Full suite green after adding this module.
- Lint clean, production build clean.
