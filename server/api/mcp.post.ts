import { HTTPError, defineHandler } from 'nitro';
import { readBody } from 'nitro/h3';
import type { H3Event } from "nitro";
import {
  createMcpHandler,
  McpServer,
  ProtocolError,
  hostHeaderValidationResponse,
  originValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  type AuthInfo,
  type ListToolsResult,
  type McpRequestContext,
} from "@modelcontextprotocol/server";
import { asMcpError, mcpSuccess, mcpFailure, MCP_ERROR, type JsonRpcId } from "~/server/utils/mcp-protocol";
import { catalogFingerprint, catalogMeta } from "~/server/utils/mcp-catalog";
import { executeMcpToolCall } from "~/server/utils/mcp-executor";
import { isMcpRenderResponse } from "~/server/utils/mcp-render";
import {
  getActiveEntitlements, getVisibleOrganizationContext, requireMcpUser, roleSatisfies, type McpUserContext, } from "~/server/utils/mcp-auth";
import { MCP_PUBLIC_TOOLS, MCP_TOOLS } from "~/server/utils/mcp-tools";
import { MCP_PROMPTS, renderMcpPrompt } from "~/server/utils/mcp-prompts";
import { cloudflareEnv } from "~/server/utils/api-response";
import { createDb } from "~/server/db";
import { drainPublicResourceCacheInvalidations, purgePublicResourceCacheNow } from "~/server/utils/public-resource-cache";
import { resolveMissingMcpCredential, type McpToolMeta } from "~/server/utils/mcp-runtime";
import {
  buildMcpAuthChallengeForError, describeMcpAuthTelemetryError, getCloudflareWaitUntil, isMcpMutatingTool, mcpAuthRequiredResult, mcpToolErrorResult, setMcpAuthChallenge, } from "~/server/utils/mcp-route-helpers";
import { logMcpToolCallEvent } from "~/server/utils/mcp-telemetry";
import { describeErrorForTelemetry, errorChainForTelemetry } from "~/server/utils/error-telemetry";
import { getRequestDataMetrics, recordRequestPhase } from "~/server/utils/request-metrics";

const TENANT_CATALOG_FINGERPRINT = catalogFingerprint(MCP_PUBLIC_TOOLS);

// Worker execution context reports telemetry rejection without replaying a committed tool.
function logMcpEventDetached(
  event: Parameters<typeof getCloudflareWaitUntil>[0], db: D1Database | undefined, input: Parameters<typeof logMcpToolCallEvent>[1], ) {
  if (!db) return;
  const env = cloudflareEnv(event);
  const logInput = {
    env, ...input, userAgent: input.userAgent ?? (event.req.headers.get("user-agent")) ?? null, cfRayId: input.cfRayId ?? (event.req.headers.get("cf-ray")) ?? null, sessionId: input.sessionId ?? (event.req.headers.get("mcp-session-id")) ?? null, catalogFingerprint: input.catalogFingerprint ?? TENANT_CATALOG_FINGERPRINT, };
  const logged = logMcpToolCallEvent(db, logInput);
  const waitUntil = getCloudflareWaitUntil(event);
  waitUntil!(logged);
}

const TENANT_AUTH_DESCRIPTION = "Connect KrabiClaw to continue.";
const TENANT_AUTH_REQUIRED_TEXT = "Authentication required: connect KrabiClaw to continue.";

function resourceMetadataUrl(baseUrl: string) {
  return `${baseUrl}/.well-known/oauth-protected-resource`;
}

function resolveTenantToolMeta(toolName: string | null): McpToolMeta {
  const tool = toolName ? MCP_TOOLS.find((t) => t.name === toolName) : undefined;
  return { domain: tool?.domain ?? null, isMutating: isMcpMutatingTool(tool) };
}

const MCP_INSTRUCTIONS = `KrabiClaw manages content and settings for the site selected by the user.

Use internal organization and location IDs from get_workspace_context, list_organizations or list_locations. Confirm an ambiguous target before a write; an explicitly selected target remains selected until the user changes it. Public URLs and names identify a site to look up, not IDs to pass to tools. Organization/location setup, domains and billing are managed in the dashboard.

Media tools save existing attachments or assets to the selected site when the user requests that action. Saving creates publicly accessible media even before assignment. save_generated_image_file accepts an existing generated image attachment; upload_user_media accepts user attachments, and videos require a poster image. Use only authorized file references supplied by the host. If attachment delivery fails, report it and request a new attachment rather than inventing a URL. set_media replaces or clears one cover, hero or logo; attach_media, remove_media and reorder_media manage ordered galleries. Use the exact target owner ID and placement requested by the user.

create_post makes a draft short website/social post. create_blog_post makes a draft blog or documentation article. create_product makes a catalog offering with variants and prices. Publication is a separate action; changes to already published content can appear immediately. Publish only to the destinations the user requests. Connected social targets and publication states come from get_social_connections and publication reads. Report uncertain publication outcomes and reconcile them without creating a second provider post.

For whole-document or collection replacement, read the latest state and preserve everything outside the requested change. Use the supplied concurrency tokens and deletion confirmations. Read all pages before claiming a complete collection or replacing it. Prices belong to variants; location offerings and website visibility are separate. Weekly schedules use Product duration/capacity; saved Sessions retain their actual facts and any Booking history protects them.

Contact submissions and table reservations can be read here; response/status work uses the dashboard inbox. Reviews and imported Google Q&A are managed in Google. Authored Q&A has dedicated create, update, delete and reorder tools. Language tools manage exact authored representations rather than automatic translation.

Report the affected site and actual result, including a returned public or preview URL when useful. Distinguish draft content, published content and unresolved external publication. Tool availability, authorization and entitlements are enforced by the server.`;

// Everything a per-request Server factory needs, threaded through
// `AuthInfo.extra` since `McpServerFactory` only receives an `McpRequestContext`.
interface McpFactoryContext {
  event: H3Event;
  mcpUser: McpUserContext | undefined;
  cfEnv: ReturnType<typeof cloudflareEnv>;
}

function factoryContextFrom(ctx: McpRequestContext): McpFactoryContext {
  const extra = ctx.authInfo?.extra as McpFactoryContext | undefined;
  if (!extra) throw new ProtocolError(MCP_ERROR.internal, "Missing authenticated MCP request context.");
  return extra;
}

// Builds one `McpServer` per HTTP exchange (createMcpHandler's contract).
// `initialize`, `ping`, and protocol/version negotiation are the SDK's own —
// only the KrabiClaw-specific catalog (tools/list, tools/call) and the two
// vestigial prompt methods are ours. Registered directly on the underlying
// `Server` (McpServer's own escape hatch for advanced use cases) rather than
// through `registerTool()`, since our tool catalog is filtered per-request
// by site/role/entitlement rather than a static per-tool registry.
function createTenantMcpServer(ctx: McpRequestContext): McpServer {
  const mcpServer = new McpServer(
    { name: "krabiclaw-mcp", version: "phase-5" },
    { capabilities: { tools: {}, resources: {}, prompts: {} }, instructions: MCP_INSTRUCTIONS },
  );
  const server = mcpServer.server;

  // The app has never populated MCP resources — this preserves the existing
  // empty-catalog / not-found-on-read behavior rather than dropping the
  // capability (clients that already probe resources/list expect a list, not
  // a method-not-found error).
  server.setRequestHandler("resources/list", async () => ({ resources: [] }));
  server.setRequestHandler("resources/templates/list", async () => ({ resourceTemplates: [] }));
  server.setRequestHandler("resources/read", async (request) => {
    const uri = typeof request.params?.uri === "string" ? request.params.uri : "";
    throw new ProtocolError(MCP_ERROR.invalidParams, `Unknown MCP app resource: ${uri}`);
  });

  // server/discover is a pre-handshake optimization some clients use to skip
  // the spec's own initialize-retry version negotiation. @modelcontextprotocol/
  // server@2.0.0 only wires it up for servers that speak the modern
  // (2026-07-28+) protocol era — see _ondiscover in the SDK's Server
  // constructor, gated on modernProtocolVersions(...).length > 0. This server
  // only serves the legacy eras, so an unregistered server/discover correctly
  // falls through to -32601 Method not found; clients fall back to the
  // spec-mandated initialize → version-mismatch → retry path instead. This is
  // the deliberate replacement for issue #922/#923's old hand-rolled,
  // partial server/discover shim — bolting a bespoke discover handler onto a
  // legacy-only server is exactly the one-off-per-client pattern that caused
  // those incidents.

  server.setRequestHandler("prompts/list", async () => ({ prompts: MCP_PROMPTS }));

  server.setRequestHandler("prompts/get", async (request) => {
    const name = typeof request.params?.name === "string" ? request.params.name : "";
    const rawArgs = request.params?.arguments;
    const promptArgs: Record<string, string> = {};
    if (rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)) {
      for (const [key, value] of Object.entries(rawArgs as Record<string, unknown>)) {
        if (typeof value === "string") promptArgs[key] = value;
      }
    }
    const rendered = renderMcpPrompt(name, promptArgs);
    return {
      description: rendered.description,
      messages: [{ role: "user" as const, content: { type: "text" as const, text: rendered.text } }],
    };
  });

  server.setRequestHandler("tools/list", async () => {
    const { event, mcpUser, cfEnv } = factoryContextFrom(ctx);
    if (!mcpUser) throw new ProtocolError(MCP_ERROR.internal, "Missing authenticated MCP request context.");
    // organization_id is a KrabiClaw-specific extension for site-scoped tool
    // discovery — not part of the MCP spec's ListToolsRequestParams (only
    // cursor/_meta). @modelcontextprotocol/server validates tools/list
    // params against the spec's schema and silently drops unrecognized
    // properties, so a client-supplied params.organization_id never reaches this
    // handler (confirmed empirically: request.params arrives as {}). It has
    // to travel outside the validated params object — a request header,
    // which the SDK doesn't touch — instead.
    const organizationIdHeader = event.req.headers.get("x-krabiclaw-organization-id");
    const hasOrganizationIdParam = organizationIdHeader !== null;
    const organizationId = organizationIdHeader?.trim() || null;
    const organizationCtx = organizationId ? await getVisibleOrganizationContext(event, organizationId) : null;

    const visibleSurfaceTools = MCP_PUBLIC_TOOLS;

    const entitlementKeys = organizationCtx
      ? [...new Set(visibleSurfaceTools.map((t) => t.requiredEntitlement).filter(Boolean) as string[])]
      : [];
    const activeEntitlements = organizationCtx
      ? await getActiveEntitlements(cfEnv, organizationCtx.organizationId, entitlementKeys)
      : new Set<string>();

    // The role gate is the permission matrix now, so resolve it once per tool
    // before filtering rather than awaiting inside a sync predicate.
    const roleAllowsTool = new Map<string, boolean>()
    if (hasOrganizationIdParam && organizationId && organizationCtx) {
      await Promise.all(visibleSurfaceTools.map(async (tool) => {
        roleAllowsTool.set(tool.name, await roleSatisfies(organizationCtx.organizationId, organizationCtx.role, tool.minimumRole))
      }))
    }

    const tools = visibleSurfaceTools.filter((tool) => {
      // Without a organization_id, return all tools so AI clients (e.g. ChatGPT) can discover
      // the full capability set on first connection. A supplied but inaccessible
      // site must fail closed instead of receiving the unscoped catalog.
      if (!hasOrganizationIdParam) return true;
      if (!organizationId) return false;
      if (!organizationCtx) return false;
      if (!roleAllowsTool.get(tool.name)) return false;
      if (tool.requiredEntitlement && !activeEntitlements.has(tool.requiredEntitlement)) return false;
      return true;
    }).map((tool) => {
      const baseTool = {
        name: tool.name, description: tool.description, inputSchema: tool.inputSchema, _meta: {
          securitySchemes: tool.securitySchemes, "krabiclaw/toolInfo": {
            domain: tool.domain, minimumRole: tool.minimumRole, confirmRequired: tool.confirmRequired, }, ...(tool.fileParams?.length ? { "openai/fileParams": tool.fileParams } : {}), }, };
      return { ...baseTool, outputSchema: tool.outputSchema, annotations: tool.annotations, securitySchemes: tool.securitySchemes };
    });

    const domains = [...new Set(tools.map((tool) => tool._meta["krabiclaw/toolInfo"].domain))];
    logMcpEventDetached(event, cfEnv.DB, {
      organizationId: organizationCtx?.organizationId ?? null,  userId: mcpUser.userId, requestId: null, method: "tools/list", result: { count: tools.length, domains }, status: "success", httpStatus: 200, oauthClientId: mcpUser.oauthClientId ?? null, });

    // Our own McpToolDefinition types inputSchema/outputSchema as a loose
    // Record<string, unknown>; every entry in mcp-tools/*.ts is a real JSON
    // Schema object (validated by yarn mcp:catalog), just not provably so to
    // TS against the SDK's stricter Tool type.
    return { tools, _meta: catalogMeta(MCP_PUBLIC_TOOLS) } as unknown as ListToolsResult;
  });

  server.setRequestHandler("tools/call", async (request) => {
    const { event, mcpUser, cfEnv } = factoryContextFrom(ctx);
    if (!mcpUser) throw new ProtocolError(MCP_ERROR.internal, "Missing authenticated MCP request context.");
    const toolName = typeof request.params?.name === "string" ? request.params.name : "";
    const rawArgsValue = (request.params as { arguments?: unknown } | undefined)?.arguments;
    const rawArgs = (rawArgsValue && typeof rawArgsValue === "object" && !Array.isArray(rawArgsValue)
      ? rawArgsValue as Record<string, unknown>
      : {});

    const toolDef = MCP_TOOLS.find((t) => t.name === toolName);
    const toolStartedAt = Date.now();

    const authStartedAt = performance.now();
    // requireMcpUser already ran once up front in the route handler (this is
    // that same resolved user, not a second auth check).
    recordRequestPhase(event, "mcp_auth", authStartedAt);
    const executionStartedAt = performance.now();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any;
    try {
      result = await executeMcpToolCall(event, toolName, rawArgs, mcpUser);
    } catch (toolError) {
      recordRequestPhase(event, "mcp_execute", executionStartedAt);
      console.error({
        event: "mcp_tool_failed", tool: toolName, request_id: null,
        ray_id: event.req.headers.get("cf-ray"), duration_ms: Date.now() - toolStartedAt,
        errors: errorChainForTelemetry(toolError),
      });
      const mcpErr = asMcpError(toolError);
      if (mcpErr.kind === "protocol") {
        // Unknown-tool and similar protocol-level failures become a real
        // JSON-RPC error, not a tool result. `toolError` carries our own
        // `.mcp`-tagged shape, which the SDK doesn't read — throw its own
        // ProtocolError so createMcpHandler maps the code/data correctly
        // instead of falling back to a generic internal error.
        const telemetryErrorMessage = describeErrorForTelemetry(toolError);
        logMcpEventDetached(event, cfEnv.DB, {
          userId: mcpUser.userId, organizationId: mcpUser.activeOrganizationId ?? null,  requestId: null, method: "tools/call", toolName, toolDomain: toolDef?.domain ?? null, isMutating: false, arguments: rawArgs, status: "error", errorCode: mcpErr.code, errorMessage: telemetryErrorMessage, httpStatus: 200, jsonrpcErrorCode: mcpErr.code, jsonrpcErrorMessage: telemetryErrorMessage, unknownToolName: toolName || null, oauthClientId: mcpUser.oauthClientId ?? null, durationMs: Date.now() - toolStartedAt, });
        throw new ProtocolError(mcpErr.code, mcpErr.message, mcpErr.data);
      }
      logMcpEventDetached(event, cfEnv.DB, {
        userId: mcpUser.userId, organizationId: mcpUser.activeOrganizationId ?? null,  requestId: null, method: "tools/call", toolName, toolDomain: toolDef?.domain ?? null, isMutating: isMcpMutatingTool(toolDef), arguments: rawArgs, status: "error", errorCode: mcpErr.code, errorMessage: describeErrorForTelemetry(toolError), httpStatus: 200, oauthClientId: mcpUser.oauthClientId ?? null, durationMs: Date.now() - toolStartedAt, });
      // Any other tool-execution failure (including a plain `throw new
      // Error(...)` from a business-rule guard, which asMcpError falls back
      // to classifying as kind:'transport') must still resolve as a
      // graceful isError:true CallToolResult, not a JSON-RPC error — MCP
      // clients can't act on a transport-level error mid-tool-call.
      return { isError: true, content: [{ type: "text", text: mcpErr.message }] };
    }

    recordRequestPhase(event, "mcp_execute", executionStartedAt);
    const isRender = isMcpRenderResponse(result);
    const structuredContent = isRender ? result.structuredContent : result;
    const modelText = isRender && result.modelText ? result.modelText : JSON.stringify(structuredContent, null, 2);

    // Resolved once and reused for both telemetry and the cache-purge below.
    const structuredContextOrganizationId = structuredContent && typeof structuredContent === "object" && "context" in structuredContent
      ? (structuredContent.context as Record<string, unknown>)?.organization_id
      : null;
    const metaContextOrganizationId = isRender && result.privateMeta?.context && typeof result.privateMeta.context === "object"
      ? (result.privateMeta.context as Record<string, unknown>)?.organization_id
      : null;
    const ctxOrganizationId = typeof structuredContextOrganizationId === "string" ? structuredContextOrganizationId : metaContextOrganizationId;
    const resolvedOrganizationId = typeof ctxOrganizationId === "string"
      ? ctxOrganizationId.trim()
      : typeof rawArgs.organization_id === "string" ? rawArgs.organization_id.trim() : null;

    // After any mutating tool call the site's caches are cleared before the
    // response: its public resource entries and the SSR HTML for every active
    // hostname and its subdomain, all through purgeOrganizationCaches. Awaited,
    // so a client that reads right after the mutation cannot see what it
    // replaced. A missing binding reaches the helper and fails there.
    let purgeFailure: string | null = null;
    if (isMcpMutatingTool(toolDef) && resolvedOrganizationId) {
      const env = cloudflareEnv(event);
      const cacheStartedAt = performance.now();
      // A purge that failed is the edit not reaching the site. The write has
      // landed, so this is neither success nor a transport failure: the tool
      // result says both halves, and the client can act on it.
      try {
        await purgePublicResourceCacheNow({
          DB: env.db,
          ORGANIZATION_CACHE: env.ORGANIZATION_CACHE,
          NUXT_PUBLIC_FREE_ORGANIZATION_DOMAIN: env.NUXT_PUBLIC_FREE_ORGANIZATION_DOMAIN,
        }, resolvedOrganizationId);
      } catch (purgeError) {
        purgeFailure = `${toolName} wrote its change to organization ${resolvedOrganizationId}, but the public cache was not purged, so the site may keep serving what the write replaced: ${describeErrorForTelemetry(purgeError)}`;
      } finally {
        recordRequestPhase(event, "mcp_cache_purge", cacheStartedAt);
      }
    }
    // The write above queued "this site changed"; drain it now so the site's
    // search index follows the tool call, the way a dashboard write's does.
    if (isMcpMutatingTool(toolDef) && resolvedOrganizationId) {
      const env = cloudflareEnv(event);
      const kv = env.ORGANIZATION_CACHE;
      const db = env.db ?? (env.DB ? createDb(env.DB) : null);
      if (!kv || !db) throw new Error("ORGANIZATION_CACHE and DB bindings are required to drain site changes after a tenant MCP write");
      try {
        await drainPublicResourceCacheInvalidations(db, kv, env, { organizationId: resolvedOrganizationId, limit: 100 });
      } catch (drainError) {
        const reason = `${toolName} wrote its change to organization ${resolvedOrganizationId}, but the site's cache or search index was not updated: ${describeErrorForTelemetry(drainError)}`;
        purgeFailure = purgeFailure ? `${purgeFailure}; ${reason}` : reason;
      }
    }

    logMcpEventDetached(event, cfEnv.DB, {
      userId: mcpUser.userId, organizationId: mcpUser.activeOrganizationId ?? null,  requestId: null, method: "tools/call", toolName, toolDomain: toolDef?.domain ?? null, isMutating: isMcpMutatingTool(toolDef), arguments: rawArgs, result: structuredContent, status: purgeFailure ? "error" : "success", errorMessage: purgeFailure, httpStatus: 200, oauthClientId: mcpUser.oauthClientId ?? null, durationMs: Date.now() - toolStartedAt, });

    return {
      isError: purgeFailure !== null, structuredContent, content: [{ type: "text", text: purgeFailure ?? modelText }],
      ...(isRender && result.privateMeta ? { _meta: result.privateMeta } : {}),
    };
  });

  return mcpServer;
}

// responseMode: 'json' — this server is fully stateless and never emits a
// progress/logging notification before a result, so there's nothing for the
// SDK's default 'auto' mode to ever upgrade to SSE for; forcing 'json' keeps
// every response a flat JSON body instead of leaving that upgrade decision
// implicit to callers that don't expect it.
const mcpHandler = createMcpHandler(createTenantMcpServer, { responseMode: "json" });

// Best-effort peek at the JSON-RPC method for logging and for the two methods
// (ping, notifications/initialized) that intentionally skip full token
// verification — mirrors the precedence createMcpHandler itself uses
// (body.method, then the Mcp-Method header) so this peek never disagrees
// with how the SDK actually routes the same parsed body.
function peekMcpMethod(event: H3Event, body: unknown): string | undefined {
  if (body && typeof body === "object" && !Array.isArray(body) && typeof (body as Record<string, unknown>).method === "string") {
    return (body as Record<string, unknown>).method as string;
  }
  return event.req.headers.get("mcp-method") ?? undefined;
}

function peekMcpId(body: unknown): JsonRpcId | undefined {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const rawId = (body as Record<string, unknown>).id;
    if (typeof rawId === "string" || typeof rawId === "number" || rawId === null) return rawId;
  }
  return undefined;
}

export default defineHandler(async (event) => {
  if (!getCloudflareWaitUntil(event)) {
    throw new HTTPError({ statusCode: 503, statusMessage: "MCP requires the Worker execution context" });
  }
  const requestStartedAt = Date.now();
  const cfEnv = cloudflareEnv(event);
  const baseUrl = cfEnv.BETTER_AUTH_URL?.replace(/\/$/, "");
  if (!baseUrl) throw new HTTPError({ status: 500, statusText: "BETTER_AUTH_URL is required" });

  const allowedHostnames = [new URL(baseUrl).hostname, ...localhostAllowedHostnames()];
  const allowedOriginHostnames = [new URL(baseUrl).hostname, ...localhostAllowedOrigins()];
  // Nitro's TypedServerRequest structurally differs from the Workers-typed
  // Request these SDK helpers expect (an optional vs. required `cache`
  // field) despite both being the same object at runtime.
  const webRequest = event.req as unknown as Request;
  const rejectedHost = hostHeaderValidationResponse(webRequest, allowedHostnames);
  if (rejectedHost) return rejectedHost;
  const rejectedOrigin = originValidationResponse(webRequest, allowedOriginHostnames);
  if (rejectedOrigin) return rejectedOrigin;

  const tenantAuthOptions = { audiences: [`${baseUrl}/api/mcp`], requiredScopes: ["tenant"] };
  const runtimeDeps = {
    authOptions: tenantAuthOptions, resourceMetadataUrl, authDescription: TENANT_AUTH_DESCRIPTION, authRequiredText: TENANT_AUTH_REQUIRED_TEXT, logEvent: (evt: typeof event, fields: Record<string, unknown>) =>
      logMcpEventDetached(evt, cfEnv.DB, fields as unknown as Parameters<typeof logMcpToolCallEvent>[1]), resolveToolMeta: resolveTenantToolMeta, };

  let requestId: JsonRpcId | undefined;
  let requestMethod: string | undefined;

  try {
    // Return 401 with WWW-Authenticate before any protocol parsing so OAuth
    // clients (e.g. ChatGPT) can discover the authorization server on first touch.
    // Session-cookie requests (dashboard, E2E tests) have a Cookie header and skip this.
    const missingCredential = await resolveMissingMcpCredential(event, runtimeDeps, baseUrl);
    if (missingCredential.handled) {
      requestMethod = missingCredential.requestMethod;
      console.warn("[MCP_AUTH]", JSON.stringify({
        event: "credential_missing", ray_id: (event.req.headers.get("cf-ray")) ?? null, user_agent: (event.req.headers.get("user-agent")) ?? null, mcp_method: requestMethod ?? null, tool_name: missingCredential.requestToolName ?? null, }));
      return missingCredential.response;
    }

    const body = await readBody(event);
    requestMethod = peekMcpMethod(event, body);
    requestId = peekMcpId(body);

    console.info('[MCP_REQUEST]', JSON.stringify({
      event: 'mcp_request_started', request_id: getRequestDataMetrics(event).requestId,
      rpc_id: requestId ?? null, method: requestMethod ?? null,
      ray_id: event.req.headers.get('cf-ray'),
    }));

    // `ping` and `notifications/initialized` are intentionally unauthenticated
    // beyond the credential-presence check above: MCP clients use `ping` as a
    // liveness check before the OAuth handshake completes, and
    // `notifications/initialized` carries no business context to authorize.
    const skipTokenVerification = requestMethod === "ping" || requestMethod === "notifications/initialized";
    let mcpUser: McpUserContext | undefined;
    if (!skipTokenVerification) {
      try {
        mcpUser = await requireMcpUser(event, tenantAuthOptions);
      } catch (error) {
        const mcpError = asMcpError(error);
        const isToolCall = requestMethod === "tools/call";
        if (mcpError.kind === "auth") {
          const authChallenge = buildMcpAuthChallengeForError(error, {
            resourceMetadataUrl: resourceMetadataUrl(baseUrl), defaultDescription: TENANT_AUTH_DESCRIPTION, });
          logMcpEventDetached(event, cfEnv.DB, {
            requestId: null, method: requestMethod ?? "unknown", status: "auth_required", errorCode: mcpError.code, errorMessage: describeMcpAuthTelemetryError(error), httpStatus: isToolCall ? 200 : 401, });
          if (isToolCall) return mcpSuccess(requestId, mcpAuthRequiredResult({ challenge: authChallenge, message: TENANT_AUTH_REQUIRED_TEXT }));
          event.res.status = 401;
          setMcpAuthChallenge(event, authChallenge);
          return mcpFailure(requestId, mcpError);
        }
        if (mcpError.kind === "forbidden" && isToolCall) {
          return mcpSuccess(requestId, mcpToolErrorResult(mcpError.message));
        }
        const status = mcpError.kind === "forbidden" ? 403 : 500;
        if (status >= 500) console.error(error instanceof Error ? error.stack ?? error.message : error);
        event.res.status = status;
        return mcpFailure(requestId, mcpError);
      }
    }

    const factoryContext: McpFactoryContext = { event, mcpUser, cfEnv };
    const authInfo: AuthInfo = {
      token: "resolved", clientId: mcpUser?.oauthClientId ?? "session", scopes: mcpUser?.scopes ?? [],
      extra: factoryContext as unknown as Record<string, unknown>,
    };

    const response = await mcpHandler.fetch(webRequest, { authInfo, parsedBody: body });
    // MCP clients (e.g. ChatGPT) read Mcp-Session-Id off the initialize
    // response and echo it on later calls. The server is fully stateless —
    // nothing here actually keys off this id — but issuing one preserves the
    // existing client-observable contract instead of breaking clients that
    // expect it to be present.
    if (requestMethod === "initialize" && response.ok && !response.headers.has("Mcp-Session-Id")) {
      const headers = new Headers(response.headers);
      headers.set("Mcp-Session-Id", crypto.randomUUID());
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }
    return response;
  } finally {
    console.info('[MCP_REQUEST]', JSON.stringify({
      event: 'mcp_request_finished', request_id: getRequestDataMetrics(event).requestId,
      rpc_id: requestId ?? null, method: requestMethod ?? null,
      ray_id: event.req.headers.get('cf-ray'), duration_ms: Date.now() - requestStartedAt,
    }));
  }
});
