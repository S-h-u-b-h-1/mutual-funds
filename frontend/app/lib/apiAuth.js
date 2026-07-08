// Route-handler-level "protected route" guard. Next.js middleware.js would gate whole page
// trees (not needed yet — no cloud-only pages exist), so protection lives at the API boundary:
// every sync/portfolio/alert route calls requireUser() first and 401s without a session. This
// is also where every handler gets its user_id — never trust a client-supplied one (see
// sql/neon/002_auth_and_user_data.sql's no-RLS rationale).
import { auth } from "./auth";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user;
}

export function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
