// Test-only target contract. Never accept identity supplied by CI environment overrides.
export const APPROVED_TEST_DATABASE = Object.freeze({
  project: "super-surf-43536488",
  branch: "br-weathered-star-atigraez",
  endpoint: "ep-bitter-union-atj8og0c",
  host: "ep-bitter-union-atj8og0c.c-9.us-east-1.aws.neon.tech",
  database: "neondb",
  role: "mf_pulse_ci_20260908",
});

export const TEST_IDENTITY_SQL = `select
  current_database() as database,
  current_user as role,
  current_setting('neon.project_id', true) as project,
  current_setting('neon.branch_id', true) as branch,
  current_setting('neon.endpoint_id', true) as endpoint`;

export function assertIdentityRow(row, requireCiRole = false) {
  for (const key of ["project", "branch", "endpoint", "database", ...(requireCiRole ? ["role"] : [])]) {
    if (!row || row[key] !== APPROVED_TEST_DATABASE[key]) {
      throw new Error(`Refusing test database: connected ${key} identity is not approved.`);
    }
  }
  return { ...row };
}

export async function assertConnectedTestDatabase(query, requireCiRole = process.env.MFPULSE_CI_DATABASE_GUARD === "1") {
  try {
    const result = await query(TEST_IDENTITY_SQL);
    return assertIdentityRow(result.rows[0], requireCiRole);
  } catch {
    // Connection/driver errors can contain a DSN. Never forward them into CI output.
    throw new Error("Refusing test database: connection or approved project/branch/database identity check failed.");
  }
}
