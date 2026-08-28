import { HTTPError, defineHandler  } from 'nitro';
import { readBody, setResponseHeader } from 'nitro/h3';
import type { H3Event } from "nitro";
import { asMcpError, mcpSuccess, MCP_ERROR, negotiatedMcpProtocolVersion, parseMcpToolCallArguments, readMcpRequest, } from "~/server/utils/mcp-protocol";
import { catalogFingerprint, catalogMeta } from "~/server/utils/mcp-catalog";
import { mcpHttpStatusForError } from "~/server/utils/mcp-http-response";
import { executeMcpToolCall } from "~/server/utils/mcp-executor";
import { isMcpRenderResponse } from "~/server/utils/mcp-render";
import {
  getActiveEntitlements, getVisibleSiteContext, requireMcpUser, roleSatisfies, } from "~/server/utils/mcp-auth";
import { MCP_PUBLIC_TOOLS, MCP_TOOLS } from "~/server/utils/mcp-tools";
import { MCP_PROMPTS, renderMcpPrompt } from "~/server/utils/mcp-prompts";
import { cloudflareEnv } from "~/server/utils/api-response";
import { queryAll } from "~/server/db";
import { purgeSiteKvCache } from "~/server/utils/edge-cache";
import { purgePublicResourceCacheSafe } from "~/server/utils/public-resource-cache";
import { schedulePlatformKnowledgeIndexRebuild } from "~/server/utils/platform-search-rebuild";
import {
  assertConversationalToolEnabled, filterConversationalTools, normalizeMcpToolForConversationalSurface, } from "~/server/utils/conversational-tool-surface";
import {
  dispatchStandardMcpMethod, respondToMcpError, resolveMissingMcpCredential, unsupportedMcpMethodError, type McpToolMeta, } from "~/server/utils/mcp-runtime";
import { getCloudflareWaitUntil, isMcpMutatingTool } from "~/server/utils/mcp-route-helpers";
import { logMcpToolCallEvent } from "~/server/utils/mcp-telemetry";
import { describeErrorForTelemetry } from "~/server/utils/error-telemetry";
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

function safeMcpEnvelopeDetails(event: H3Event, body: unknown) {
  const record = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : null;
  const params = record?.params && typeof record.params === "object" && !Array.isArray(record.params)
    ? record.params as Record<string, unknown>
    : null;
  const meta = record?._meta && typeof record._meta === "object" && !Array.isArray(record._meta)
    ? record._meta as Record<string, unknown>
    : null;
  return {
    ray_id: (event.req.headers.get("cf-ray")) ?? null, user_agent: (event.req.headers.get("user-agent")) ?? null, content_type: (event.req.headers.get("content-type")) ?? null, content_length: (event.req.headers.get("content-length")) ?? null, body_kind: body === null ? "null" : Array.isArray(body) ? "array" : typeof body, envelope_keys: record ? Object.keys(record).sort() : [], params_keys: params ? Object.keys(params).sort() : [], meta_keys: meta ? Object.keys(meta).sort() : [], has_id: Boolean(record && Object.hasOwn(record, "id")), jsonrpc_type: typeof record?.jsonrpc, method_type: typeof record?.method, header_method: (event.req.headers.get("mcp-method")) ?? null, has_header_version: Boolean((event.req.headers.get("mcp-protocol-version"))), has_header_name: Boolean((event.req.headers.get("mcp-name"))), };
}

export default defineHandler(async (event) => {
  const requestStartedAt = Date.now();
  let requestId: string | number | null | undefined;
  let requestMethod: string | undefined;
  let requestToolName: string | undefined;
  let requestToolArgs: Record<string, unknown> | undefined;
  let requestEnvelope: ReturnType<typeof safeMcpEnvelopeDetails> | null = null;
  const cfEnv = cloudflareEnv(event);
  const baseUrl = cfEnv.BETTER_AUTH_URL?.replace(/\/$/, "");
  if (!baseUrl) throw new HTTPError({ statusCode: 500, statusMessage: "BETTER_AUTH_URL is required" });
  const tenantAuthOptions = {
    audiences: [`${baseUrl}/api/mcp`], requiredScopes: ["tenant"], };
  const runtimeDeps = {
    authOptions: tenantAuthOptions, resourceMetadataUrl, authDescription: TENANT_AUTH_DESCRIPTION, authRequiredText: TENANT_AUTH_REQUIRED_TEXT, logEvent: (evt: typeof event, fields: Record<string, unknown>) =>
      logMcpEventDetached(evt, cfEnv.DB, fields as unknown as Parameters<typeof logMcpToolCallEvent>[1]), resolveToolMeta: resolveTenantToolMeta, };
  try {
    // Return 401 with WWW-Authenticate before any protocol parsing so OAuth
    // clients (e.g. ChatGPT) can discover the authorization server on first touch.
    // Session-cookie requests (dashboard, E2E tests) have a Cookie header and skip this.
    const missingCredential = await resolveMissingMcpCredential(event, runtimeDeps, baseUrl);
    if (missingCredential.handled) {
      requestId = missingCredential.requestId;
      requestMethod = missingCredential.requestMethod;
      requestToolName = missingCredential.requestToolName;
      console.warn("[MCP_AUTH]", JSON.stringify({
        event: "credential_missing", ray_id: (event.req.headers.get("cf-ray")) ?? null, user_agent: (event.req.headers.get("user-agent")) ?? null, mcp_method: requestMethod ?? null, tool_name: requestToolName ?? null, }));
      return missingCredential.response;
    }

    const body = await readBody(event);
    requestEnvelope = safeMcpEnvelopeDetails(event, body);

    const request = readMcpRequest(event, body);
    requestId = request.id;
    requestMethod = request.method;
    requestToolName = request.method === "tools/call"
      && typeof request.params?.name === "string"
      ? request.params.name
      : undefined;

    if (import.meta.dev) {
      event.runtime?.node?.res?.once("finish", () => {
        console.info("[MCP_REQUEST]", JSON.stringify({
          method: requestMethod ?? null, request_id: requestId ?? null, status: event.runtime?.node?.res?.statusCode, duration_ms: Date.now() - requestStartedAt, content_length: event.runtime?.node?.res?.getHeader("content-length") ?? null, ray_id: (event.req.headers.get("cf-ray")) ?? null, user_agent: (event.req.headers.get("user-agent")) ?? null, }));
      });
    }

    // MCP protocol handshake — required before any tools/list or tools/call
    if (request.method === "initialize") {
      const user = await requireMcpUser(event, tenantAuthOptions);
      const protocolVersion = negotiatedMcpProtocolVersion(request);
      const sessionId = crypto.randomUUID();
      setResponseHeader(event, "Mcp-Session-Id", sessionId);
      logMcpEventDetached(event, cfEnv.DB, {
        userId: user.userId, requestId: request.id, method: request.method, status: "success", httpStatus: 200, protocolVersion, sessionId, oauthClientId: user.oauthClientId ?? null, });
      return mcpSuccess(request.id, {
        protocolVersion, capabilities: { tools: {}, resources: {}, prompts: {} }, serverInfo: { name: "krabiclaw-mcp", version: "phase-5" }, _meta: catalogMeta(MCP_PUBLIC_TOOLS), instructions: `KrabiClaw — manage your restaurant or business website through this connection.

## Image work — applies at any point in the conversation
Whenever an image is needed (hero, logo, post thumbnail, Product photo, experience cover, story image, or any content section):

**AI-generated (user asks you to generate or create an image):**
1. Call resolve_agent_guidance({ site_id, task: "image.generate" }) and use every returned skill document separately.
2. Prepare the exact image brief and call review_agent_guidance_candidate({ site_id, task: "image.generate", candidate_type: "image_brief", candidate: <brief> }). Revise the brief when the review recommends it.
3. Call image_generation natively with model gpt-image-1 or gpt-image-2 and the reviewed prompt tailored to the business.
4. Immediately call save_generated_image_file({ site_id, attachment_id: <file reference from image_generation_call>, prompt }). Pass the file reference — never extract or forward the base64 from image_generation_call.result, that will be blocked by safety checks.
5. Call show_generated_images with the asset_id and public_url returned by save_generated_image_file.
6. After the user approves, assign with set_media using placement { owner_type, owner_id, slot } and the exact owner id returned by a read tool.
7. If the user wants changes, revise the brief and repeat from step 2 so review_agent_guidance_candidate approves every changed image brief before image_generation or saving.

For multi-item requests, repeat the complete flow once per item. Generate one standalone image for each target and never substitute a collage, contact sheet, website screenshot, or UI mockup. For Products, each show_generated_images and set_media call must include that Product's exact id; use slot image for the explicit primary and gallery for the ordered detail gallery. Finish every requested item before reporting completion.

This entire flow runs within the current conversation — do not tell the user to leave the app or use a different context.

**User-uploaded (user provides their own photo):**
1. Ask the user to attach the photo directly in ChatGPT if they have not already done so. Do not send users to the KrabiClaw dashboard/media uploader for photos from this MCP app.
2. When the user has attached an image in ChatGPT, inspect it visually first. Do not upload or mutate anything yet.
3. If the intended use is obvious, describe it briefly and ask the user to confirm the target site, the target placement, and that the attached image should be used.
4. Do not upload media, assign an image, publish, or overwrite anything until the user explicitly confirms.
5. After confirmation, call upload_user_media({ site_id, file: <resolved ChatGPT file reference for the attachment>, category, description }). This is the only tool for a user-provided photo — there is no separate "open upload" tool for images.
6. The file argument is the only contract. Pass the ChatGPT attachment through the file field and let the host rewrite it into an authorized file reference for KrabiClaw. Do not pass a bare file_id, fabricate download URLs, wrap fake file objects, or suggest an in-app photo uploader. If attachment delivery fails, stop and ask the user to attach it again; do not try a second transport.
7. After upload_user_media returns asset_id/public_url, call set_media with asset_id for a single-value placement. For an ordered placement, call attach_media for each new asset and reorder_media only when needed.
8. Reply with the exact site, placement, asset_id, and public_url that were updated.

**Videos:**
- Ask the user to attach the video directly in ChatGPT with the paperclip.
- Every video requires a poster image. Ask the user to attach one before uploading the video.
- Call upload_user_media({ site_id, file: <resolved video reference>, poster_file: <resolved poster image reference>, category, description }) for every video upload.
- Never call or mention upload widget tools. No tool whose name starts with "open_" and contains "upload" exists in this connector.
- After upload_user_media returns asset_id/public_url, use the exact owner id from a read tool. Call set_media with asset_id for a single cover/hero/logo; call attach_media for a gallery or document list and reorder_media only when needed.

## Choosing a content type
KrabiClaw has three distinct content-creation tools — do not default to whichever one comes to mind first. Ask yourself whether the request is time-boxed, narrative, or a permanent offering:
- **create_post** — a time-boxed announcement, offer, or event that can be published to the website and connected Facebook/Instagram channels. Use for "we're running a sale this week" or "come to our event Saturday."
- **create_blog_post** — long-form narrative/story content on the site's own blog. Use for "write about our history" or "announce our new location" as a story, not an action.
- **create_experience** — a permanent, bookable offering with its own page: a class, package, tour, or group/custom-booking option that needs pricing/availability and a Reserve Now (or Contact Us, if left priceless) CTA. Use for "we want a dedicated page for X" when X is something people book or inquire about, even if there's no fixed price yet — leave price/price_amount unset for a "contact us for pricing" experience rather than writing a post or blog entry about it.
If a request is ambiguous, ask a brief clarifying question rather than guessing.

For create_blog_post, update_blog_post, or replace_blog_content, call resolve_agent_guidance({ site_id, task: "blog.write" }) before composing and review_agent_guidance_candidate({ site_id, task: "blog.write", candidate_type: "blog_article", candidate: <exact approved article> }) before writing newly generated or materially rewritten content. Skill guidance is advisory and scoped; tool schemas, authorization, publication approval, and content_blocks remain enforced by backend code.

## Session start
Start every conversation by calling get_workspace_context. If no active site is set yet, call list_sites to discover the user's sites and present them clearly.
- If they have 0 sites, start the Onboarding Flow:
  1. Ask for their Google Maps URL (or shortlink) to import their business details.
  2. Call import_from_maps.
  3. After import, ask for Required missing context: "What should the main button say (e.g., Book Now)?" and ask if they want to upload a Hero Image or have AI generate one. Follow the Image work rules above.
  4. Ask for Optional context: "What's the short story behind your business?" and "Do you have a logo to upload?" (let them skip these).
  5. DO NOT ask for Products, detailed services, or social links yet (defer until the site is live).
  6. Call create_site and create_location, then show_site_preview.
- If they have exactly one site, treat it as confirmed automatically. Say "Working with [site name]." in your first reply before doing anything else, then call set_workspace_context so later tool calls can omit the site_id.
- If they have multiple sites, present them clearly and wait for the user to select one — do not assume or guess.

## Workspace context
- Use set_workspace_context whenever the user chooses a site or location.
- Use get_workspace_context whenever you need to confirm the active organization/site/location before mutating content.
- If a location-scoped action is requested and the active location is missing, call list_locations and then set_workspace_context with the chosen location_id.
- site_id means the internal KrabiClaw site ID returned by get_workspace_context, list_sites, or create_site, such as site-pottery-house. A public URL, hostname, custom domain, subdomain, slug, or site name is never a valid site_id.
- If the user gives a public URL such as https://www.potteryhousekrabi.com/experiences/ceramics-painting-class, first call get_workspace_context or list_sites and match the URL to the returned site's public_url/domain context before calling site-scoped tools.

## Site confirmation policy — enforced before every mutation

Before calling any mutating tool, the active site must be confirmed for this conversation.

A site is confirmed when:
- 0 sites: onboarding completed and create_site succeeded
- 1 site: you have said "Working with [site name]." in this conversation (confirmed automatically)
- Multiple sites: the user explicitly chose one from the list_sites result

Tool categories:
- **Read-only** (list_*, get_*, show_*) — safe to call once list_sites returns
- **Preview/generate** (generate_*, show_generated_images) — require a confirmed site
- **Mutating** (set_*, update_*, create_*, delete_*, publish_*) — require a confirmed site

If the user asks you to mutate content before a site is confirmed, call list_sites first, confirm the active site, then proceed.

When calling show_generated_images after native image_generation, always include the active site name in the labels:
- use_label: "Use as homepage hero for [site name]"  (or the appropriate placement)
- subtitle: can reference the site name to make the target obvious
After applying, always confirm: "[Placement] updated for [site name]." — never leave the target ambiguous.

When a public-facing tool result includes \`view_url\` or \`public_url\`, include that URL in your reply so the user can open the live page immediately. Prefer \`view_url\` when both are present.

All other tools require a site_id obtained from get_workspace_context, list_sites, or create_site. Never guess, invent, derive, or pass through site IDs from URLs/domains. Use get_current_user when the user asks which account is connected.

For every paginated read, keep calling the same tool with page_info.next_cursor (or the resource-specific next_cursor field) until has_more is false before claiming the collection is complete. Product batch and sync tools are atomic: read every list_location_products page, then send one complete intended create or reconciliation call with an explicit location_id. Never split one logical Product replacement across multiple mutation calls.

Common workflows: manage location-scoped Products, create and publish site posts, triage contact and reservation submissions, update page content directly, upload media, reply to reviews, manage experiences and bookings, and generate or replace images for any content section. Manual locale management is available through the locale tools. Social publishing, domains, and priority-support requests are shown only when connector eligibility enables them; otherwise direct the user to the dashboard.`, });
    }

    const standardResponse = await dispatchStandardMcpMethod(event, request, runtimeDeps, {
      resources: {
        list: [], read: (uri: string) => {
          throw mcpProtocolError(MCP_ERROR.invalidParams, `Unknown MCP app resource: ${uri}`);
        }, }, prompts: { list: MCP_PROMPTS, render: renderMcpPrompt }, discover: {
        serverName: "krabiclaw-mcp", serverVersion: "phase-5", instructions:
          "KrabiClaw MCP. Call get_workspace_context at the start of every conversation. site_id must be an internal id from get_workspace_context/list_sites/create_site, never a URL/domain/subdomain/name. Native ChatGPT attachments upload only through upload_user_media; never call stale open_*upload widget tools. If no active site is set yet, call list_sites, let the user choose, then persist it with set_workspace_context before mutating tools.", }, });
    if (standardResponse !== undefined) return standardResponse;

    if (request.method === "tools/list") {
      const user = await requireMcpUser(event, tenantAuthOptions);
      const hasSiteIdParam = Object.prototype.hasOwnProperty.call(
        request.params ?? {}, "site_id", );
      const siteId =
        typeof request.params?.site_id === "string"
          ? request.params.site_id.trim()
          : null;
      const siteCtx = siteId
        ? await getVisibleSiteContext(event, siteId)
        : null;

      const visibleSurfaceTools = filterConversationalTools(MCP_PUBLIC_TOOLS, cfEnv)
        .map((tool) => normalizeMcpToolForConversationalSurface(tool, cfEnv));

      const entitlementKeys = siteCtx
        ? [
            ...new Set(
              visibleSurfaceTools.map((t) => t.requiredEntitlement).filter(
                Boolean, ) as string[], ), ]
        : [];
      const activeEntitlements = siteCtx
        ? await getActiveEntitlements(
            user.db, siteCtx.organizationId, entitlementKeys, siteCtx.siteId, )
        : new Set<string>();

      const tools = visibleSurfaceTools.filter((tool) => {
        // Without a site_id, return all tools so AI clients (e.g. ChatGPT) can discover
        // the full capability set on first connection. A supplied but inaccessible
        // site must fail closed instead of receiving the unscoped catalog.
        if (!hasSiteIdParam) return true;
        if (!siteId) return false;
        if (!siteCtx) return false;
        if (!roleSatisfies(siteCtx.role, tool.minimumRole)) return false;
        if (
          tool.requiredEntitlement &&
          !activeEntitlements.has(tool.requiredEntitlement)
        )
          return false;
        return true;
      }).map((tool) => {
        const baseTool = {
          name: tool.name, description: tool.description, inputSchema: tool.inputSchema, _meta: {
            securitySchemes: tool.securitySchemes, "krabiclaw/toolInfo": {
              domain: tool.domain, minimumRole: tool.minimumRole, confirmRequired: tool.confirmRequired, }, ...(tool.fileParams?.length
              ? { "openai/fileParams": tool.fileParams }
              : {}), }, }

        return {
          ...baseTool, outputSchema: tool.outputSchema, annotations: tool.annotations, securitySchemes: tool.securitySchemes, }
      });

      const domains = [...new Set(tools.map((tool) => tool._meta["krabiclaw/toolInfo"].domain))]
      logMcpEventDetached(event, cfEnv.DB, {
        organizationId: siteCtx?.organizationId ?? null, siteId: siteCtx?.siteId ?? null, userId: user.userId, requestId: request.id, method: request.method, result: { count: tools.length, domains }, status: "success", httpStatus: 200, oauthClientId: user.oauthClientId ?? null, });

      return mcpSuccess(request.id, { tools, _meta: catalogMeta(MCP_PUBLIC_TOOLS) });
    }

    if (request.method === "tools/call") {
      const toolName =
        typeof request.params?.name === "string" ? request.params.name : "";
      const rawArgs = parseMcpToolCallArguments(request.params);
      requestToolArgs = rawArgs;

      const toolDef = MCP_TOOLS.find((t) => t.name === toolName);
      const toolStartedAt = Date.now();

      const mcpUser = await requireMcpUser(event, tenantAuthOptions);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let result: any;
      try {
        assertConversationalToolEnabled(toolName, cfEnv as ApiRecord);
        result = await executeMcpToolCall(event, toolName, rawArgs, mcpUser);
      } catch (toolError) {
        const mcpErr = asMcpError(toolError);
        if (mcpErr.kind === "protocol") {
          const telemetryErrorMessage = describeErrorForTelemetry(toolError);
          logMcpEventDetached(event, cfEnv.DB, {
            userId: mcpUser.userId, organizationId: mcpUser.activeOrganizationId ?? null, siteId: null, requestId: request.id, method: request.method, toolName, toolDomain: toolDef?.domain ?? null, isMutating: false, arguments: rawArgs, status: "error", errorCode: mcpErr.code, errorMessage: telemetryErrorMessage, httpStatus: 200, jsonrpcErrorCode: mcpErr.code, jsonrpcErrorMessage: telemetryErrorMessage, unknownToolName: toolName || null, oauthClientId: mcpUser.oauthClientId ?? null, durationMs: Date.now() - toolStartedAt, });
          return sendMcpErrorResponse(event, { id: request.id, error: mcpErr });
        }
        logMcpEventDetached(event, cfEnv.DB, {
          userId: mcpUser.userId, organizationId: mcpUser.activeOrganizationId ?? null, siteId: null, requestId: request.id, method: request.method, toolName, toolDomain: toolDef?.domain ?? null, isMutating: isMcpMutatingTool(toolDef), arguments: rawArgs, status: "error", errorCode: mcpErr.code, errorMessage: describeErrorForTelemetry(toolError), httpStatus: 200, oauthClientId: mcpUser.oauthClientId ?? null, durationMs: Date.now() - toolStartedAt, });
        // Any other tool-execution failure (including a plain `throw new
        // Error(...)` from a business-rule guard, which asMcpError falls
        // back to classifying as kind:'transport') must still resolve as a
        // graceful isError:true 200, not a raw HTTP 500 — MCP clients can't
        // act on a transport-level error mid-tool-call any more than they
        // can act on a raw 401 (see resolveMissingMcpCredential). Confirmed
        // Tool business-rule failures must stay inside the MCP error envelope.
        return mcpSuccess(request.id, {
          isError: true, content: [{ type: "text", text: mcpErr.message }], });
      }

      const isRender = isMcpRenderResponse(result);
      const structuredContent = isRender ? result.structuredContent : result;
      const modelText = isRender && result.modelText
        ? result.modelText
        : JSON.stringify(structuredContent, null, 2);

      // Resolved once and reused for both telemetry and the cache-purge below.
      const structuredContextSiteId = structuredContent && typeof structuredContent === 'object' && 'context' in structuredContent
        ? (structuredContent.context as Record<string, unknown>)?.site_id
        : null;
      const metaContextSiteId = isRender && result.privateMeta?.context && typeof result.privateMeta.context === 'object'
        ? (result.privateMeta.context as Record<string, unknown>)?.site_id
        : null;
      const ctxSiteId = typeof structuredContextSiteId === 'string'
        ? structuredContextSiteId
        : metaContextSiteId;
      const resolvedSiteId = typeof ctxSiteId === "string"
        ? ctxSiteId.trim()
        : typeof rawArgs.site_id === "string"
          ? rawArgs.site_id.trim()
          : null;

      logMcpEventDetached(event, cfEnv.DB, {
        userId: mcpUser.userId, organizationId: mcpUser.activeOrganizationId ?? null, siteId: resolvedSiteId, requestId: request.id, method: request.method, toolName, toolDomain: toolDef?.domain ?? null, isMutating: isMcpMutatingTool(toolDef), arguments: rawArgs, result: structuredContent, status: "success", httpStatus: 200, oauthClientId: mcpUser.oauthClientId ?? null, durationMs: Date.now() - toolStartedAt, });

      // After any mutating tool call, purge KV HTML cache for the site so the
      // next browser load gets fresh SSR HTML with the correct /_nuxt/ asset hashes.
      // Fire-and-forget — never block the MCP response on cache ops.
      if (isMcpMutatingTool(toolDef)) {
        const siteId = resolvedSiteId;
        if (siteId) {
          const env = cloudflareEnv(event);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const kv = (env as any).SITE_CACHE as KVNamespace | undefined;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const db = (env as any).DB as D1Database | undefined;
          if (kv) {
            // Public resource cache is keyed by siteId directly (not hostname), so no
            // domain lookup is needed here — unlike the HTML purge below.
            // Awaited inline (not waitUntil) so the MCP response never returns
            // before the stale public resource entry is cleared — otherwise a client
            // that reads public resources immediately after this mutation could still
            // see stale data.
            try {
              await purgePublicResourceCacheSafe({
                DB: env.db,
                SITE_CACHE: kv,
                NUXT_PUBLIC_FREE_SITE_DOMAIN: env.NUXT_PUBLIC_FREE_SITE_DOMAIN,
              }, siteId)
            } catch (err: unknown) {
              console.warn("[mcp-cache-purge] public resource purge failed:", String(err))
            }
          }
          if (kv && db) {
            // Look up all active hostnames for this site (subdomain + custom domains)
            const purgeAsync = queryAll<{ domain: string }>(
              db, `SELECT domain FROM site_domains
                 WHERE site_id = ? AND status = 'active'
                 LIMIT 20`, [siteId], )
              .then((results) => {
                const hostnames = (results ?? []).map((r) => r.domain)
                if (hostnames.length > 0) {
                  return purgeSiteKvCache(kv, hostnames)
                }
              })
              .catch((err: unknown) => {
                console.warn("[mcp-cache-purge] failed:", String(err))
              })
            // Use Cloudflare's waitUntil when available so the purge
            // can outlive the response; fall back to a detached promise.
            const waitUntil = getCloudflareWaitUntil(event)
            if (waitUntil) {
              waitUntil(purgeAsync)
            }
            // purgeAsync already runs detached whether or not waitUntil is available
          }
        }
      }
      if (toolDef?.domain === "blog" && isMcpMutatingTool(toolDef)) {
        const env = cloudflareEnv(event);
        schedulePlatformKnowledgeIndexRebuild(event, env, `tenant MCP ${toolName}`);
      }

      return mcpSuccess(request.id, {
        isError: false, structuredContent, content: [
          { type: "text", text: modelText }, ], ...(isRender && result.privateMeta
          ? {
              _meta: result.privateMeta, }
          : {}), });
    }

    throw unsupportedMcpMethodError(request.method);
  } catch (error) {
    const mcpError = asMcpError(error);
    const toolCallPermissionError = requestMethod === "tools/call" && mcpError.kind === "forbidden";
    const mappedStatus = toolCallPermissionError ? 200 : mcpHttpStatusForError(mcpError);
    console.error("[MCP_ERROR]", JSON.stringify({
      status: mappedStatus, code: mcpError.code, message: mcpError.message, method: requestMethod ?? null, tool: requestToolName ?? null, request_id: requestId ?? null, ...(mcpError.code === MCP_ERROR.invalidRequest || mcpError.code === MCP_ERROR.invalidParams ? { envelope: requestEnvelope ?? safeMcpEnvelopeDetails(event, undefined) } : {}), }));
    if (mappedStatus >= 500 && error instanceof Error) console.error(error.stack ?? error.message);
    return respondToMcpError(event, error, {
      requestId, requestMethod, requestToolName, requestToolArgs, baseUrl, ...runtimeDeps, });
  }
});
