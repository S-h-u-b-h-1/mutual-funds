// Shared audit-log writer for every Invest module (Module 11) — reuses the existing audit_log
// table (sql/neon/002_auth_and_user_data.sql) rather than a parallel Invest-specific table, same
// generic action/metadata shape already used by sign_in/sign_up/password_reset.
import { query } from "../db.js";

export async function logAudit(userId, action, metadata = {}) {
  await query(
    `insert into audit_log (user_id, action, metadata) values ($1, $2, $3)`,
    [userId, action, JSON.stringify(metadata)]
  );
}
