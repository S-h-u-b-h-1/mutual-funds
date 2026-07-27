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
import { NeonAdapter } from "./authAdapter";
import { hasDatabaseUrl, query } from "./db";
import { checkRateLimit, getClientIp } from "./platform/rateLimit/core";
import { resolveSignInEligibility } from "./accountLifecycle";

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
      return { id: user.id, name: user.name, email: user.email, image: user.image };
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

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: hasDatabaseUrl ? NeonAdapter() : undefined,
  session: { strategy: sessionStrategy },
  pages: { signIn: "/login" },
  trustHost: true,
  providers,
  callbacks: {
    // H6 (account lifecycle): checked for EVERY provider uniformly — Credentials, OAuth, and
    // magic link alike, not just the password path. Runs after authorize() (Credentials) or
    // after the adapter resolves the user (OAuth/Resend), so `user.id` is the real DB id here
    // either way. deleted_at is an unconditional block; deactivated_at is auto-cleared on a
    // successful sign-in (see accountLifecycle.js's own comment for why — the alternative is a
    // dead end where deactivation could never be undone). Deliberately generic on rejection
    // (false, not a specific reason) — same posture as the rate-limit check in authorize() above.
    async signIn({ user }) {
      if (!hasDatabaseUrl || !user?.id) return true;
      return resolveSignInEligibility(user.id);
    },
    async session({ session, user, token }) {
      if (session.user) {
        session.user.id = user?.id ?? token?.sub ?? session.user.id;
      }
      return session;
    },
  },
});

export const authProviderFlags = { hasGoogle, hasGitHub, hasResend, hasDatabaseUrl };
