#!/usr/bin/env node
import { randomUUID } from "node:crypto";

const baseUrl = process.argv.includes("--base-url")
  ? process.argv[process.argv.indexOf("--base-url") + 1]
  : "http://localhost:3000";

const email = `auth-smoke-${randomUUID()}@mfpulse.test`;
const password = "auth-smoke-password-1";
const cookies = new Map();

async function request(path, options = {}) {
  const cookie = [...cookies].map(([key, value]) => `${key}=${value}`).join("; ");
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });

  for (const raw of response.headers.getSetCookie()) {
    const [pair] = raw.split(";");
    const separator = pair.indexOf("=");
    if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
  }

  let body = null;
  try { body = await response.json(); } catch {}
  return { response, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  let registered = false;
  try {
    const registration = await request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Auth Smoke Test", email, password }),
    });
    assert(registration.response.status === 201, `Registration returned ${registration.response.status}: ${JSON.stringify(registration.body)}`);
    registered = true;

    const csrf = await request("/api/auth/csrf");
    assert(csrf.body?.csrfToken, "Auth.js did not return a CSRF token");

    const login = await request("/api/auth/callback/credentials", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Auth-Return-Redirect": "1",
      },
      body: new URLSearchParams({
        email,
        password,
        csrfToken: csrf.body.csrfToken,
        callbackUrl: baseUrl,
      }).toString(),
    });
    assert(login.response.status === 200, `Login returned ${login.response.status}: ${JSON.stringify(login.body)}`);

    const session = await request("/api/auth/session");
    assert(session.body?.user?.email === email, `Session did not contain the registered user: ${JSON.stringify(session.body)}`);

    const deletion = await request("/api/v1/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmEmail: email }),
    });
    assert(deletion.response.status === 204, `Cleanup returned ${deletion.response.status}: ${JSON.stringify(deletion.body)}`);
    registered = false;

    console.log("Auth smoke test passed: registration, credentials login, session, and cleanup.");
  } finally {
    if (registered) {
      await request("/api/v1/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail: email }),
      }).catch(() => {});
    }
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
