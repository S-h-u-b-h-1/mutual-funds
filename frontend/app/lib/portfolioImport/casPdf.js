// PDF-level wrapper around casParser.js — the only file in this module that touches the PDF
// binary itself (pdf-parse). Isolated so casParser.js/casNormalizer.js stay pure text-in/data-out
// and are testable without a real PDF file.
import crypto from "crypto";

const MIN_EXTRACTABLE_CHARS = 200; // a real CAS, even a one-folio one, extracts to several KB of
// text; a near-empty result means either a scanned/image-only PDF (no embedded text layer) or an
// unsupported layout — reported as a specific, actionable rejection, never parsed as "0 holdings".

/**
 * @param {Buffer} buffer raw uploaded file bytes
 * @returns {Promise<{ text: string, checksum: string } | { rejected: string, reason: string }>}
 *   `rejected` is one of: 'encrypted' | 'scanned_or_unsupported' | 'corrupted' | 'not_a_pdf'.
 */
export async function extractCasText(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { rejected: "corrupted", reason: "The uploaded file is empty." };
  }
  if (buffer.slice(0, 5).toString("ascii") !== "%PDF-") {
    return { rejected: "not_a_pdf", reason: "This doesn't look like a PDF file (missing the standard PDF header)." };
  }

  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");

  let pdfParse;
  try {
    // Imports the inner implementation directly, NOT the "pdf-parse" package root: that root
    // index.js has a `!module.parent` debug branch (meant to detect "run directly" vs "required
    // as a dependency") which incorrectly evaluates true under ESM dynamic import(), unconditionally
    // crashing on startup trying to read/write files from the package's own test fixtures — a real
    // bug in pdf-parse@1.1.1, confirmed by reproducing it, not a hypothetical. This import path
    // (pdf-parse/lib/pdf-parse.js) is the actual PDF.js-based implementation, no debug wrapper.
    ({ default: pdfParse } = await import("pdf-parse/lib/pdf-parse.js"));
  } catch (error) {
    // A missing/broken dependency is an environment problem, not a bad-file problem — surface it
    // distinctly rather than telling the user their PDF is at fault.
    throw new Error(`PDF parsing is unavailable: ${error.message}`);
  }

  let result;
  try {
    // pdf-parse defaults to its oldest bundled PDF.js (v1.10.100, ~2018). Real CAS PDFs from
    // CAMS/KFin/MF Central are routinely produced by modern PDF generators using embedded subset
    // fonts and CID/ToUnicode encodings that the 2018 parser frequently fails to decode into text
    // at all (the document loads fine — no exception — but getTextContent() returns empty/near-empty
    // strings per glyph). That surfaces here as a false "scanned_or_unsupported" rejection of a
    // statement that is not actually scanned. v2.0.550 is the newest version pdf-parse bundles and
    // has materially better font/encoding fallback handling for exactly this case, with the same
    // getDocument()/getTextContent() API render_page() above already relies on.
    result = await pdfParse(buffer, { version: "v2.0.550" });
  } catch (error) {
    const msg = String(error?.message || error);
    if (/password|encrypt/i.test(msg)) {
      return { rejected: "encrypted", reason: "This PDF is password-protected. Please remove the password (most CAS emails use your PAN or date of birth) and re-upload." };
    }
    console.error("[casPdf] extraction threw", { checksum, message: msg });
    return { rejected: "corrupted", reason: `This PDF could not be read: ${msg}` };
  }

  const text = (result?.text || "").trim();
  if (text.length < MIN_EXTRACTABLE_CHARS) {
    console.error("[casPdf] extracted text below threshold", { checksum, extractedChars: text.length, numpages: result?.numpages ?? null });
    return {
      rejected: "scanned_or_unsupported",
      reason: "No readable text could be extracted from this PDF. If it's a scanned copy or a photo of a statement, that format isn't supported yet — please upload the original CAS PDF from CAMS, KFin, or MF Central.",
    };
  }

  return { text, checksum };
}
