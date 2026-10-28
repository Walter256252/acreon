// Exercises the actual route handlers with fake authentication, persistence,
// mail servers and Google responses. No mailbox or external network is used.
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = await mkdtemp(join(tmpdir(), "acreon-email-test-"));
const state = (globalThis.__acreonEmailTest = {
  rows: new Map(),
  failImap: false,
  tested: 0,
});
const intervals = [];
const originalInterval = globalThis.setInterval;
globalThis.setInterval = (...args) => {
  const id = originalInterval(...args);
  intervals.push(id);
  return id;
};
const mocks = {
  "@clerk/express": "export const getAuth = req => ({ userId: req.userId });",
  "drizzle-orm":
    "export const inArray = (field, values) => row => values.includes(row[field]); export const eq = (field,value) => row => row[field] === value; export const and = (...filters) => row => filters.every(f => f(row));",
  "@workspace/integrations-openai-ai-server": `export const openai = {chat:{completions:{create:async()=>({choices:[{message:{content:JSON.stringify({summary:"Updated",actions:globalThis.__acreonEmailTest.actions})}}]})}}};`,
  "@workspace/db": `
    const state = globalThis.__acreonEmailTest;
    export const emailConnectionsTable = { userId:'userId', verified:'verified', id:'id', displayEmail:'displayEmail' };
    export const occupancyRecordsTable = {};
    export const gmailSettingsTable = {userId:"userId"}, emailNotesTable = {}, propertiesTable = {clerkUserId:"clerkUserId"};
    export const db = {
      select() { return { from(table) { return { where(filter) { const rows = table === propertiesTable ? (state.properties ?? []) : table === gmailSettingsTable ? [] : [...state.rows.values()]; const query = Promise.resolve(rows.filter(filter)); query.orderBy = () => query; return query; } }; } }; },
      insert() { let values; return { values(v) { state.writes.push(v); values = v; return this; },
        onConflictDoUpdate({set}) { const previous = state.rows.get(values.userId); const row = previous ? {...previous,...set} : {id:state.rows.size+1,createdAt:new Date(),...values}; state.rows.set(values.userId,row); this.result = [row]; return this; },
        returning() { return Promise.resolve(this.result); },
        then(resolve) { resolve(this.result); }
      }; },
      delete() { return { where(filter) { for (const [key,row] of state.rows) if(filter(row)) state.rows.delete(key); return Promise.resolve(); } }; }
    };
  `,
  imapSync:
    'export async function testConnection() { globalThis.__acreonEmailTest.tested++; if(globalThis.__acreonEmailTest.failImap) throw Error("fake failure"); } export async function syncPropertyEmails(_creds, propertyId) { if(globalThis.__acreonEmailTest.failProperties?.includes(propertyId)) throw Error("Fake provider failure with private details"); return 2; }',
  gmailApiSync:
    'export async function syncPropertyEmailsViaGmail() { throw Error("Unexpected sync"); } export async function getValidAccessToken() { throw Error("Unexpected token refresh"); }',
};
let routers;
try {
  await build({
    stdin: {
      contents: `export { default as protectedRouter } from './src/routes/email.ts'; export { default as publicRouter } from './src/routes/emailPublic.ts'; export { decryptCredential } from './src/lib/credentialEncryption.ts'; export {default as occupancyRouter} from './src/routes/occupancy.ts';`,
      resolveDir: root,
    },
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: join(directory, "routes.mjs"),
    // Express is loaded natively, rather than bundling its dynamic requires.
    plugins: [
      {
        name: "email-test-fakes",
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, (args) => {
            const key = args.path.endsWith("/imapSync")
              ? "imapSync"
              : args.path.endsWith("/gmailApiSync")
                ? "gmailApiSync"
                : args.path;
            if (mocks[key]) return { path: key, namespace: "fake" };
            if (args.path === "express")
              return {
                path: resolve(root, "node_modules/express/index.js"),
                external: true,
              };
          });
          builder.onLoad({ filter: /.*/, namespace: "fake" }, (args) => ({
            contents: mocks[args.path],
            loader: "js",
          }));
        },
      },
    ],
  });
  routers = await import(pathToFileURL(join(directory, "routes.mjs")).href);
} finally {
  globalThis.setInterval = originalInterval;
  for (const id of intervals) clearInterval(id);
}
after(async () => {
  delete globalThis.__acreonEmailTest;
  await rm(directory, { recursive: true, force: true });
});
async function call(router, path, method = "get", request = {}) {
  const layer = router.stack.find(
    (l) => l.route?.path === path && l.route.methods[method],
  );
  assert.ok(layer, `Missing route ${method} ${path}`);
  const response = {
    code: 200,
    body: undefined,
    location: undefined,
    status(code) {
      this.code = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    redirect(url) {
      this.location = url;
      return this;
    },
  };
  await layer.route.stack[0].handle(
    { userId: "user-personal", body: {}, query: {}, headers: {}, ...request },
    response,
  );
  return response;
}
const config = () => {
  state.rows.clear();
  state.properties = [];
  state.writes = [];
  state.actions = [];
  state.failProperties = [];
  state.failImap = false;
  process.env.ALLOWED_ORIGIN = "https://acreon.example.com";
  process.env.EMAIL_CREDENTIAL_ENCRYPTION_KEY = "ab".repeat(32);
  process.env.GOOGLE_CLIENT_ID = "fake-client";
  process.env.GOOGLE_CLIENT_SECRET = "fake-secret";
};
const credentials = {
  displayEmail: "personal@example.test",
  imapEmail: "personal@example.test",
  imapHost: "imap.example.test",
  imapPort: 993,
  imapTls: true,
  imapPassword: "fake-mail-secret",
};
test("connection endpoints reject unauthenticated users", async () => {
  config();
  for (const [path, method] of [
    ["/email/connect", "post"],
    ["/email/status", "get"],
    ["/email/connection", "get"],
    ["/email/gmail/auth-url", "get"],
    ["/email/connection", "delete"],
  ]) {
    assert.equal(
      (await call(routers.protectedRouter, path, method, { userId: null }))
        .code,
      401,
    );
  }
});
test("missing IMAP fields and failed authentication do not save a connection", async () => {
  config();
  assert.equal(
    (await call(routers.protectedRouter, "/email/connect", "post")).code,
    400,
  );
  state.failImap = true;
  assert.equal(
    (
      await call(routers.protectedRouter, "/email/connect", "post", {
        body: credentials,
      })
    ).code,
    400,
  );
  assert.equal(state.rows.size, 0);
});
test("IMAP connection stores ciphertext, exposes safe metadata, and stays scoped to its owner", async () => {
  config();
  assert.equal(
    (
      await call(routers.protectedRouter, "/email/connect", "post", {
        body: credentials,
      })
    ).code,
    200,
  );
  const stored = state.rows.get("user-personal");
  assert.notEqual(stored.imapPassword, credentials.imapPassword);
  assert.equal(
    routers.decryptCredential(stored.imapPassword, "user-personal"),
    credentials.imapPassword,
  );
  const detail = (await call(routers.protectedRouter, "/email/connection"))
    .body;
  assert.equal(detail.displayEmail, credentials.displayEmail);
  assert.equal(detail.imapPassword, undefined);
  assert.equal(
    (
      await call(routers.protectedRouter, "/email/status", "get", {
        userId: "another-user",
      })
    ).body.connected,
    false,
  );
  await call(routers.protectedRouter, "/email/connection", "delete", {
    userId: "another-user",
  });
  assert.equal(state.rows.size, 1);
  await call(routers.protectedRouter, "/email/connection", "delete");
  assert.equal(state.rows.size, 0);
});
test("Gmail setup reports missing configuration and rejects external return URLs", async () => {
  config();
  delete process.env.GOOGLE_CLIENT_ID;
  assert.equal(
    (await call(routers.protectedRouter, "/email/gmail/auth-url")).code,
    503,
  );
  process.env.GOOGLE_CLIENT_ID = "fake-client";
  assert.equal(
    (
      await call(routers.protectedRouter, "/email/gmail/auth-url", "get", {
        query: { returnTo: "https://other.example/app" },
      })
    ).code,
    400,
  );
});
async function start() {
  const result = await call(
    routers.protectedRouter,
    "/email/gmail/auth-url",
    "get",
    {
      query: { returnTo: "https://acreon.example.com/app/communications" },
      headers: { "x-forwarded-host": "spoof.example" },
    },
  );
  const url = new URL(result.body.url);
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "https://acreon.example.com/api/email/gmail/callback",
  );
  assert.ok(url.searchParams.get("scope").includes("gmail.readonly"));
  return url.searchParams.get("state");
}
test("Gmail success saves encrypted tokens and rejects replay of the callback", async () => {
  config();
  const token = await start();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () =>
      String(url).includes("/token")
        ? {
            access_token: "fake-access",
            refresh_token: "fake-refresh",
            expires_in: 3600,
          }
        : { email: "personal@example.test" },
  });
  try {
    const result = await call(
      routers.publicRouter,
      "/email/gmail/callback",
      "get",
      { query: { state: token, code: "fake-code" } },
    );
    assert.equal(
      new URL(result.location).searchParams.get("gmail_connected"),
      "1",
    );
    const stored = state.rows.get("user-personal");
    assert.equal(stored.provider, "gmail");
    assert.equal(
      routers.decryptCredential(stored.gmailRefreshToken, "user-personal"),
      "fake-refresh",
    );
    const replay = await call(
      routers.publicRouter,
      "/email/gmail/callback",
      "get",
      { query: { state: token, code: "fake-code" } },
    );
    assert.ok(replay.location.includes("invalid_state"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test("denying Gmail authorization leaves the account disconnected", async () => {
  config();
  const token = await start();
  const result = await call(
    routers.publicRouter,
    "/email/gmail/callback",
    "get",
    { query: { state: token, error: "access_denied" } },
  );
  assert.equal(
    new URL(result.location).searchParams.get("gmail_error"),
    "access_denied",
  );
  assert.equal(state.rows.size, 0);
});

test("Gmail must not mark a new connection verified without a refresh token", async () => {
  config();
  const token = await start();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () =>
      String(url).includes("/token")
        ? { access_token: "fake-access", expires_in: 3600 }
        : { email: "personal@example.test" },
  });
  try {
    const result = await call(
      routers.publicRouter,
      "/email/gmail/callback",
      "get",
      {
        query: { state: token, code: "fake-code" },
      },
    );
    assert.ok(new URL(result.location).searchParams.has("gmail_error"));
    assert.equal(state.rows.size, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test("Gmail must not mark a connection verified when account identity lookup fails", async () => {
  config();
  const token = await start();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (!String(url).includes("/token"))
      throw Error("fake identity lookup failure");
    return {
      ok: true,
      json: async () => ({
        access_token: "fake-access",
        refresh_token: "fake-refresh",
        expires_in: 3600,
      }),
    };
  };
  try {
    const result = await call(
      routers.publicRouter,
      "/email/gmail/callback",
      "get",
      {
        query: { state: token, code: "fake-code" },
      },
    );
    assert.ok(new URL(result.location).searchParams.has("gmail_error"));
    assert.equal(state.rows.size, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("incomplete Google responses preserve an existing connection", async () => {
  const validToken = {
    access_token: "new-access",
    refresh_token: "new-refresh",
    expires_in: 3600,
  };
  const cases = [
    { token: { access_token: "new-access" }, error: "missing_refresh_token" },
    {
      token: { ...validToken, refresh_token: "  " },
      error: "missing_refresh_token",
    },
    { token: validToken, tokenOk: false, error: "token_exchange_failed" },
    {
      token: { ...validToken, expires_in: -1 },
      error: "token_exchange_failed",
    },
    { token: validToken, identityOk: false, error: "identity_lookup_failed" },
    { token: validToken, identity: {}, error: "identity_lookup_failed" },
    {
      token: validToken,
      identity: { email: "not-an-email" },
      error: "identity_lookup_failed",
    },
    {
      token: validToken,
      identity: {
        email: "personal@example.test",
        error: { message: "denied" },
      },
      error: "identity_lookup_failed",
    },
  ];
  const originalFetch = globalThis.fetch;
  try {
    for (const scenario of cases) {
      config();
      await call(routers.protectedRouter, "/email/connect", "post", {
        body: credentials,
      });
      const original = structuredClone(state.rows.get("user-personal"));
      const token = await start();
      globalThis.fetch = async (url) =>
        String(url).includes("/token")
          ? { ok: scenario.tokenOk ?? true, json: async () => scenario.token }
          : {
              ok: scenario.identityOk ?? true,
              json: async () =>
                scenario.identity ?? { email: "personal@example.test" },
            };
      const response = await call(
        routers.publicRouter,
        "/email/gmail/callback",
        "get",
        { query: { state: token, code: "fake-code" } },
      );
      assert.equal(
        new URL(response.location).searchParams.get("gmail_error"),
        scenario.error,
      );
      assert.equal(
        new URL(response.location).searchParams.has("gmail_connected"),
        false,
      );
      assert.deepEqual(state.rows.get("user-personal"), original);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sync all reports per-property failures without losing successful results", async () => {
  config();
  await call(routers.protectedRouter, "/email/connect", "post", {
    body: credentials,
  });
  state.properties = [
    { id: 1, name: "Working", address: "1 Test", clerkUserId: "user-personal" },
    { id: 2, name: "Broken", address: "2 Test", clerkUserId: "user-personal" },
    { id: 3, name: "Foreign", address: "3 Test", clerkUserId: "another-user" },
  ];
  state.failProperties = [2];
  const result = await call(routers.protectedRouter, "/email/sync", "post");
  assert.equal(result.body.synced, 2);
  assert.equal(result.body.failed, 1);
  assert.equal(result.body.results.length, 2);
  assert.equal(result.body.results[0].synced, 2);
  assert.ok(result.body.results[1].error);
  assert.ok(!JSON.stringify(result.body).includes("private details"));
  state.failProperties = [1, 2];
  const failed = await call(routers.protectedRouter, "/email/sync", "post");
  assert.equal(failed.body.synced, 0);
  assert.equal(failed.body.failed, 2);
  assert.ok(failed.body.results.every((r) => r.error));
});

test("occupancy AI route rejects foreign property batches before any insert", async () => {
  config();
  state.properties = [
    { id: 1, name: "Owned", address: "1 Test", clerkUserId: "user-personal" },
  ];
  for (const type of ["set_ltr_months", "set_str_nights"]) {
    state.actions = [
      {
        type: "set_ltr_months",
        propertyId: 1,
        year: 2026,
        months: [10],
        occupied: true,
      },
      {
        type,
        propertyId: 999,
        year: 2026,
        months: [10],
        occupied: true,
        entries: [{ month: 10, nights: 2 }],
      },
    ];
    const response = await call(
      routers.occupancyRouter,
      "/occupancy/ai",
      "post",
      { body: { message: "Update occupancy" } },
    );
    assert.equal(response.code, 403);
    assert.equal(state.writes.length, 0);
  }
});
