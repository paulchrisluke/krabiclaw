#!/usr/bin/env node
/**
 * End-to-end OAuth + MCP smoke test.
 *
 * Against staging (default): does a full headless PKCE flow via the dev-login
 * endpoint, so no browser is needed.
 *
 * Against production: expects a Bearer JWT in the MCP_BEARER_TOKEN env var
 * (the one ChatGPT received), or skips the token-gated checks.
 *
 * Usage:
 *   yarn test:mcp                              # staging, fully headless
 *   yarn test:mcp:prod                         # prod, discovery + unauth only
 *   MCP_BEARER_TOKEN=eyJ... yarn test:mcp:prod # prod, full flow
 */

import { execSync } from "child_process";
import { createHash, randomBytes } from "crypto";

const BASE_URL = process.argv.includes("--base-url")
  ? process.argv[process.argv.indexOf("--base-url") + 1]
  : (process.env.MCP_BASE_URL ?? "https://staging.krabiclaw.com");

const MCP_URL = `${BASE_URL}/api/mcp`;
const TOKEN_URL = `${BASE_URL}/api/auth/oauth2/token`;
const DEV_LOGIN_URL = `${BASE_URL}/api/dev/login`;
const REGISTER_URL = `${BASE_URL}/api/auth/oauth2/register`;
const AUTHORIZE_URL = `${BASE_URL}/api/auth/oauth2/authorize`;
const CONSENT_URL = `${BASE_URL}/api/auth/oauth2/consent`;

const MCP_VERSION = process.env.MCP_PROTOCOL_VERSION ?? "2026-07-28";

const IS_STAGING = (() => {
  try {
    const h = new URL(BASE_URL).hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "staging.krabiclaw.com";
  } catch { return false; }
})();

// ─── helpers ────────────────────────────────────────────────────────────────

function curl(args) {
  return execSync(`curl -s -4 ${args}`, { encoding: "utf8" });
}

function get(url, headers = {}) {
  const headerArgs = Object.entries(headers)
    .map(([k, v]) => `-H ${JSON.stringify(`${k}: ${v}`)}`)
    .join(" ");
  const raw = curl(`-D - ${headerArgs} ${JSON.stringify(url)}`);
  return parseResponse(raw);
}

function post(url, body, headers = {}) {
  const headerArgs = Object.entries({
    "Content-Type": "application/json",
    ...headers,
  })
    .map(([k, v]) => `-H ${JSON.stringify(`${k}: ${v}`)}`)
    .join(" ");
  const bodyArg = `-d ${JSON.stringify(JSON.stringify(body))}`;
  const raw = curl(
    `-D - -X POST ${headerArgs} ${bodyArg} ${JSON.stringify(url)}`,
  );
  return parseResponse(raw);
}

function postForm(url, params, headers = {}) {
  const formData = new URLSearchParams(params).toString();
  const headerArgs = Object.entries({
    "Content-Type": "application/x-www-form-urlencoded",
    ...headers,
  })
    .map(([k, v]) => `-H ${JSON.stringify(`${k}: ${v}`)}`)
    .join(" ");
  const raw = curl(
    `-D - -X POST ${headerArgs} -d ${JSON.stringify(formData)} ${JSON.stringify(url)}`,
  );
  return parseResponse(raw);
}

function parseResponse(raw) {
  const sep = raw.indexOf("\r\n\r\n") !== -1 ? "\r\n\r\n" : "\n\n";
  const blankIdx = raw.indexOf(sep);
  const headerSection = blankIdx !== -1 ? raw.slice(0, blankIdx) : "";
  const bodyText =
    blankIdx !== -1 ? raw.slice(blankIdx + sep.length).trim() : raw.trim();
  const statusMatch = headerSection.match(/HTTP\/[\d.]+ (\d+)/);
  const status = statusMatch ? parseInt(statusMatch[1], 10) : 0;
  const wwwAuth =
    (headerSection.match(/www-authenticate:\s*(.+)/i) ?? [])[1]?.trim() ?? "";
  const location =
    (headerSection.match(/location:\s*(.+)/i) ?? [])[1]?.trim() ?? "";
  const setCookie =
    (headerSection.match(/set-cookie:\s*(.+)/i) ?? [])[1]?.trim() ?? "";
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = bodyText;
  }
  return {
    status,
    body,
    wwwAuthenticate: wwwAuth,
    location,
    setCookie,
    headers: headerSection,
  };
}

function pkce() {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

function decodeJwtPayload(token) {
  const [, payload] = String(token).split(".");
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function hasAudience(payload, expected) {
  const aud = payload?.aud;
  return Array.isArray(aud) ? aud.includes(expected) : aud === expected;
}

function hasScope(payload, expected) {
  return typeof payload?.scope === "string" &&
    payload.scope.split(/\s+/).includes(expected);
}

function pass(label) {
  console.log(`  ✅ ${label}`);
}
function fail(label, detail) {
  console.error(`  ❌ ${label}`);
  if (detail)
    console.error(
      "    ",
      typeof detail === "object" ? JSON.stringify(detail) : detail,
    );
  process.exitCode = 1;
}
function section(label) {
  console.log(`\n── ${label} ──`);
}
function skip(label) {
  console.log(`  ⏭  ${label}`);
}

// ─── main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Testing MCP OAuth flow against ${BASE_URL}\n`);

  // 1. Discovery
  section("Discovery");
  const { body: prJson } = get(
    `${BASE_URL}/.well-known/oauth-protected-resource`,
  );
  const advertisedResource = prJson.resource;
  if (advertisedResource === `${BASE_URL}/api/mcp`) {
    pass(`protected resource = ${advertisedResource}`);
  } else {
    fail("oauth-protected-resource resource mismatch", prJson);
    return;
  }
  if (prJson.authorization_servers?.[0] === BASE_URL)
    pass("oauth-protected-resource issuer matches");
  else fail("oauth-protected-resource issuer mismatch", prJson);

  const { body: asJson } = get(
    `${BASE_URL}/.well-known/oauth-authorization-server`,
  );
  if (asJson.issuer === BASE_URL) pass(`well-known issuer = ${asJson.issuer}`);
  else fail("well-known issuer mismatch", asJson.issuer);
  if (asJson.code_challenge_methods_supported?.includes("S256"))
    pass("S256 PKCE advertised");
  else fail("S256 PKCE missing from well-known");

  // 2. Unauthenticated 401
  section("Unauthenticated request");
  const unauth = post(MCP_URL, {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {},
  });
  if (unauth.status === 401) pass("401 without Bearer token");
  else fail("Expected 401 without token", unauth.status);
  const wwwAuth = unauth.wwwAuthenticate ?? "";
  if (wwwAuth.includes("resource_metadata"))
    pass("WWW-Authenticate has resource_metadata");
  else fail("WWW-Authenticate missing resource_metadata", wwwAuth);

  // 3. Get access token
  let accessToken = process.env.MCP_BEARER_TOKEN ?? null;

  if (accessToken) {
    section("Bearer token (from env)");
    pass("Using MCP_BEARER_TOKEN from environment");
  } else if (IS_STAGING) {
    // Full headless PKCE flow via dev-login
    section("Dev login (staging)");
    const devSecret = process.env.E2E_DEV_ROUTE_SECRET;
    if (!devSecret) {
      fail("E2E_DEV_ROUTE_SECRET not set — required for staging headless flow");
      return;
    }

    const loginResp = get(DEV_LOGIN_URL, { "x-dev-route-secret": devSecret });
    // dev login sets a session cookie and redirects to /api/post-login
    const setCookieMatches =
      loginResp.headers.match(/set-cookie:\s*([^\r\n]+)/gi) || [];
    const rawCookie =
      loginResp.setCookie ||
      (setCookieMatches[0]
        ? setCookieMatches[0].replace(/^set-cookie:\s*/i, "")
        : "");
    const sessionCookie = rawCookie.split(";")[0];
    if (sessionCookie)
      pass(`Got session cookie (${sessionCookie.split("=")[0]})`);
    else {
      fail("Dev login did not return session cookie", loginResp.headers);
      return;
    }

    section("DCR + PKCE auth flow (staging)");
    const { verifier, challenge } = pkce();
    const state = randomBytes(16).toString("hex");
    const redirectUri = `${BASE_URL}/api/dev/oauth-cb`;

    // Register client
    const reg = post(REGISTER_URL, {
      client_name: "mcp-test-script",
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
      scope: "openid offline_access tenant",
    });
    if (reg.status !== 200 && reg.status !== 201) {
      fail("DCR failed", reg.body);
      return;
    }
    const testClientId = reg.body.client_id;
    pass(`Registered test client: ${testClientId}`);

    // Authorization request (redirects to consent page)
    const authParams = new URLSearchParams({
      client_id: testClientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid offline_access tenant",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource: advertisedResource,
    });
    const authResp = get(`${AUTHORIZE_URL}?${authParams}`, {
      Cookie: sessionCookie,
    });
    // Should redirect to consent page
    const consentLocation = authResp.location;
    if (!consentLocation) {
      fail("Auth did not redirect to consent", authResp.status);
      return;
    }
    pass("Auth request redirected to consent page");

    // Extract oauth_query from consent redirect
    const consentUrl = new URL(
      consentLocation.startsWith("http")
        ? consentLocation
        : `${BASE_URL}${consentLocation}`,
    );
    const oauthQuery = consentUrl.search.slice(1); // everything after ?

    // POST consent accept
    const consentResp = post(
      CONSENT_URL,
      { accept: true, oauth_query: oauthQuery },
      { Cookie: sessionCookie, Origin: BASE_URL },
    );
    if (consentResp.status !== 200 || !consentResp.body?.url) {
      fail("Consent failed", consentResp.body);
      return;
    }
    const callbackUrl = new URL(consentResp.body.url);
    const code = callbackUrl.searchParams.get("code");
    if (!code) {
      fail("No code in consent callback", consentResp.body.url);
      return;
    }
    pass(`Got authorization code: ${code.slice(0, 8)}...`);

    // Exchange code for token
    const tokenResp = postForm(TOKEN_URL, {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: testClientId,
      code_verifier: verifier,
      resource: advertisedResource,
    });
    if (tokenResp.status !== 200 || !tokenResp.body.access_token) {
      fail("Token exchange failed", tokenResp.body);
      return;
    }
    accessToken = tokenResp.body.access_token;
    pass(`Got JWT access token (type=${tokenResp.body.token_type})`);

    const accessTokenPayload = decodeJwtPayload(accessToken);
    if (accessTokenPayload && hasAudience(accessTokenPayload, advertisedResource)) {
      pass("access token audience matches MCP resource");
    } else {
      fail("access token audience missing MCP resource", accessTokenPayload);
      return;
    }
    if (hasScope(accessTokenPayload, "tenant")) {
      pass("access token includes tenant scope");
    } else {
      fail("access token missing tenant scope", accessTokenPayload);
      return;
    }
    if (typeof tokenResp.body.id_token === "string") {
      pass("token response includes id_token for reauthorization context");
    } else {
      fail("token response missing id_token", tokenResp.body);
      return;
    }
  } else {
    section("Token (production)");
    skip("No MCP_BEARER_TOKEN set — skipping authenticated MCP checks");
    skip("Set MCP_BEARER_TOKEN=<jwt> to run full flow against production");
    console.log("\n✅ Discovery + unauthenticated checks passed.");
    return;
  }

  const bearerPayload = decodeJwtPayload(accessToken);
  if (bearerPayload) {
    if (hasAudience(bearerPayload, advertisedResource)) {
      pass("Bearer token audience is accepted by tenant MCP");
    } else {
      fail("Bearer token audience is not accepted by tenant MCP", bearerPayload);
    }
    if (hasScope(bearerPayload, "tenant")) {
      pass("Bearer token includes tenant scope");
    } else {
      fail("Bearer token missing tenant scope", bearerPayload);
    }
  } else {
    skip("Bearer token is opaque — audience cannot be inspected locally");
  }

  // 4. MCP initialize
  section("MCP initialize");
  const initResp = post(
    MCP_URL,
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: MCP_VERSION,
        capabilities: {},
        clientInfo: { name: "test-script", version: "1.0" },
      },
    },
    {
      Authorization: `Bearer ${accessToken}`,
      "MCP-Protocol-Version": MCP_VERSION,
    },
  );
  if (initResp.status === 200 && initResp.body?.result?.protocolVersion) {
    pass(
      `initialize OK — server protocolVersion=${initResp.body.result.protocolVersion}`,
    );
  } else {
    fail("initialize failed", initResp.body);
  }

  // 5. notifications/initialized
  const notifResp = post(
    MCP_URL,
    { jsonrpc: "2.0", method: "notifications/initialized" },
    {
      Authorization: `Bearer ${accessToken}`,
      "MCP-Protocol-Version": MCP_VERSION,
    },
  );
  if (notifResp.status === 200 || notifResp.status === 202)
    pass("notifications/initialized acknowledged");
  else fail("notifications/initialized unexpected status", notifResp.status);

  // 6. tools/list
  section("MCP tools/list");
  const listResp = post(
    MCP_URL,
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    {
      Authorization: `Bearer ${accessToken}`,
      "MCP-Protocol-Version": MCP_VERSION,
    },
  );
  if (listResp.status === 200 && Array.isArray(listResp.body?.result?.tools)) {
    pass(`tools/list returned ${listResp.body.result.tools.length} tools`);
    const names = listResp.body.result.tools.map((t) => t.name);
    if (names.includes("list_sites")) pass("list_sites tool present");
    else fail("list_sites missing from tools/list", names.slice(0, 5));
  } else {
    fail("tools/list failed", listResp.body);
  }

  // 7. tools/call list_sites
  section("MCP tools/call list_sites");
  const callResp = post(
    MCP_URL,
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "list_sites", arguments: {} },
    },
    {
      Authorization: `Bearer ${accessToken}`,
      "MCP-Protocol-Version": MCP_VERSION,
    },
  );
  if (callResp.status === 200 && !callResp.body?.result?.isError) {
    pass("list_sites call succeeded");
  } else {
    fail("list_sites call failed", callResp.body);
  }

  console.log(
    "\n" +
      (process.exitCode ? "❌ Some checks failed." : "✅ All checks passed."),
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
