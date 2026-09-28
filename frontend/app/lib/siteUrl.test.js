import { describe, it, expect } from "vitest";
import { siteUrl } from "./siteUrl";

describe("canonical URL contract", () => {
  it("defaults to the public production alias", () => expect(siteUrl({})).toBe("https://mf-pulse.vercel.app"));
  it("does not propagate an obsolete auth origin into production metadata", () => expect(siteUrl({ VERCEL_ENV: "production", NEXTAUTH_URL: "https://old.example" })).toBe("https://mf-pulse.vercel.app"));
  it("uses the preview host only on previews", () => expect(siteUrl({ VERCEL_ENV: "preview", VERCEL_URL: "preview.vercel.app", SITE_URL: "https://mf-pulse.vercel.app" })).toBe("https://preview.vercel.app"));
  it("rejects executable URL protocols", () => expect(() => siteUrl({ SITE_URL: "javascript:alert(1)" })).toThrow());
});
