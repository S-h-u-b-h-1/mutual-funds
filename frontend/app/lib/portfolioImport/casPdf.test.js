import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { extractCasText } from "./casPdf.js";

// pdf-parse's own bundled real-world PDF fixtures — not CAS-shaped, but real PDF.js-parseable
// documents, which is exactly what's needed to prove extraction itself works (and keeps working
// across a PDF.js version change) without depending on a real CAS statement.
// Resolved relative to this file (not process.cwd()), which varies depending on whether vitest is
// invoked from the repo root or from frontend/.
const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const fixture = (name) => fs.readFileSync(path.join(FRONTEND_ROOT, "node_modules/pdf-parse/test/data", name));

describe("extractCasText", () => {
  it("rejects an empty buffer as corrupted", async () => {
    const result = await extractCasText(Buffer.alloc(0));
    expect(result.rejected).toBe("corrupted");
  });

  it("rejects a non-PDF buffer as not_a_pdf", async () => {
    const result = await extractCasText(Buffer.from("this is plain text, not a pdf", "utf8"));
    expect(result.rejected).toBe("not_a_pdf");
  });

  it("rejects a structurally broken PDF as corrupted, not silently returning empty text", async () => {
    const result = await extractCasText(fixture("03-invalid.pdf"));
    expect(result.rejected).toBe("corrupted");
    expect(result.reason).toMatch(/could not be read/i);
  });

  // Real regression coverage for the v1.10.100 -> v2.0.550 bundled-PDF.js version fix: every one of
  // these must extract real text, not fall through to a false "scanned_or_unsupported" rejection.
  for (const name of ["01-valid.pdf", "02-valid.pdf", "04-valid.pdf"]) {
    it(`extracts real text from ${name}`, async () => {
      const result = await extractCasText(fixture(name));
      expect(result.rejected).toBeUndefined();
      expect(result.text.length).toBeGreaterThan(200);
      expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
    });
  }

  it("is deterministic: the same bytes produce the same checksum", async () => {
    const buffer = fixture("01-valid.pdf");
    const a = await extractCasText(buffer);
    const b = await extractCasText(buffer);
    expect(a.checksum).toBe(b.checksum);
    expect(a.text).toBe(b.text);
  });
});
