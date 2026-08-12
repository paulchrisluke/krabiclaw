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

import { createHash, randomBytes } from "crypto";
import { request as httpsRequest } from "node:https";

const BASE_URL = process.argv.includes("--base-url")
  ? process.argv[process.argv.indexOf("--base-url") + 1]
  : (process.env.MCP_BASE_URL ?? "https://staging.krabiclaw.com");

const MCP_URL = `${BASE_URL}/api/mcp`;
const TOKEN_URL = `${BASE_URL}/api/auth/oauth2/token`;
const DEV_LOGIN_URL = `${BASE_URL}/api/dev/login`;
const AUTHORIZE_URL = `${BASE_URL}/api/auth/oauth2/authorize`;
const CONSENT_URL = `${BASE_URL}/api/auth/oauth2/consent`;
const TEST_CLIENT_METADATA_URL = process.env.MCP_CIMD_CLIENT_URL ??
  `${BASE_URL}/api/auth/oauth2/test-client-metadata`;

const MCP_VERSION = process.env.MCP_PROTOCOL_VERSION ?? "2025-06-18";
const REQUEST_TIMEOUT_MS = 15_000;

const USE_DEV_LOGIN = process.env.MCP_DEV_LOGIN === "1";

// ─── helpers ────────────────────────────────────────────────────────────────

async function request(url, init = {}) {
  const target = new URL(url);
  if (target.protocol !== "https:") {
    throw new Error(`MCP OAuth smoke requires HTTPS, received ${target.origin}`);
  }

  return await new Promise((resolve, reject) => {
    const request = httpsRequest(target, {
      method: init.method ?? "GET",
      headers: init.headers,
      family: 4,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        if (response.statusCode === undefined) {
          reject(new Error(`Missing HTTP status for ${target.href}`));
          return;
        }

        resolve({
          status: response.statusCode,
          headers: response.headers,
          bodyText: Buffer.concat(chunks).toString("utf8").trim(),
        });
      });
    });

    request.on("error", reject);
    if (init.body !== undefined) request.write(init.body);
    request.end();
  });
}

function jsonBody(response, label) {
  const contentType = response.headers["content-type"];
  if (typeof contentType !== "string" || !contentType.startsWith("application/json")) {
    throw new Error(`${label} returned non-JSON content-type: ${String(contentType)}`);
  }
  return JSON.parse(response.bodyText);
}

function get(url, headers = {}) {
  return request(url, { headers });
}

function post(url, body, headers = {}) {
  return request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function postForm(url, params, headers = {}) {
  return request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body: new URLSearchParams(params).toString(),
  });
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
  const protectedResourceResponse = await get(
    `${BASE_URL}/.well-known/oauth-protected-resource`,
  );
  const prJson = jsonBody(
    protectedResourceResponse,
    "OAuth protected-resource discovery",
  );
  if (protectedResourceResponse.status !== 200) {
    fail("oauth-protected-resource endpoint failed", prJson);
    return;
  }
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

  const authorizationServerResponse = await get(
    `${BASE_URL}/.well-known/oauth-authorization-server`,
  );
  const asJson = jsonBody(
    authorizationServerResponse,
    "OAuth authorization-server discovery",
  );
  if (authorizationServerResponse.status !== 200) {
    fail("oauth-authorization-server endpoint failed", asJson);
    return;
  }
  if (asJson.issuer === BASE_URL) pass(`well-known issuer = ${asJson.issuer}`);
  else fail("well-known issuer mismatch", asJson.issuer);
  if (asJson.code_challenge_methods_supported?.includes("S256"))
    pass("S256 PKCE advertised");
  else fail("S256 PKCE missing from well-known");

  // 2. Unauthenticated 401
  section("Unauthenticated request");
  const unauth = await post(MCP_URL, {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {},
  });
  if (unauth.status === 401) pass("401 without Bearer token");
  else fail("Expected 401 without token", unauth.status);
  const wwwAuth = unauth.headers["www-authenticate"];
  if (typeof wwwAuth === "string" && wwwAuth.includes("resource_metadata"))
    pass("WWW-Authenticate has resource_metadata");
  else fail("WWW-Authenticate missing resource_metadata", wwwAuth);

  // 3. Get access token
  let accessToken = process.env.MCP_BEARER_TOKEN ?? null;

  if (accessToken) {
    section("Bearer token (from env)");
    pass("Using MCP_BEARER_TOKEN from environment");
  } else if (USE_DEV_LOGIN) {
    section("Dev login");
    const devSecret = process.env.E2E_DEV_ROUTE_SECRET;
    if (!devSecret) {
      fail("E2E_DEV_ROUTE_SECRET not set — required for staging headless flow");
      return;
    }

    const loginResp = await get(DEV_LOGIN_URL, { "x-dev-route-secret": devSecret });
    // dev login sets a session cookie and redirects to /api/post-login
    const setCookies = loginResp.headers["set-cookie"];
    if (loginResp.status !== 302 || !Array.isArray(setCookies) || setCookies.length !== 1) {
      fail("Dev login did not return one session cookie", {
        status: loginResp.status,
        setCookies,
      });
      return;
    }
    const sessionCookie = setCookies[0].split(";", 1)[0];
    if (sessionCookie.includes("="))
      pass(`Got session cookie (${sessionCookie.split("=")[0]})`);
    else {
      fail("Dev login returned a malformed session cookie", setCookies[0]);
      return;
    }

    section("CIMD + PKCE auth flow");
    const { verifier, challenge } = pkce();
    const state = randomBytes(16).toString("hex");
    const testClientId = TEST_CLIENT_METADATA_URL;
    const redirectUri = new URL("/oauth/test-callback", testClientId).toString();
    pass(`Using CIMD client: ${testClientId}`);

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
      prompt: "consent",
    });
    const authResp = await get(`${AUTHORIZE_URL}?${authParams}`, {
      Cookie: sessionCookie,
    });
    // Should redirect to consent page
    const consentLocation = authResp.headers.location;
    if (authResp.status !== 302 || typeof consentLocation !== "string") {
      fail("Auth did not redirect to consent", {
        status: authResp.status,
        body: authResp.bodyText,
      });
      return;
    }

    // Extract oauth_query from consent redirect
    const consentUrl = new URL(consentLocation, BASE_URL);
    if (consentUrl.pathname !== "/oauth/consent") {
      fail("Auth redirected to an unexpected route", consentUrl.toString());
      return;
    }
    pass("Auth request redirected to consent page");
    const oauthQuery = consentUrl.search.slice(1); // everything after ?

    // POST consent accept
    const consentResp = await post(
      CONSENT_URL,
      { accept: true, oauth_query: oauthQuery },
      { Cookie: sessionCookie, Origin: BASE_URL },
    );
    const consentBody = jsonBody(consentResp, "OAuth consent");
    if (consentResp.status !== 200 || typeof consentBody.url !== "string") {
      fail("Consent failed", consentBody);
      return;
    }
    const callbackUrl = new URL(consentBody.url);
    const code = callbackUrl.searchParams.get("code");
    if (!code) {
      fail("No code in consent callback", consentBody.url);
      return;
    }
    pass(`Got authorization code: ${code.slice(0, 8)}...`);

    // Exchange code for token
    const tokenResp = await postForm(TOKEN_URL, {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: testClientId,
      code_verifier: verifier,
      resource: advertisedResource,
    });
    const tokenBody = jsonBody(tokenResp, "OAuth token exchange");
    if (tokenResp.status !== 200 || typeof tokenBody.access_token !== "string") {
      fail("Token exchange failed", tokenBody);
      return;
    }
    accessToken = tokenBody.access_token;
    pass(`Got JWT access token (type=${tokenBody.token_type})`);

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
    if (typeof tokenBody.id_token === "string") {
      pass("token response includes id_token for reauthorization context");
    } else {
      fail("token response missing id_token", tokenBody);
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
  const initResp = await post(
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
  const initBody = jsonBody(initResp, "MCP initialize");
  if (initResp.status === 200 && initBody?.result?.protocolVersion) {
    pass(
      `initialize OK — server protocolVersion=${initBody.result.protocolVersion}`,
    );
  } else {
    fail("initialize failed", initBody);
  }

  // 5. notifications/initialized
  const notifResp = await post(
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
  const listResp = await post(
    MCP_URL,
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    {
      Authorization: `Bearer ${accessToken}`,
      "MCP-Protocol-Version": MCP_VERSION,
    },
  );
  const listBody = jsonBody(listResp, "MCP tools/list");
  if (listResp.status === 200 && Array.isArray(listBody?.result?.tools)) {
    pass(`tools/list returned ${listBody.result.tools.length} tools`);
    const names = listBody.result.tools.map((tool) => tool.name);
    for (const requiredTool of ["get_current_user", "list_sites"]) {
      if (names.includes(requiredTool)) pass(`${requiredTool} tool present`);
      else fail(`${requiredTool} missing from tools/list`, names);
    }
  } else {
    fail("tools/list failed", listBody);
  }

  // 7. Authenticated identity and tenant tool calls
  for (const [id, toolName] of [
    [3, "get_current_user"],
    [4, "list_sites"],
  ]) {
    section(`MCP tools/call ${toolName}`);
    const callResp = await post(
      MCP_URL,
      {
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name: toolName, arguments: {} },
      },
      {
        Authorization: `Bearer ${accessToken}`,
        "MCP-Protocol-Version": MCP_VERSION,
      },
    );
    const callBody = jsonBody(callResp, `MCP tools/call ${toolName}`);
    if (callResp.status === 200 && !callBody?.result?.isError) {
      pass(`${toolName} call succeeded`);
    } else {
      fail(`${toolName} call failed`, callBody);
    }
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
