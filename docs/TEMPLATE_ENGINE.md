# Template Engine (Phase 4.5 — Step 5)

The fifth and last foundational primitive of the Provider Infrastructure Layer, needed directly
by M5's Notification Infrastructure (every notification gets a template + variables) and
reusable for emails, reports, documents, and advisor messages as those subsystems land.

Code: [frontend/app/lib/platform/templates/core.js](../frontend/app/lib/platform/templates/core.js)

## 1. Why hand-rolled, not a library

No templating dependency exists anywhere in this codebase today — the current notification
"templates" (`notifications.js`'s copy maps, `documentService.js`'s title defaults) are plain
JS string interpolation with no variable syntax at all. Rather than introduce a new dependency
for a feature set that's explicitly just "variables" and "conditional blocks," this is a
minimal, auditable, Mustache/Handlebars-*shaped* renderer covering exactly the brief's named
requirements:

```
{{var}}              interpolation, HTML-escaped by default
{{{rawVar}}}          interpolation, never escaped (explicit opt-out, same convention as Mustache)
{{#if cond}}...{{/if}}          conditional block
{{#unless cond}}...{{/unless}}  inverse conditional block
```

**Deliberately excluded**: loops, partials/includes, nested conditionals. These are real,
considered scope limits, not oversights — nothing in the brief asks for iteration or template
composition, and every one of the invest-domain notification/document use cases this needs to
serve (a single flat message with a handful of variables and optional sections) is expressible
without them. If a future report template genuinely needs to iterate over a list (e.g. a
holdings table), that's the moment to extend the grammar — not before there's a real caller
needing it.

## 2. Escaping — a security decision made now, for a future consumer

Today's callers all render plain-text notification bodies. But this engine's stated purpose
includes emails, and an HTML email genuinely can carry a stored-XSS risk if a user-controlled
variable (e.g. an account holder's own display name field) gets interpolated unescaped into
HTML that's later rendered by a mail client or web view. Rather than defer that decision to
whoever builds the email adapter, `{{var}}` escapes by default *now* — `{{{var}}}` is the
explicit, visible opt-out for the (currently nonexistent) case where raw HTML is genuinely
wanted. This costs nothing for today's plain-text callers (escaping a plain string with no
special characters is a no-op) and removes an entire class of mistake for tomorrow's HTML
callers.

## 3. Variables vs. conditional-block conditions — different missing-value semantics

`extractVariables()` and strict-mode rendering only concern themselves with plain interpolation
references (`{{var}}` / `{{{var}}}`) — **not** the condition variable inside a
`{{#if cond}}`/`{{#unless cond}}` block. This is a deliberate, load-bearing distinction:

- A missing `{{name}}` in "Hi {{name}}!" is almost always a bug — it renders as "Hi !", visibly
  broken. Strict mode throws on this by default.
- A missing `cond` in `{{#if hasMiddleName}}...{{/if}}` is the *expected*, correct case a
  conditional exists to handle — "if the user doesn't have a middle name, skip this section" is
  the whole point. Treating an absent condition variable as falsy (and never throwing for it,
  even in strict mode) is correct, not a gap.

## 4. Registration, versioning, localization, preview

```js
import { registerTemplate, renderTemplate, previewTemplate } from "../platform/templates/core.js";

registerTemplate("investment-ready", {
  version: "1.0.0",
  locale: "en",
  source: "You're investment-ready!{{#if advisorName}} Reach out to {{advisorName}} to get started.{{/if}}",
  sampleContext: { advisorName: "Priya" }, // used by previewTemplate(), never real data
});

const { text, version } = renderTemplate("investment-ready", { advisorName: null });
// text: "You're investment-ready!"  version: "1.0.0" — record which version actually rendered

previewTemplate("investment-ready"); // renders against sampleContext, non-strict, for admin/QA UIs
```

**Versioning**: every registration carries a `version`; `renderTemplate()` returns it alongside
the rendered text specifically so a caller (a future notification record, an audit log entry)
can record *which version* produced a given piece of real, sent content — useful the day a
template's wording changes and someone needs to know what an already-sent message actually said.

**Localization-ready, not localized**: templates are keyed `${name}@${locale}`. Registering the
same name under multiple locales and calling `renderTemplate(name, ctx, {locale: 'fr'})` picks
the right variant; a missing locale variant transparently falls back to `'en'` rather than
failing. No real translations exist yet (there is exactly one locale in production today) — this
is the *architecture* the brief asks for, proven by the fallback test, ready for real translated
`source` strings to be registered later without any code change.

**Preview**: `previewTemplate(name)` always renders non-strict against the template's own
`sampleContext` — it must never throw just because sample data is intentionally partial, since
its whole purpose is letting an admin/QA surface see what a template produces without any real
user data or business logic involved.

## 5. Extension guide

**A new notification/email/report template** — register it once (typically at the module level
of whatever subsystem owns it, same side-effect-import convention as every other registry in
this codebase) and render it wherever the message is actually sent:

```js
registerTemplate("order-completed", {
  source: "Your order for {{schemeName}} has settled. {{units}} units at ₹{{nav}}.",
  sampleContext: { schemeName: "Sample Fund", units: 10.5, nav: 25.4 },
});
// later, in orderService.js:
const { text } = renderTemplate("order-completed", { schemeName, units, nav });
```

**Validating a template before it ships** — `validateTemplateSyntax(source)` catches the one
structural mistake that can silently break rendering (a mismatched `{{#if}}`/`{{/if}}` or
`{{#unless}}`/`{{/unless}}` count). It deliberately does *not* attempt full brace-balance or
grammar validation — a stray `{{` shows up as harmless literal text in the output, while a
mismatched conditional block can silently swallow or leak an entire section of real content,
which is the failure mode actually worth catching.

## 6. Failure modes & recovery

| Failure | Behavior | Recovery |
|---|---|---|
| `registerTemplate()` without a name or source | Throws immediately | Fix the call site |
| `renderTemplate()` for an unregistered name (in the requested locale AND its 'en' fallback) | Throws with the name and locale named | Register the template, or fix the lookup name |
| Strict-mode `renderString`/`renderTemplate` with a missing plain-interpolation variable | Throws listing every missing variable at once | Supply the missing context field(s), or pass `{strict: false}` if partial rendering is genuinely intended |
| A conditional's condition variable is absent | Treated as falsy, block skipped — never an error, even in strict mode | N/A, by design |
| Unbalanced `{{#if}}`/`{{/if}}` in a template source | Not caught by `renderString` itself (the regex simply won't match the unbalanced pair, so the raw `{{#if ...}}` marker leaks into the output as literal text) | Call `validateTemplateSyntax()` before registering/shipping a new template — this is exactly the mistake it's built to catch |

## 7. Testing

- **Unit tests** (`core.test.js`, 28 tests): registration defaults and locale fallback,
  `extractVariables`'s exclusion of conditional-condition variables, dot-path resolution,
  escaped-vs-raw interpolation, strict-mode missing-variable errors (both throwing and
  non-throwing paths), `{{#if}}`/`{{#unless}}` truthy/falsy/absent behavior, composed
  conditional+interpolation templates, `renderTemplate`'s version/locale/name return contract
  and locale fallback end-to-end, `previewTemplate`'s never-throws guarantee even against
  incomplete sample data, and `validateTemplateSyntax`'s if/unless mismatch detection
  (independently and combined).
- **Route / Real-Neon / Integration tests**: not applicable — this module has no database or
  route surface of its own, matching Retry/Circuit-Breaker/Configuration. Its real integration
  proof arrives with M5 (step 6), the first subsystem that actually renders templates into real
  sent notifications — deferred deliberately rather than bolting a demonstration onto working,
  tested notification code ahead of when it's meant to change.
- **Deployment verification**: `npm run build` clean, full suite green.

## 8. Verification record

- 28/28 unit tests green.
- Full suite green after adding this module (no other file touches it yet — zero regression
  risk to existing subsystems, same posture as Retry and Circuit Breaker).
- Lint clean, production build clean.
