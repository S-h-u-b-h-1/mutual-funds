// Route-handler-level "protected route" guard. Next.js middleware.js would gate whole page
// trees (not needed yet — no cloud-only pages exist), so protection lives at the API boundary:
// every sync/portfolio/alert route calls requireUser() first and 401s without a session. This
// is also where every handler gets its user_id — never trust a client-supplied one (see
// sql/neon/002_auth_and_user_data.sql's no-RLS rationale).
import { auth } from "./auth.js";
import { query } from "./db.js";
import { setRequestUserId } from "./platform/observability/core.js";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  // C3 (server-side observability): every route already calls this first, so it's the one place
  // to attach userId to the ambient request context (see observability/core.js) without every
  // route having to do it themselves.
  setRequestUserId(session.user.id);
  return session.user;
}

export function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export function forbidden() {
  return Response.json({ error: "Forbidden" }, { status: 403 });
}

// Role lives in the users table, not the session token — a separate lookup rather than baking
// role into the JWT/session callback in lib/auth.js, since that file is shared by every route in
// the app and a role change (e.g. promoting a user to advisor) should take effect on the next
// request, not require a fresh sign-in to pick up a new token claim.
export async function getUserRole(userId) {
  const r = await query(`select role, investor_tier from users where id = $1`, [userId]);
  return r.rows[0] ?? { role: "investor", investor_tier: null };
}

// Returns the authenticated user (with .role attached) if they hold one of `roles`, else null.
// Callers still need their own unauthorized()/forbidden() branching — this never throws, so a
// route can distinguish "not signed in" (401) from "signed in but wrong role" (403).
export async function requireRole(roles) {
  const user = await requireUser();
  if (!user) return null;
  const { role, investor_tier } = await getUserRole(user.id);
  if (!roles.includes(role)) return null;
  return { ...user, role, investorTier: investor_tier };
}
