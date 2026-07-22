import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import {
  registerTemplate,
  getTemplate,
  listTemplates,
  extractVariables,
  renderString,
  renderTemplate,
  previewTemplate,
  validateTemplateSyntax,
} from "./core.js";

const RUN = crypto.randomBytes(3).toString("hex");
const T = (name) => `test-${RUN}-${name}`;

describe("registerTemplate / getTemplate", () => {
  it("requires a name and a source", () => {
    expect(() => registerTemplate()).toThrow(/name is required/);
    expect(() => registerTemplate(T("no-source"))).toThrow(/source is required/);
  });

  it("applies default version 1.0.0 and locale 'en'", () => {
    const name = T("defaults");
    registerTemplate(name, { source: "Hi {{name}}" });
    const tpl = getTemplate(name);
    expect(tpl).toMatchObject({ name, version: "1.0.0", locale: "en" });
  });

  it("falls back to the 'en' variant when a specific locale isn't registered", () => {
    const name = T("locale-fallback");
    registerTemplate(name, { source: "Hello {{name}}", locale: "en" });
    expect(getTemplate(name, "fr")).toMatchObject({ locale: "en" });
  });

  it("returns the exact locale variant when it IS registered", () => {
    const name = T("locale-exact");
    registerTemplate(name, { source: "Hello {{name}}", locale: "en" });
    registerTemplate(name, { source: "Bonjour {{name}}", locale: "fr" });
    expect(getTemplate(name, "fr").source).toBe("Bonjour {{name}}");
  });

  it("returns null for a name that was never registered at all", () => {
    expect(getTemplate(T("never-registered"))).toBeNull();
  });
});

describe("listTemplates", () => {
  it("includes a registered template's name/version/locale", () => {
    const name = T("list-me");
    registerTemplate(name, { source: "x", version: "2.0.0" });
    expect(listTemplates()).toContainEqual({ name, version: "2.0.0", locale: "en" });
  });
});

describe("extractVariables", () => {
  it("finds plain and raw interpolation variables, deduped and sorted", () => {
    expect(extractVariables("Hi {{name}}, your {{{rawAmount}}} is due, {{name}} again")).toEqual(["name", "rawAmount"]);
  });

  it("finds dot-path variables", () => {
    expect(extractVariables("Hi {{user.name}}, account {{user.account.id}}")).toEqual(["user.account.id", "user.name"]);
  });

  it("does NOT include conditional-block condition variables — those are allowed to be absent", () => {
    expect(extractVariables("{{#if isVip}}VIP {{tier}}{{/if}} member {{name}}")).toEqual(["name", "tier"]);
  });
});

describe("renderString", () => {
  it("substitutes plain variables, including dot-paths", () => {
    expect(renderString("Hi {{user.name}}, you have {{count}} items", { user: { name: "Asha" }, count: 3 })).toBe(
      "Hi Asha, you have 3 items"
    );
  });

  it("HTML-escapes {{var}} but leaves {{{var}}} raw", () => {
    const ctx = { unsafe: "<b>bold</b>" };
    expect(renderString("Escaped: {{unsafe}}", ctx)).toBe("Escaped: &lt;b&gt;bold&lt;/b&gt;");
    expect(renderString("Raw: {{{unsafe}}}", ctx)).toBe("Raw: <b>bold</b>");
  });

  it("escape:false renders {{var}} raw too", () => {
    expect(renderString("{{unsafe}}", { unsafe: "<b>x</b>" }, { escape: false })).toBe("<b>x</b>");
  });

  it("strict mode (default) throws with every missing variable named, when a plain interpolation is unresolved", () => {
    expect(() => renderString("Hi {{name}}, ref {{ref}}", {})).toThrow(/missing required variable\(s\): name, ref/);
  });

  it("non-strict mode renders a missing variable as empty string instead of throwing", () => {
    expect(renderString("Hi {{name}}!", {}, { strict: false })).toBe("Hi !");
  });

  it("{{#if}} keeps its content when the condition is truthy, removes it when falsy or absent", () => {
    expect(renderString("{{#if isVip}}VIP{{/if}} member", { isVip: true })).toBe("VIP member");
    expect(renderString("{{#if isVip}}VIP{{/if}} member", { isVip: false })).toBe(" member");
    expect(renderString("{{#if isVip}}VIP{{/if}} member", {})).toBe(" member"); // absent, not an error
  });

  it("{{#unless}} is the inverse of {{#if}}", () => {
    expect(renderString("{{#unless isVip}}Regular{{/unless}} member", { isVip: true })).toBe(" member");
    expect(renderString("{{#unless isVip}}Regular{{/unless}} member", {})).toBe("Regular member");
  });

  it("a missing conditional condition variable never triggers strict-mode's missing-variable error", () => {
    expect(() => renderString("{{#if neverSet}}x{{/if}}", {})).not.toThrow();
  });

  it("conditional blocks and plain interpolation compose correctly", () => {
    const out = renderString("Hi {{name}}{{#if isVip}}, our VIP member{{/if}}!", { name: "Asha", isVip: true });
    expect(out).toBe("Hi Asha, our VIP member!");
  });
});

describe("renderTemplate", () => {
  it("renders a registered template and returns its version/locale/name", () => {
    const name = T("render-by-name");
    registerTemplate(name, { source: "Hi {{name}}", version: "3.1.0", locale: "en" });
    const result = renderTemplate(name, { name: "Asha" });
    expect(result).toEqual({ text: "Hi Asha", version: "3.1.0", locale: "en", name });
  });

  it("throws a clear error for an unregistered template name", () => {
    expect(() => renderTemplate(T("never-registered-render"))).toThrow(/is not registered/);
  });

  it("locale fallback works end-to-end through renderTemplate too", () => {
    const name = T("render-locale-fallback");
    registerTemplate(name, { source: "Hello {{name}}", locale: "en" });
    const result = renderTemplate(name, { name: "Asha" }, { locale: "de" });
    expect(result).toEqual({ text: "Hello Asha", version: "1.0.0", locale: "en", name });
  });
});

describe("previewTemplate", () => {
  it("renders against its own sampleContext without needing real data", () => {
    const name = T("preview-me");
    registerTemplate(name, { source: "Hi {{name}}, balance {{balance}}", sampleContext: { name: "Sample User", balance: 1000 } });
    const preview = previewTemplate(name);
    expect(preview.rendered).toBe("Hi Sample User, balance 1000");
    expect(preview.version).toBe("1.0.0");
  });

  it("never throws even with an incomplete sampleContext — preview must always succeed", () => {
    const name = T("preview-incomplete");
    registerTemplate(name, { source: "Hi {{name}}, ref {{ref}}", sampleContext: { name: "Sample" } });
    expect(() => previewTemplate(name)).not.toThrow();
    expect(previewTemplate(name).rendered).toBe("Hi Sample, ref ");
  });

  it("returns null for an unregistered template", () => {
    expect(previewTemplate(T("never-registered-preview"))).toBeNull();
  });
});

describe("validateTemplateSyntax", () => {
  it("passes for balanced if/unless blocks", () => {
    expect(validateTemplateSyntax("{{#if a}}x{{/if}} {{#unless b}}y{{/unless}}")).toEqual({ ok: true, issues: [] });
  });

  it("catches an unclosed {{#if}} block", () => {
    const result = validateTemplateSyntax("{{#if a}}x");
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatch(/\{\{#if\}\} block count \(1\) does not match \{\{\/if\}\} count \(0\)/);
  });

  it("catches an unclosed {{#unless}} block independently of {{#if}}", () => {
    const result = validateTemplateSyntax("{{#if a}}x{{/if}} {{#unless b}}y");
    expect(result.ok).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatch(/unless/);
  });

  it("reports both if and unless mismatches together when both are broken", () => {
    const result = validateTemplateSyntax("{{#if a}}x {{#unless b}}y");
    expect(result.issues).toHaveLength(2);
  });
});
