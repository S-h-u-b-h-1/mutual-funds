// Custom Auth.js Adapter (Personal Investment Operating System sprint) — implements the
// Adapter interface (https://authjs.dev/reference/core/adapters) against sql/neon/
// 002_auth_and_user_data.sql's OWN snake_case schema, via the existing query() connection
// (frontend/app/lib/db.js — same pooled `pg` connection every other server-side Neon read/write
// in this codebase already uses). Written by hand instead of the stock @auth/pg-adapter package
// specifically so the schema stays internally consistent with the rest of this codebase and
// doesn't depend on reproducing a third-party package's exact column names from memory — see
// the schema file's own header for the full reasoning.
//
// SESSION STRATEGY: database-backed (not stateless JWT) — every session is a real row in
// `sessions`, so "Secure Logout" actually revokes access server-side (impossible with a pure
// JWT strategy, where a token stays technically valid until it expires even after "signing
// out" client-side) and `user_devices`/session listing can show real, individually-revocable
// entries. Auth.js still uses short-lived signed JWTs internally for CSRF/callback-state, and
// each `accounts` row carries the OAuth PROVIDER's own access_token/refresh_token (Google/
// GitHub's tokens for calling their APIs, not this app's session) — those are the two places
// "JWT" and "refresh tokens" genuinely apply here; a session-persistence layer that is BOTH
// stateless JWT and server-revocable database rows at once is not a coherent thing to build.
import { query } from "./db.js";

const row = (r) => (r.rows[0] ?? null);

function mapUser(u) {
  if (!u) return null;
  return { id: u.id, name: u.name, email: u.email, emailVerified: u.email_verified, image: u.image };
}

function mapSession(s) {
  if (!s) return null;
  return { sessionToken: s.session_token, userId: s.user_id, expires: s.expires };
}

export function NeonAdapter() {
  return {
    async createUser(user) {
      const r = await query(
        `insert into users (name, email, email_verified, image) values ($1,$2,$3,$4) returning *`,
        [user.name ?? null, user.email, user.emailVerified ?? null, user.image ?? null]
      );
      return mapUser(row(r));
    },

    async getUser(id) {
      const r = await query(`select * from users where id = $1`, [id]);
      return mapUser(row(r));
    },

    async getUserByEmail(email) {
      const r = await query(`select * from users where email = $1`, [email]);
      return mapUser(row(r));
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const r = await query(
        `select u.* from users u
         join accounts a on a.user_id = u.id
         where a.provider = $1 and a.provider_account_id = $2`,
        [provider, providerAccountId]
      );
      return mapUser(row(r));
    },

    async updateUser(user) {
      const r = await query(
        `update users set
           name = coalesce($2, name),
           email = coalesce($3, email),
           email_verified = coalesce($4, email_verified),
           image = coalesce($5, image),
           updated_at = now()
         where id = $1
         returning *`,
        [user.id, user.name ?? null, user.email ?? null, user.emailVerified ?? null, user.image ?? null]
      );
      return mapUser(row(r));
    },

    async deleteUser(userId) {
      // Cascades to every user-owned table (accounts, sessions, watchlist, notes, ... — see
      // schema file) via `on delete cascade`. A real, complete account deletion, not a stub.
      await query(`delete from users where id = $1`, [userId]);
    },

    async linkAccount(account) {
      await query(
        `insert into accounts
           (user_id, type, provider, provider_account_id, refresh_token, access_token, expires_at, token_type, scope, id_token, session_state)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          account.userId, account.type, account.provider, account.providerAccountId,
          account.refresh_token ?? null, account.access_token ?? null, account.expires_at ?? null,
          account.token_type ?? null, account.scope ?? null, account.id_token ?? null, account.session_state ?? null,
        ]
      );
      return account;
    },

    async unlinkAccount({ provider, providerAccountId }) {
      await query(`delete from accounts where provider = $1 and provider_account_id = $2`, [provider, providerAccountId]);
    },

    async createSession({ sessionToken, userId, expires }) {
      const r = await query(
        `insert into sessions (session_token, user_id, expires) values ($1,$2,$3) returning *`,
        [sessionToken, userId, expires]
      );
      return mapSession(row(r));
    },

    async getSessionAndUser(sessionToken) {
      const r = await query(
        `select s.session_token, s.user_id, s.expires, u.id as u_id, u.name, u.email, u.email_verified, u.image
         from sessions s join users u on u.id = s.user_id
         where s.session_token = $1`,
        [sessionToken]
      );
      const r0 = row(r);
      if (!r0) return null;
      return {
        session: mapSession({ session_token: r0.session_token, user_id: r0.user_id, expires: r0.expires }),
        user: mapUser({ id: r0.u_id, name: r0.name, email: r0.email, email_verified: r0.email_verified, image: r0.image }),
      };
    },

    async updateSession({ sessionToken, expires, userId }) {
      const r = await query(
        `update sessions set expires = coalesce($2, expires) where session_token = $1 returning *`,
        [sessionToken, expires ?? null]
      );
      return mapSession(row(r));
    },

    async deleteSession(sessionToken) {
      await query(`delete from sessions where session_token = $1`, [sessionToken]);
    },

    async createVerificationToken({ identifier, token, expires }) {
      const r = await query(
        `insert into verification_tokens (identifier, token, purpose, expires) values ($1,$2,'sign_in',$3) returning *`,
        [identifier, token, expires]
      );
      return row(r);
    },

    async useVerificationToken({ identifier, token }) {
      // Single-use by design: delete-and-return in one statement, so a token can never be
      // replayed even under concurrent requests racing to consume it.
      const r = await query(
        `delete from verification_tokens where identifier = $1 and token = $2 and purpose = 'sign_in' returning *`,
        [identifier, token]
      );
      return row(r);
    },
  };
}
