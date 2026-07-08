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

const hasGoogle = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const hasGitHub = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
const hasResend = Boolean(process.env.RESEND_API_KEY);

const providers = [
  Credentials({
    credentials: { email: { label: "Email" }, password: { label: "Password", type: "password" } },
    async authorize(credentials) {
      if (!hasDatabaseUrl || !credentials?.email || !credentials?.password) return null;
      const email = String(credentials.email).trim().toLowerCase();
      const r = await query(`select * from users where email = $1`, [email]);
      const user = r.rows[0];
      if (!user || !user.password_hash) return null; // no password set => OAuth-only account
      const valid = await bcrypt.compare(String(credentials.password), user.password_hash);
      if (!valid) return null;
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
    async session({ session, user, token }) {
      if (session.user) {
        session.user.id = user?.id ?? token?.sub ?? session.user.id;
      }
      return session;
    },
  },
});

export const authProviderFlags = { hasGoogle, hasGitHub, hasResend, hasDatabaseUrl };
