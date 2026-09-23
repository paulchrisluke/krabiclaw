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
import { createDb, queryAll } from "~/server/db";
import { purgeSiteKvCache } from "~/server/utils/edge-cache";
import { drainPublicResourceCacheInvalidations, purgePublicResourceCacheSafe } from "~/server/utils/public-resource-cache";
import {
  visibleConversationalMcpTools, } from "~/server/utils/conversational-tool-surface";
import { resolveMissingMcpCredential, type McpToolMeta } from "~/server/utils/mcp-runtime";
import {
  buildMcpAuthChallengeForError, describeMcpAuthTelemetryError, getCloudflareWaitUntil, isMcpMutatingTool, mcpAuthRequiredResult, mcpToolErrorResult, setMcpAuthChallenge, } from "~/server/utils/mcp-route-helpers";
import { logMcpToolCallEvent } from "~/server/utils/mcp-telemetry";
import { describeErrorForTelemetry, errorChainForTelemetry } from "~/server/utils/error-telemetry";
import { getRequestDataMetrics, recordRequestPhase } from "~/server/utils/request-metrics";

const TENANT_CATALOG_FINGERPRINT = catalogFingerprint(MCP_PUBLIC_TOOLS);

// Fires a telemetry write without ever blocking or failing the MCP response.
function logMcpEventDetached(
  event: Parameters<typeof getCloudflareWaitUntil>[0], db: D1Database | undefined, input: Parameters<typeof logMcpToolCallEvent>[1], ) {
  if (!db) return;
  const env = cloudflareEnv(event);
  const logInput = {
    env, ...input, userAgent: input.userAgent ?? (event.req.headers.get("user-agent")) ?? null, cfRayId: input.cfRayId ?? (event.req.headers.get("cf-ray")) ?? null, sessionId: input.sessionId ?? (event.req.headers.get("mcp-session-id")) ?? null, catalogFingerprint: input.catalogFingerprint ?? TENANT_CATALOG_FINGERPRINT, };
  const logged = logMcpToolCallEvent(db, logInput);
  const waitUntil = getCloudflareWaitUntil(event);
  if (waitUntil) waitUntil(logged);
  else void logged.catch(error => console.error("Failed to persist MCP telemetry:", error));
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

const MCP_INSTRUCTIONS = `KrabiClaw — manage your restaurant or business website through this connection.

## Image work — applies at any point in the conversation
Whenever an image is needed (hero, logo, post thumbnail, Product photo, experience cover, story image, or any content section):

**AI-generated (user asks you to generate or create an image):**
1. Prepare an image prompt tailored to the business.
2. Call image_generation natively with model gpt-image-1 or gpt-image-2 and the prepared prompt.
3. Immediately call save_generated_image_file({ organization_id, attachment_id: <file reference from image_generation_call>, prompt }). Pass the file reference — never extract or forward the base64 from image_generation_call.result, that will be blocked by safety checks.
4. Show the generated image directly in the conversation for review; use the returned public_url when needed.
5. After the user approves, use the returned asset_id with set_media for a single image or attach_media for an ordered gallery. Use placement { owner_type, owner_id, slot } and the exact owner id returned by a read tool.
6. If the user wants changes, revise the prompt and repeat from step 2.

For multi-item requests, repeat the complete flow once per item. Generate one standalone image for each target and never substitute a collage, contact sheet, website screenshot, or UI mockup. For Products, each set_media or attach_media call must include that Product's exact id; use slot image for the explicit primary and gallery for the ordered detail gallery. Finish every requested item before reporting completion.

This entire flow runs within the current conversation — do not tell the user to leave the app or use a different context.

**User-uploaded (user provides their own photo):**
1. Ask the user to attach the photo directly in ChatGPT if they have not already done so. Do not send users to the KrabiClaw dashboard/media uploader for photos from this MCP app.
2. When the user has attached an image in ChatGPT, inspect it visually first. Do not upload or mutate anything yet.
3. If the intended use is obvious, describe it briefly and ask the user to confirm the target site, the target placement, and that the attached image should be used.
4. Do not upload media, assign an image, publish, or overwrite anything until the user explicitly confirms.
5. After confirmation, call upload_user_media({ organization_id, file: <resolved ChatGPT file reference for the attachment>, category, description }). This is the only tool for a user-provided photo — there is no separate "open upload" tool for images.
6. The file argument is the only contract. Pass the ChatGPT attachment through the file field and let the host rewrite it into an authorized file reference for KrabiClaw. Do not pass a bare file_id, fabricate download URLs, wrap fake file objects, or suggest an in-app photo uploader. If attachment delivery fails, stop and ask the user to attach it again; do not try a second transport.
7. After upload_user_media returns asset_id/public_url, call set_media with asset_id for a single-value placement. For an ordered placement, call attach_media for each new asset and reorder_media only when needed.
8. Reply with the exact site, placement, asset_id, and public_url that were updated.

**Videos:**
- Ask the user to attach the video directly in ChatGPT with the paperclip.
- Every video requires a poster image. Ask the user to attach one before uploading the video.
- Call upload_user_media({ organization_id, file: <resolved video reference>, poster_file: <resolved poster image reference>, category, description }) for every video upload.
- After upload_user_media returns asset_id/public_url, use the exact owner id from a read tool. Call set_media with asset_id for a single cover/hero/logo; call attach_media for a gallery or document list and reorder_media only when needed.

## Choosing a content type
KrabiClaw has three distinct content-creation tools — do not default to whichever one comes to mind first. Ask yourself whether the request is time-boxed, narrative, or a permanent offering:
- **create_post** — a time-boxed announcement, offer, or event that can be published to the website and connected Facebook/Instagram channels. Use for "we're running a sale this week" or "come to our event Saturday."
- **create_blog_post** — long-form narrative/story content on the site's own blog. Use for "write about our history" or "announce our new location" as a story, not an action.
- **create_product** — a permanent thing the business sells, with its own page: a dish, a class, a package, a tour. What a customer buys is a variant, so give it at least one variant with a price. Booking is a capability a Product gains rather than a different kind of row, so a class and a dish are created the same way. Use it for "we want a dedicated page for X" when X is something people buy or book.
If a request is ambiguous, ask a brief clarifying question rather than guessing.

## Session start
Start every conversation by calling get_workspace_context. If no active site is set yet, call list_sites to discover the user's sites and present them clearly.
- If they have no sites, explain that site and location setup must be completed in the KrabiClaw CMS before content can be managed here.
- Present available sites and wait for the user to select one, even when only one is available. Then call set_workspace_context with that explicit selection.
- Creating, copying, or deleting sites and locations is managed in the CMS. Do not attempt these operations through other tools.

## Workspace context
- Use set_workspace_context whenever the user chooses a site or location.
- Use get_workspace_context whenever you need to confirm the active organization/site/location before mutating content.
- If a location-scoped action is requested and the active location is missing, call list_locations and then set_workspace_context with the chosen location_id.
- organization_id means the internal KrabiClaw site ID returned by get_workspace_context or list_sites, such as site-pottery-house. A public URL, hostname, custom domain, subdomain, slug, or site name is never a valid organization_id.
- If the user gives a public URL such as https://www.potteryhousekrabi.com/products/ceramics-painting-class, first call get_workspace_context or list_sites and match the URL to the returned site's public_url/domain context before calling site-scoped tools.

## Site confirmation policy — enforced before every mutation

Before calling any mutating tool, the active site must be confirmed for this conversation.

A site is confirmed when the user explicitly selects it from get_workspace_context or list_sites in this conversation. If no site exists, direct the user to the CMS for setup before making mutations.

Tool categories:
- **Read-only** (list_*, get_*) — safe to call once list_sites returns
- **Mutating** (set_*, update_*, create_*, delete_*, publish_*) — require a confirmed site

If the user asks you to mutate content before a site is confirmed, call list_sites first, confirm the active site, then proceed.

After applying, always confirm: "[Placement] updated for [site name]." — never leave the target ambiguous.

When a public-facing tool result includes \`view_url\` or \`public_url\`, include that URL in your reply so the user can open the live page immediately. Prefer \`view_url\` when both are present.

All other tools require a organization_id obtained from get_workspace_context or list_sites. Never guess, invent, derive, or pass through site IDs from URLs/domains.

For every paginated read, keep calling the same tool with page_info.next_cursor (or the resource-specific next_cursor field) until has_more is false before claiming the collection is complete. batch_create_products and reconcile_products are atomic: read every list_location_products page, then send one complete intended create or reconciliation call with an explicit location_id. Never split one logical Product replacement across multiple mutation calls. A Product belongs to the organization: set_product_publication says which sites carry it, set_product_location says where it is offered, and what a customer buys is a variant, so prices belong to variants. Grouping is a collection — read list_collections, create missing ones with create_collection, and send the complete intended membership and order with set_collection_products; reorder_collections takes every collection ID at the site exactly once. Collection names are localized separately through put_resource_localization with resource_type collection and values { name }.

Common workflows: manage a site's Products and the collections that group them, create and publish site posts, triage contact, reservation and booking submissions, update page content directly, upload media, list reviews (replies are managed in Google, not here), and generate or replace images for any content section. Manual locale management is available through the locale tools. Domain setup and Google Places lookup are CMS-only. Social publishing is available only when explicitly enabled; otherwise direct the user to the dashboard.`;

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
    const siteCtx = organizationId ? await getVisibleOrganizationContext(event, organizationId) : null;

    const visibleSurfaceTools = visibleConversationalMcpTools(MCP_PUBLIC_TOOLS, cfEnv);

    const entitlementKeys = siteCtx
      ? [...new Set(visibleSurfaceTools.map((t) => t.requiredEntitlement).filter(Boolean) as string[])]
      : [];
    const activeEntitlements = siteCtx
      ? await getActiveEntitlements(cfEnv, siteCtx.organizationId, entitlementKeys)
      : new Set<string>();

    // The role gate is the permission matrix now, so resolve it once per tool
    // before filtering rather than awaiting inside a sync predicate.
    const roleAllowsTool = new Map<string, boolean>()
    if (hasOrganizationIdParam && organizationId && siteCtx) {
      await Promise.all(visibleSurfaceTools.map(async (tool) => {
        roleAllowsTool.set(tool.name, await roleSatisfies(siteCtx.organizationId, siteCtx.role, tool.minimumRole))
      }))
    }

    const tools = visibleSurfaceTools.filter((tool) => {
      // Without a organization_id, return all tools so AI clients (e.g. ChatGPT) can discover
      // the full capability set on first connection. A supplied but inaccessible
      // site must fail closed instead of receiving the unscoped catalog.
      if (!hasOrganizationIdParam) return true;
      if (!organizationId) return false;
      if (!siteCtx) return false;
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
      organizationId: siteCtx?.organizationId ?? null,  userId: mcpUser.userId, requestId: null, method: "tools/list", result: { count: tools.length, domains }, status: "success", httpStatus: 200, oauthClientId: mcpUser.oauthClientId ?? null, });

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
    const structuredContextSiteId = structuredContent && typeof structuredContent === "object" && "context" in structuredContent
      ? (structuredContent.context as Record<string, unknown>)?.organization_id
      : null;
    const metaContextSiteId = isRender && result.privateMeta?.context && typeof result.privateMeta.context === "object"
      ? (result.privateMeta.context as Record<string, unknown>)?.organization_id
      : null;
    const ctxSiteId = typeof structuredContextSiteId === "string" ? structuredContextSiteId : metaContextSiteId;
    const resolvedSiteId = typeof ctxSiteId === "string"
      ? ctxSiteId.trim()
      : typeof rawArgs.organization_id === "string" ? rawArgs.organization_id.trim() : null;

    logMcpEventDetached(event, cfEnv.DB, {
      userId: mcpUser.userId, organizationId: mcpUser.activeOrganizationId ?? null,  requestId: null, method: "tools/call", toolName, toolDomain: toolDef?.domain ?? null, isMutating: isMcpMutatingTool(toolDef), arguments: rawArgs, result: structuredContent, status: "success", httpStatus: 200, oauthClientId: mcpUser.oauthClientId ?? null, durationMs: Date.now() - toolStartedAt, });

    // After any mutating tool call, purge KV HTML cache for the site so the
    // next browser load gets fresh SSR HTML with the correct /_nuxt/ asset hashes.
    // Fire-and-forget — never block the MCP response on cache ops.
    if (isMcpMutatingTool(toolDef)) {
      const organizationId = resolvedSiteId;
      if (organizationId) {
        const env = cloudflareEnv(event);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const kv = (env as any).SITE_CACHE as KVNamespace | undefined;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = (env as any).DB as D1Database | undefined;
        if (kv) {
          // Public resource cache is keyed by organizationId directly (not hostname), so no
          // domain lookup is needed here — unlike the HTML purge below.
          // Awaited inline (not waitUntil) so the MCP response never returns
          // before the stale public resource entry is cleared — otherwise a client
          // that reads public resources immediately after this mutation could still
          // see stale data.
          const cacheStartedAt = performance.now();
          try {
            await purgePublicResourceCacheSafe({
              DB: env.db,
              SITE_CACHE: kv,
              NUXT_PUBLIC_FREE_SITE_DOMAIN: env.NUXT_PUBLIC_FREE_SITE_DOMAIN,
            }, organizationId);
          } catch (err: unknown) {
            console.warn("[mcp-cache-purge] public resource purge failed:", String(err));
          } finally {
            recordRequestPhase(event, "mcp_cache_purge", cacheStartedAt);
          }
        }
        if (kv && db) {
          // Look up all active hostnames for this site (subdomain + custom domains)
          const purgeAsync = queryAll<{ domain: string }>(
            db, `SELECT domain FROM organization_domains
                 WHERE organization_id = ? AND status = 'active'
                 LIMIT 20`, [organizationId], )
            .then((results) => {
              const hostnames = (results ?? []).map((r) => r.domain);
              if (hostnames.length > 0) return purgeSiteKvCache(kv, hostnames);
            })
            .catch((err: unknown) => {
              console.warn("[mcp-cache-purge] failed:", String(err));
            });
          // Use Cloudflare's waitUntil when available so the purge
          // can outlive the response; fall back to a detached promise.
          const waitUntil = getCloudflareWaitUntil(event);
          if (waitUntil) waitUntil(purgeAsync);
          // purgeAsync already runs detached whether or not waitUntil is available
        }
      }
    }
    // The write above queued "this site changed"; drain it now so the site's
    // search index follows the tool call, the way a dashboard write's does.
    if (isMcpMutatingTool(toolDef) && resolvedSiteId) {
      const env = cloudflareEnv(event);
      const kv = env.SITE_CACHE;
      const db = env.db ?? (env.DB ? createDb(env.DB) : null);
      if (kv && db) {
        const drained = drainPublicResourceCacheInvalidations(db, kv, env, { organizationId: resolvedSiteId, limit: 100 })
          .catch((error: unknown) => console.warn(`[ai-search] site change drain failed after tenant MCP ${toolName}: ${String(error)}`));
        const waitUntil = getCloudflareWaitUntil(event);
        if (waitUntil) waitUntil(drained);
      }
    }

    return {
      isError: false, structuredContent, content: [{ type: "text", text: modelText }],
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
