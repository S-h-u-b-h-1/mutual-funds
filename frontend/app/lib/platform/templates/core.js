// Template Engine (Phase 4.5 — Step 5) — the fifth and last foundational primitive of the
// Provider Infrastructure Layer, needed by M5's Notification Infrastructure (every notification
// gets a template + variables) and reusable for emails, reports, documents, and advisor
// messages. See docs/TEMPLATE_ENGINE.md.
//
// Deliberately minimal, hand-rolled — Mustache/Handlebars-shaped syntax ({{var}}, {{{rawVar}}},
// {{#if x}}...{{/if}}, {{#unless x}}...{{/unless}}) covering exactly what the brief asks for
// (variables, conditional blocks) without pulling in a templating dependency this codebase has
// never used. No loops, no partials, no nested conditionals — real, deliberate scope limits,
// not oversights; see docs/TEMPLATE_ENGINE.md's extension guide for why.

const templates = new Map(); // key: `${name}@${locale}`

/**
 * Register a named, versioned, locale-scoped template.
 * opts: version (default '1.0.0'), locale (default 'en'), source (required template string),
 * sampleContext (default {} — used by previewTemplate()).
 */
export function registerTemplate(name, opts = {}) {
  if (!name || typeof name !== "string") throw new Error("registerTemplate: name is required");
  const { version = "1.0.0", locale = "en", source, sampleContext = {} } = opts;
  if (!source || typeof source !== "string") throw new Error("registerTemplate: source is required");
  templates.set(`${name}@${locale}`, { name, version, locale, source, sampleContext, registeredAt: new Date().toISOString() });
}

/** Locale-aware lookup with fallback to 'en' — the localization-readiness this module provides
 * today: register the same template name once per supported locale; a missing locale variant
 * transparently falls back rather than failing, so adding real translations later is additive. */
export function getTemplate(name, locale = "en") {
  return templates.get(`${name}@${locale}`) ?? templates.get(`${name}@en`) ?? null;
}

export function listTemplates() {
  return Array.from(templates.values()).map(({ name, version, locale }) => ({ name, version, locale }));
}

function resolvePath(context, path) {
  return path.split(".").reduce((value, key) => (value === undefined || value === null ? undefined : value[key]), context);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

const CONDITIONAL_RE = /\{\{#(if|unless)\s+([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
const RAW_VAR_RE = /\{\{\{([\w.]+)\}\}\}/g;
const ESCAPED_VAR_RE = /\{\{([\w.]+)\}\}/g;

/** Every plain interpolation variable ({{var}} / {{{var}}}) referenced in a template — NOT
 * conditional-block condition variables, which are legitimately allowed to be absent (that's
 * the point of a conditional). Used by strict-mode rendering to report missing variables. */
export function extractVariables(source) {
  const withoutConditionals = source.replace(CONDITIONAL_RE, (_, __, ___, inner) => inner);
  const found = new Set();
  for (const re of [RAW_VAR_RE, ESCAPED_VAR_RE]) {
    for (const match of withoutConditionals.matchAll(re)) found.add(match[1]);
  }
  return Array.from(found).sort();
}

/**
 * Renders a raw template string against a context object.
 * opts: strict (default true) — throw if a plain interpolation variable is missing from
 * context; conditional-block condition variables are exempt (see extractVariables).
 * opts: escape (default true) — {{var}} is HTML-escaped; {{{var}}} is always raw regardless of
 * this flag (the explicit triple-brace opt-out, same convention as Mustache/Handlebars).
 */
export function renderString(source, context = {}, opts = {}) {
  const { strict = true, escape = true } = opts;

  if (strict) {
    const missing = extractVariables(source).filter((path) => resolvePath(context, path) === undefined);
    if (missing.length > 0) {
      throw new Error(`Template rendering: missing required variable(s): ${missing.join(", ")}`);
    }
  }

  let out = source.replace(CONDITIONAL_RE, (_, keyword, path, inner) => {
    const value = resolvePath(context, path);
    const truthy = Boolean(value);
    const keep = keyword === "if" ? truthy : !truthy;
    return keep ? inner : "";
  });

  out = out.replace(RAW_VAR_RE, (_, path) => {
    const value = resolvePath(context, path);
    return value === undefined ? "" : String(value);
  });

  out = out.replace(ESCAPED_VAR_RE, (_, path) => {
    const value = resolvePath(context, path);
    if (value === undefined) return "";
    return escape ? escapeHtml(value) : String(value);
  });

  return out;
}

/** Render a registered template by name. Returns the rendered text plus the version/locale
 * actually used, so a caller (e.g. a future notification record) can record which template
 * version produced this specific piece of content. */
export function renderTemplate(name, context = {}, opts = {}) {
  const locale = opts.locale ?? "en";
  const tpl = getTemplate(name, locale);
  if (!tpl) throw new Error(`renderTemplate: template '${name}' is not registered for locale '${locale}' or its 'en' fallback`);
  return { text: renderString(tpl.source, context, opts), version: tpl.version, locale: tpl.locale, name: tpl.name };
}

/** Render a registered template against its own sample context — never strict (a preview must
 * never throw just because the sample data is intentionally partial), for admin/QA tooling to
 * see what a template produces without any real business logic or real user data involved. */
export function previewTemplate(name, locale = "en") {
  const tpl = getTemplate(name, locale);
  if (!tpl) return null;
  return { name: tpl.name, version: tpl.version, locale: tpl.locale, source: tpl.source, rendered: renderString(tpl.source, tpl.sampleContext, { strict: false }) };
}

/**
 * Structural validation: every {{#if}} has a matching {{/if}}, every {{#unless}} has a matching
 * {{/unless}}. Deliberately does NOT attempt full brace-balance/grammar validation — a stray
 * `{{` shows up as harmless literal text in the output, while a mismatched conditional block can
 * silently swallow or leak entire sections of real content, which is the failure mode worth
 * catching before a template ships.
 */
export function validateTemplateSyntax(source) {
  const issues = [];
  for (const keyword of ["if", "unless"]) {
    const opens = (source.match(new RegExp(`\\{\\{#${keyword}\\s+[\\w.]+\\}\\}`, "g")) ?? []).length;
    const closes = (source.match(new RegExp(`\\{\\{/${keyword}\\}\\}`, "g")) ?? []).length;
    if (opens !== closes) issues.push(`{{#${keyword}}} block count (${opens}) does not match {{/${keyword}}} count (${closes})`);
  }
  return { ok: issues.length === 0, issues };
}
