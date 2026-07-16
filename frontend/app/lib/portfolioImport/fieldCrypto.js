// Application-level field encryption for folio numbers (Persistent Portfolio Mission, Phase 13).
// AES-256-GCM via Node's built-in crypto, not pgcrypto — keeping the key and cipher in the app
// tier means the same code path can also produce a stable comparison token (below) without a
// database round trip, and keeps Neon itself never holding the key.
//
// process.env.PORTFOLIO_FIELD_KEY must be a 32-byte key, hex or base64 encoded. Gated the same
// way this codebase already gates every other optional secret (see auth.js's hasGoogle/
// hasGitHub/hasResend, db.js's hasDatabaseUrl): callers check `hasFieldKey` and degrade
// explicitly — reject the write with a clear error — rather than silently storing plaintext or
// crashing the process.
import crypto from "crypto";

function loadKey() {
  const raw = process.env.PORTFOLIO_FIELD_KEY;
  if (!raw) return null;
  try {
    const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
    return buf.length === 32 ? buf : null;
  } catch {
    return null;
  }
}

const KEY = loadKey();
export const hasFieldKey = KEY != null;

/**
 * @param {string} plaintext
 * @returns {{ ciphertext: Buffer, iv: Buffer }}
 */
export function encryptField(plaintext) {
  if (!hasFieldKey) throw new Error("PORTFOLIO_FIELD_KEY is not configured — cannot encrypt a sensitive field.");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // authTag appended to the ciphertext so a single bytea column round-trips cleanly; split back
  // off in decryptField using its fixed 16-byte length.
  return { ciphertext: Buffer.concat([encrypted, authTag]), iv };
}

/**
 * @param {Buffer} ciphertext - as returned by encryptField (encrypted bytes + 16-byte auth tag)
 * @param {Buffer} iv
 * @returns {string}
 */
export function decryptField(ciphertext, iv) {
  if (!hasFieldKey) throw new Error("PORTFOLIO_FIELD_KEY is not configured — cannot decrypt.");
  const authTag = ciphertext.subarray(ciphertext.length - 16);
  const encrypted = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

// A stable, non-reversible token for equality lookups (dedup, "is this the same folio as
// before") without ever decrypting or logging the plaintext. Keyed HMAC, not a plain hash, so
// the token can't be brute-forced offline from a leaked column the way an unsalted SHA-256 of a
// 6-10 digit folio number could be.
export function tokenizeField(plaintext) {
  if (!hasFieldKey) throw new Error("PORTFOLIO_FIELD_KEY is not configured — cannot tokenize.");
  return crypto.createHmac("sha256", KEY).update(String(plaintext)).digest("hex");
}

export function lastFour(plaintext) {
  const s = String(plaintext || "");
  return s.length <= 4 ? s : s.slice(-4);
}
