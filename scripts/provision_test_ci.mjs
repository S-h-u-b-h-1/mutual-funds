// Explicitly operator-invoked provisioning helper, never a workflow step.
// The new password stays in this process and child environments; it is never written to disk.
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { APPROVED_TEST_DATABASE as target, assertIdentityRow, TEST_IDENTITY_SQL } from "../frontend/app/lib/testDatabaseIdentity.mjs";

const require = createRequire(new URL("../frontend/package.json", import.meta.url));
const { Client } = require("pg");
const root = fileURLToPath(new URL("../", import.meta.url));
const grants = JSON.parse(readFileSync(new URL("./ci_database_privileges.json", import.meta.url), "utf8"));
const role = target.role;
const productionHost = "ep-autumn-wind-atiwaldh-pooler.c-9.us-east-1.aws.neon.tech";
const repositories = ["S-h-u-b-h-1/mutual-funds", "S-h-u-b-h-1/MF-Pulse"];
const password = randomBytes(48).toString("base64url");
const adminUrl = process.env.TEST_DATABASE_URL;
const input = createInterface({ input: process.stdin, terminal: false });
const identifier = value => {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw Error("Invalid SQL identifier");
  return `"${value}"`;
};
const connect = async connectionString => {
  const client = new Client({ connectionString, connectionTimeoutMillis: 15000, query_timeout: 45000 });
  try { await client.connect(); return client; }
  catch (error) { await client.end().catch(() => {}); throw error; }
};
let stage = "configuration", ciUrl, isolated = false;
const env = {};
for (const key of ["PATH", "HOME", "TMPDIR", "LANG", "SYSTEMROOT", "PLAYWRIGHT_BROWSERS_PATH", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
  if (process.env[key]) env[key] = process.env[key];
}
Object.assign(env, { CI: "1", MFPULSE_CI_DATABASE_GUARD: "1", AUTH_SECRET: "ci-only-disposable-browser-session-secret", NEXTAUTH_URL: "http://localhost:3011", E2E_DIAGNOSTIC: "1" });

function redact(value) {
  let output = String(value);
  for (const secret of [adminUrl, ciUrl, password, adminUrl && decodeURIComponent(new URL(adminUrl).password)]) {
    if (secret) output = output.split(secret).join("[REDACTED]");
  }
  return output;
}

function child(command, args, cwd = root, stdin) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    // Buffer each line so a secret split across pipe chunks is still redacted.
    for (const stream of [proc.stdout, proc.stderr]) {
      const lines = createInterface({ input: stream });
      lines.on("line", line => console.log(redact(line)));
    }
    proc.on("error", reject);
    proc.on("close", code => code === 0 ? resolve() : reject(Error(`Child exited ${code}`)));
    proc.stdin.end(stdin);
  });
}

async function verifyIsolation() {
  const client = await connect(ciUrl);
  try {
    assertIdentityRow((await client.query(TEST_IDENTITY_SQL)).rows[0], true);
    const security = (await client.query(`select rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,
      (select count(*)::int from pg_auth_members where member=r.oid) as memberships,
      exists(select 1 from pg_database where datdba=r.oid) as database_owner,
      has_schema_privilege(current_user,'public','CREATE') as schema_create
      from pg_roles r where rolname=current_user`)).rows[0];
    if (!security || Object.values(security).some(Boolean)) throw Error("Administrative privileges detected");
    await client.query("begin");
    const id = (await client.query("insert into users(name,email) values($1,$2) returning id", ["CI permission probe", `ci-probe-${randomBytes(8).toString("hex")}@mfpulse.test`])).rows[0].id;
    await client.query("update users set name=$1 where id=$2", ["CI rollback probe", id]);
    await client.query("select id from users where id=$1", [id]);
    await client.query("delete from users where id=$1", [id]);
    await client.query("rollback");
    console.log("Test identity, non-administrative attributes and rollback-only CRUD probe passed.");
  } finally { await client.end(); }
  const productionUrl = new URL(ciUrl);
  productionUrl.hostname = productionHost;
  let productionClient;
  try { productionClient = await connect(productionUrl.toString()); }
  catch (error) {
    // DNS/timeout/transport failure is not proof of credential rejection.
    if (error.code !== "28P01") throw Error("Production authentication rejection could not be verified");
    isolated = true;
    console.log("Production authentication rejected (SQLSTATE 28P01); no production data query executed.");
    return;
  }
  await productionClient.end();
  throw Error("ISOLATION FAILURE: production accepted the CI credential; upload forbidden");
}

async function applyGrants(client) {
  for (const [operation, tables] of Object.entries(grants)) {
    if (!["select", "insert", "update", "delete"].includes(operation)) throw Error("Unexpected privilege");
    await client.query(`GRANT ${operation.toUpperCase()} ON TABLE ${tables.map(t => `public.${identifier(t)}`).join(",")} TO ${identifier(role)}`);
  }
  const sequences = (await client.query(`select distinct s.relname from pg_class s
    join pg_depend d on d.objid=s.oid and d.deptype in ('a','i')
    join pg_class t on t.oid=d.refobjid join pg_namespace n on n.oid=t.relnamespace
    where s.relkind='S' and n.nspname='public' and t.relname=any($1::text[])`, [grants.insert])).rows;
  if (sequences.length) await client.query(`GRANT USAGE ON SEQUENCE ${sequences.map(s => `public.${identifier(s.relname)}`).join(",")} TO ${identifier(role)}`);
}

try {
  const configured = new URL(adminUrl);
  if (configured.hostname.replace("-pooler.", ".") !== target.host || configured.pathname !== "/neondb" || configured.searchParams.has("options")) throw Error("Wrong administrative target");
  stage = "test-role creation";
  const admin = await connect(adminUrl);
  try {
    assertIdentityRow((await admin.query(TEST_IDENTITY_SQL)).rows[0]);
    await admin.query("begin");
    await admin.query("set local lock_timeout='5s'");
    // SQL-created roles do NOT automatically inherit neon_superuser (unlike API-created roles).
    await admin.query(`CREATE ROLE ${identifier(role)} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 64`);
    await admin.query(`GRANT CONNECT ON DATABASE neondb TO ${identifier(role)}`);
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${identifier(role)}`);
    await applyGrants(admin);
    await admin.query(`COMMENT ON ROLE ${identifier(role)} IS 'MF Pulse isolated CI only; no production use; explicitly approved 2026-09-08'`);
    await admin.query("commit");
  } catch (error) { await admin.query("rollback").catch(() => {}); throw error; }
  finally { await admin.end(); }
  configured.username = role;
  configured.password = password;
  configured.searchParams.set("sslmode", "verify-full");
  ciUrl = configured.toString();
  Object.assign(env, { DATABASE_URL: ciUrl, TEST_DATABASE_URL: ciUrl });
  stage = "credential isolation";
  await verifyIsolation();
  console.log("READY. Credential remains only in memory. Commands: schema, tests, browser, upload, verify, grants, exit.");
  for await (const line of input) {
    const command = line.trim();
    try {
      if (command === "exit") break;
      if (command === "verify") await verifyIsolation();
      else if (command === "schema") {
        await child(process.execPath, ["scripts/check-test-database.mjs"], `${root}frontend`);
        await child(`${root}.venv/bin/python`, ["-m", "scripts.ci_database_guard"]);
        await child(`${root}.venv/bin/python`, ["-m", "scripts.check_release_schema"]);
        await child(`${root}.venv/bin/python`, ["-m", "pytest", "tests/", "-q"]);
      } else if (command === "tests") {
        await child(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--reporter=json", "--outputFile=../output/ci-role-vitest.json"], `${root}frontend`);
      } else if (command === "browser") {
        await child("npm", ["run", "build"], `${root}frontend`);
        await child(process.execPath, ["node_modules/@playwright/test/cli.js", "test"], `${root}frontend`);
      } else if (command === "upload") {
        if (!isolated) throw Error("Isolation not verified");
        await verifyIsolation();
        for (const repo of repositories) {
          await child("gh", ["secret", "set", "TEST_DATABASE_URL", "--repo", repo], root, ciUrl);
          console.log(`Encrypted TEST_DATABASE_URL stored in ${repo}; value not displayed.`);
        }
      } else if (command === "grants") {
        // Operator must review/edit the explicit manifest; never infer new privileges from errors.
        throw Error("Privilege changes require reviewed script/manifest update before retry");
      } else throw Error("Unknown operator command");
      console.log(`COMMAND ${command}: PASS`);
    } catch { console.error(`COMMAND ${command}: FAILED; no deployment action is permitted.`); }
  }
} catch (error) {
  console.error(`Provisioning stopped at ${stage}; code=${error.code || "CHECK_FAILED"}. No secret is printed.`);
  process.exitCode = 1;
} finally { input.close(); }
