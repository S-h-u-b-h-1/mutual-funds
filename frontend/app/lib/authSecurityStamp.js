// Split out of auth.js deliberately: this file must NOT import next-auth (or anything that
// transitively does, e.g. "next/server") — that import graph only resolves correctly inside
// Next.js's own build pipeline (webpack/turbopack special-cases its extensionless subpath
// imports); under Vitest's plain Node ESM loader it fails outright ("Cannot find module
// '.../next/server'"), which is why auth.js itself has never been directly testable. Keeping the
// one piece of real, security-relevant LOGIC here — with no next-auth dependency — makes it
// testable without fighting that environment gap; auth.js imports this and wires it into
// NextAuth()'s callbacks unchanged.
import { query } from "./db.js";

export async function jwtSecurityStampCallback({ token, user }) {
  if (user) {
    token.securityStamp = user.securityStamp;
    return token;
  }
  if (!token?.sub) return token;
  const r = await query(`select security_stamp from users where id = $1`, [token.sub]);
  const current = r.rows[0]?.security_stamp;
  if (!current || current !== token.securityStamp) return null;
  return token;
}
