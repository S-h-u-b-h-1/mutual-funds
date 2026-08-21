// Auth.js v5 configuration (Personal Investment Operating System sprint).
// Providers are registered defensively — each external one only turns on when its env vars
// are present, matching this codebase's existing hasDatabaseUrl-style pattern (see db.js) so a
// deploy missing an OAuth/Resend secret degrades to "that button doesn't appear" rather than
// a broken build or a 500.
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Resend from "next-auth/providers/resend";
import bcrypt from "bcryptjs";
import { NeonAdapter } from "./authAdapter.js";
import { hasDatabaseUrl, query } from "./db.js";
import { checkRateLimit, getClientIp } from "./platform/rateLimit/core.js";
import { jwtSecurityStampCallback } from "./authSecurityStamp.js";

const hasGoogle = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const hasGitHub = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
const hasResend = Boolean(process.env.RESEND_API_KEY);

// A fixed, valid bcrypt hash with no real password behind it — compared against on every
// nonexistent-user / OAuth-only-account login attempt so authorize() always pays the same
// bcrypt cost regardless of outcome. Without this, "no such user" and "no password set" both
// return instantly while a real password check takes bcrypt's ~tens-of-ms cost-12 round trip,
// which is a login-timing side channel for account enumeration (distinct from — and cheaper to
// close than — the same class of bug on forgot-password, which leaks via an awaited network call
// instead of local CPU; see that route's own comment).
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

// H4 (auth rate limiting, docs/BACKEND_TECHNICAL_DEBT.md): two separate limits, both required —
// IP-scoped stops one attacker credential-stuffing many accounts from one source; email-scoped
// (keyed on the raw submitted address, real account or not) stops a distributed attack — many
// IPs, one target — against a single victim. A rate-limited attempt returns null here, exactly
// like a wrong password: Auth.js's Credentials flow can't distinguish "wrong password" from "any
// other authorize() failure" without a custom error class, and null is deliberately chosen over
// one so a rate-limited attempt is indistinguishable from a failed one to the client — not just
// generic, but identical.
const LOGIN_IP_LIMIT = { limit: 10, windowSeconds: 5 * 60 };
const LOGIN_EMAIL_LIMIT = { limit: 5, windowSeconds: 5 * 60 };

const providers = [
  Credentials({
    credentials: { email: { label: "Email" }, password: { label: "Password", type: "password" } },
    async authorize(credentials, request) {
      if (!hasDatabaseUrl || !credentials?.email || !credentials?.password) return null;
      const email = String(credentials.email).trim().toLowerCase();

      const ip = getClientIp(request);
      const [ipCheck, emailCheck] = await Promise.all([
        checkRateLimit("login-ip", ip, LOGIN_IP_LIMIT),
        checkRateLimit("login-email", email, LOGIN_EMAIL_LIMIT),
      ]);
      if (!ipCheck.allowed || !emailCheck.allowed) return null;

      const r = await query(`select * from users where email = $1`, [email]);
      const user = r.rows[0];
      const valid = await bcrypt.compare(String(credentials.password), user?.password_hash || DUMMY_HASH);
      if (!user || !user.password_hash || !valid) return null;
      return { id: user.id, name: user.name, email: user.email, image: user.image, securityStamp: user.security_stamp };
    },
  }),
];

if (hasGoogle) {
  providers.push(Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET }));
}
if (hasGitHub) {
  providers.push(GitHub({ clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET }));
}
if (hasResend) {
  providers.push(
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM || "MF Pulse <no-reply@mf-pulse.app>",
    })
  );
}

// Auth.js refuses "database" session strategy when Credentials is the ONLY registered
// provider (@auth/core/lib/utils/assert.js: "Signing in with credentials only supported if
// JWT strategy is enabled") — it allows database sessions the moment at least one non-
// credentials provider is present. A fresh deploy with just DATABASE_URL set (no OAuth/Resend
// keys yet) would otherwise crash on first sign-in attempt, so fall back to jwt in exactly
// that bare configuration and upgrade to real server-revocable database sessions as soon as
// any second provider goes live.
const hasNonCredentialsProvider = hasGoogle || hasGitHub || hasResend;
const sessionStrategy = hasDatabaseUrl && hasNonCredentialsProvider ? "database" : "jwt";

// Session revocation (Phase 1 auth audit): under "database" strategy, password-reset and
// account-deletion already revoke for real — they delete/cascade the actual `sessions` row.
// Under the "jwt" fallback above (the ONLY strategy that can ever be active while Credentials is
// the sole provider — see the comment on sessionStrategy), there is no sessions row to delete, so
// those same revocation calls were silent no-ops and the signed cookie stayed valid until its
// natural 30-day expiry regardless of a password change. jwtSecurityStampCallback (imported above,
// defined in authSecurityStamp.js — see that file's header for why it lives outside this one)
// closes that gap without touching the database-strategy path at all: Auth.js only invokes
// `jwt()` when session strategy is actually "jwt" (database-strategy sign-ins never go through
// here). On initial sign-in (`user` present — always the object authorize() just returned,
// carrying a securityStamp read at that exact moment), the current stamp is stashed into the
// token. On every later request, the live DB value is re-checked; a mismatch means something
// bumped users.security_stamp since this token was issued (password reset, today; a future "sign
// out everywhere" action, or a suspected-compromise response, later) — returning null here is
// Auth.js's own documented idiom for invalidating a jwt-strategy session mid-flight (verified
// against @auth/core/lib/actions/session.js: `if (token !== null) { ...build session... } else {
// ...clear cookies... }`).
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: hasDatabaseUrl ? NeonAdapter() : undefined,
  session: { strategy: sessionStrategy },
  pages: { signIn: "/login" },
  trustHost: true,
  providers,
  callbacks: {
    async session({ session, user, token }) {
      if (session.user) {
        session.user.id = user?.id ?? token?.sub ?? session.user.id;
      }
      return session;
    },
    jwt: jwtSecurityStampCallback,
  },
});

export const authProviderFlags = { hasGoogle, hasGitHub, hasResend, hasDatabaseUrl };
