import { createError, getHeader } from "h3";
import {
  asMcpError,
  mcpFailure,
  mcpSuccess,
  MCP_ERROR,
  MCP_PROTOCOL_VERSION,
  readMcpRequest,
} from "~/server/utils/mcp-protocol";
import { executeMcpToolCall } from "~/server/utils/mcp-executor";
import { isMcpRenderResponse } from "~/server/utils/mcp-render";
import {
  getActiveEntitlements,
  getVisibleSiteContext,
  requireMcpUser,
  roleSatisfies,
} from "~/server/utils/mcp-auth";
import { MCP_TOOLS } from "~/server/utils/mcp-tools";
import { MCP_PROMPTS, renderMcpPrompt } from "~/server/utils/mcp-prompts";
import { MCP_APP_RESOURCES, readMcpAppResource } from "~/server/utils/mcp-widgets";
import { cloudflareEnv } from "~/server/utils/api-response";
import { queryAll } from "~/server/db";
import { purgeSiteKvCache } from "~/server/utils/edge-cache";
import { purgeBootstrapCache } from "~/server/utils/bootstrap-cache";
import {
  assertConversationalToolEnabled,
  filterConversationalTools,
  normalizeMcpToolForConversationalSurface,
} from "~/server/utils/conversational-tool-surface";
import {
  buildMcpAuthChallengeForError,
  buildMcpOAuthChallenge,
  getCloudflareWaitUntil,
  isMcpMutatingTool,
  mcpAuthRequiredResult,
  setMcpAuthChallenge,
} from "~/server/utils/mcp-route-helpers";
import { logMcpToolCallEvent } from "~/server/utils/mcp-telemetry";

// Fires a telemetry write without ever blocking or failing the MCP response.
function logMcpEventDetached(
  event: Parameters<typeof getCloudflareWaitUntil>[0],
  db: D1Database | undefined,
  input: Parameters<typeof logMcpToolCallEvent>[1],
) {
  if (!db) return;
  const logPromise = logMcpToolCallEvent(db, input);
  const waitUntil = getCloudflareWaitUntil(event);
  if (waitUntil) waitUntil(logPromise);
  else logPromise.catch(() => {});
}

const TENANT_AUTH_DESCRIPTION = "Connect KrabiClaw to continue.";
const TENANT_AUTH_REQUIRED_TEXT = "Authentication required: connect KrabiClaw to continue.";

function resourceMetadataUrl(baseUrl: string) {
  return `${baseUrl}/.well-known/oauth-protected-resource`;
}

export default defineEventHandler(async (event) => {
  let requestId: string | number | null | undefined;
  let requestMethod: string | undefined;
  let requestToolName: string | undefined;
  try {
    // Return 401 with WWW-Authenticate before any protocol parsing so OAuth
    // clients (e.g. ChatGPT) can discover the authorization server on first touch.
    // Session-cookie requests (dashboard, E2E tests) have a Cookie header and skip this.
    const cfEnv = cloudflareEnv(event);
    const baseUrl = (
      cfEnv.BETTER_AUTH_URL ?? "https://krabiclaw.com"
    ).replace(/\/$/, "");
    const authChallenge = buildMcpOAuthChallenge({
      resourceMetadataUrl: resourceMetadataUrl(baseUrl),
      description: TENANT_AUTH_DESCRIPTION,
    });
    const tenantAuthOptions = {
      audiences: [`${baseUrl}/api/mcp`],
      requiredScopes: ["tenant"],
    };
    if (
      !getHeader(event, "authorization")?.startsWith("Bearer ") &&
      !getHeader(event, "cookie")
    ) {
      const body = await readBody(event);
      // Lenient extraction only — full validation happens after auth succeeds.
      // readMcpRequest would throw on discovery payloads missing version/method.
      const rawBody = body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : null;
      requestId = rawBody?.id as string | number | undefined;
      requestMethod = rawBody?.method as string | undefined;
      requestToolName = rawBody?.params && typeof rawBody.params === "object"
        && !Array.isArray(rawBody.params)
        && typeof (rawBody.params as Record<string, unknown>).name === "string"
        ? String((rawBody.params as Record<string, unknown>).name)
        : undefined;
      console.warn("[MCP_AUTH]", JSON.stringify({
        event: "credential_missing",
        ray_id: getHeader(event, "cf-ray") ?? null,
        user_agent: getHeader(event, "user-agent") ?? null,
        mcp_method: requestMethod ?? null,
        tool_name: requestToolName ?? null,
      }));
      if (requestMethod === "tools/call") {
        logMcpEventDetached(event, cfEnv.DB, {
          requestId: requestId ?? null,
          method: requestMethod,
          toolName: requestToolName ?? null,
          toolDomain: MCP_TOOLS.find((t) => t.name === requestToolName)?.domain ?? null,
          status: "auth_required",
          errorMessage: "Missing bearer token or cookie",
        });
        return mcpSuccess(requestId ?? null, mcpAuthRequiredResult({ challenge: authChallenge, message: TENANT_AUTH_REQUIRED_TEXT }));
      }
      setResponseStatus(event, 401);
      setMcpAuthChallenge(event, authChallenge);
      return mcpFailure(requestId ?? null, {
        code: MCP_ERROR.invalidRequest,
        message: "Authentication required.",
      });
    }

    const body = await readBody(event);

    // ChatGPT occasionally sends an empty-body health probe — ignore silently.
    if (!body || (typeof body === "object" && Object.keys(body).length === 0)) {
      setResponseStatus(event, 200);
      return "";
    }

    const request = readMcpRequest(event, body);
    requestId = request.id;
    requestMethod = request.method;
    requestToolName = request.method === "tools/call"
      && typeof request.params?.name === "string"
      ? request.params.name
      : undefined;

    // MCP protocol handshake — required before any tools/list or tools/call
    if (request.method === "initialize") {
      await requireMcpUser(event, tenantAuthOptions);
      return mcpSuccess(request.id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {}, resources: {}, prompts: {} },
        serverInfo: { name: "krabiclaw-mcp", version: "phase-5" },
        instructions: `KrabiClaw — manage your restaurant or business website through this connection.

## Image work — applies at any point in the conversation
Whenever an image is needed (hero, logo, post thumbnail, menu photo, experience cover, story image, or any content section):

**AI-generated (user asks you to generate or create an image):**
1. Call image_generation natively with model gpt-image-1 and a detailed prompt tailored to the business.
2. Immediately call save_generated_image_file({ site_id, attachment_id: <file reference from image_generation_call>, prompt }). Pass the file reference — never extract or forward the base64 from image_generation_call.result, that will be blocked by safety checks.
3. Call show_generated_images with the assetId and publicUrl returned by save_generated_image_file.
4. After the user approves, assign with the appropriate tool: set_home_hero_image, set_logo, set_about_story_image, set_home_story_image, set_location_hero_image, set_post_image, or set_experience_image.
5. If the user wants changes, call image_generation again with a revised prompt and repeat from step 2.

This entire flow runs within the current conversation — do not tell the user to leave the app or use a different context.

**User-uploaded (user provides their own photo):**
1. Ask the user to attach the photo directly in ChatGPT if they have not already done so. Do not send users to the KrabiClaw dashboard/media uploader for photos from this MCP app.
2. When the user has attached an image in ChatGPT, inspect it visually first. Do not upload or mutate anything yet.
3. If the intended use is obvious, describe it briefly and ask the user to confirm the target site, the target placement, and that the attached image should be used.
4. Do not upload media, assign an image, publish, or overwrite anything until the user explicitly confirms.
5. After confirmation, call upload_user_photo({ site_id, file: <attached local file argument>, category, description }). upload_user_media is the newer generic path (image or video) and is also acceptable here if you already have a resolved file reference.
6. The file argument is the primary contract. Pass the ChatGPT attachment through the file field and let the host rewrite it into an authorized file reference for KrabiClaw. Do not fabricate download URLs, wrap fake file objects, or suggest an in-app photo uploader.
7. After upload_user_photo returns assetId/publicUrl, call the appropriate assignment tool such as set_home_hero_image, set_logo, set_about_story_image, set_home_story_image, set_location_hero_image, set_post_image, or set_experience_image.
8. Reply with the exact site, placement, assetId, and publicUrl that were updated.

**Videos (and an alternative image path):**
- Call open_media_upload (or open_experience_media_upload when scoped to a specific experience) to launch the inline upload widget so the user can pick or drag a file without leaving the conversation. After it reports a completed upload, call the matching assignment tool (set_home_hero_video, set_location_hero_video, set_experience_video, etc.) with the returned assetId.
- If you already have a resolved ChatGPT file reference for a video (or an image), you can call upload_user_media directly instead of opening the widget.
- The dashboard media library remains a fallback only for chat clients that do not support inline widgets.

## Session start
Start every conversation by calling get_workspace_context. If no active site is set yet, call list_sites to discover the user's sites and present them clearly.
- If they have 0 sites, start the Onboarding Flow:
  1. Ask for their Google Maps URL (or shortlink) to import their business details.
  2. Call import_from_maps.
  3. After import, ask for Required missing context: "What should the main button say (e.g., Book Now)?" and ask if they want to upload a Hero Image or have AI generate one. Follow the Image work rules above.
  4. Ask for Optional context: "What's the short story behind your business?" and "Do you have a logo to upload?" (let them skip these).
  5. DO NOT ask for menus, detailed services, or social links yet (defer until the site is live).
  6. Call create_site and create_location, then show_site_preview.
- If they have exactly one site, treat it as confirmed automatically. Say "Working with [site name]." in your first reply before doing anything else, then call set_workspace_context so later tool calls can omit the site_id.
- If they have multiple sites, present them clearly and wait for the user to select one — do not assume or guess.

## Workspace context
- Use set_workspace_context whenever the user chooses a site or location.
- Use get_workspace_context whenever you need to confirm the active organization/site/location before mutating content.
- If a location-scoped action is requested and the active location is missing, call list_locations and then set_workspace_context with the chosen location_id.

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

All other tools require a site_id obtained from list_sites. Never guess or invent site IDs. Use get_current_user when the user asks which account is connected.

Common workflows: update menus and items, create and publish site posts, triage contact and reservation submissions, update page content directly, upload media, reply to reviews, manage experiences and bookings, and generate or replace images for any content section. Translations, social publishing, domains, and managed-service requests are available only when explicitly enabled for this connector; otherwise direct the user to the dashboard.`,
      });
    }

    // Client acknowledgement after initialize — spec requires 202 with no body
    if (request.method === "notifications/initialized") {
      setResponseStatus(event, 202);
      return "";
    }

    // Standard ping
    if (request.method === "ping") {
      return mcpSuccess(request.id, {});
    }

    if (request.method === "resources/list") {
      await requireMcpUser(event, tenantAuthOptions);
      return mcpSuccess(request.id, { resources: MCP_APP_RESOURCES });
    }

    if (request.method === "resources/templates/list") {
      await requireMcpUser(event, tenantAuthOptions);
      return mcpSuccess(request.id, { resourceTemplates: [] });
    }

    if (request.method === "resources/read") {
      await requireMcpUser(event, tenantAuthOptions);
      const uri =
        typeof request.params?.uri === "string" ? request.params.uri : "";
      const content = await readMcpAppResource(uri, baseUrl);
      return mcpSuccess(request.id, { contents: [content] });
    }

    if (request.method === "prompts/list") {
      await requireMcpUser(event, tenantAuthOptions);
      return mcpSuccess(request.id, { prompts: MCP_PROMPTS });
    }

    if (request.method === "prompts/get") {
      await requireMcpUser(event, tenantAuthOptions);
      const name =
        typeof request.params?.name === "string" ? request.params.name : "";
      const rawPromptArgs = request.params?.arguments;
      const promptArgs: Record<string, string> = {};
      if (
        rawPromptArgs &&
        typeof rawPromptArgs === "object" &&
        !Array.isArray(rawPromptArgs)
      ) {
        for (const [key, value] of Object.entries(
          rawPromptArgs as Record<string, unknown>,
        )) {
          if (typeof value === "string") promptArgs[key] = value;
        }
      }
      const rendered = renderMcpPrompt(name, promptArgs);
      return mcpSuccess(request.id, {
        description: rendered.description,
        messages: [
          { role: "user", content: { type: "text", text: rendered.text } },
        ],
      });
    }

    if (request.method === "server/discover") {
      await requireMcpUser(event, tenantAuthOptions);
      return mcpSuccess(request.id, {
        supportedVersions: [
          "2026-07-28",
          "2025-11-25",
          "2025-03-26",
          "2024-11-05",
        ],
        capabilities: { tools: {} },
        serverInfo: {
          name: "krabiclaw-mcp",
          version: "phase-5",
        },
        instructions:
          "KrabiClaw MCP. Call get_workspace_context at the start of every conversation. If no active site is set yet, call list_sites, let the user choose, then persist it with set_workspace_context before mutating tools.",
      });
    }

    if (request.method === "tools/list") {
      const user = await requireMcpUser(event, tenantAuthOptions);
      const siteId =
        typeof request.params?.site_id === "string"
          ? request.params.site_id
          : null;
      const siteCtx = siteId
        ? await getVisibleSiteContext(event, siteId)
        : null;

      const visibleSurfaceTools = filterConversationalTools(MCP_TOOLS, cfEnv)
        .map((tool) => normalizeMcpToolForConversationalSurface(tool, cfEnv));

      const entitlementKeys = siteCtx
        ? [
            ...new Set(
              visibleSurfaceTools.map((t) => t.requiredEntitlement).filter(
                Boolean,
              ) as string[],
            ),
          ]
        : [];
      const activeEntitlements = siteCtx
        ? await getActiveEntitlements(
            user.db,
            siteCtx.organizationId,
            entitlementKeys,
            siteCtx.siteId,
          )
        : new Set<string>();

      const tools = visibleSurfaceTools.filter((tool) => {
        // Without a site_id, return all tools so AI clients (e.g. ChatGPT) can discover
        // the full capability set on first connection. Security is enforced at execution time.
        if (!siteId || !siteCtx) return true;
        if (!roleSatisfies(siteCtx.role, tool.minimumRole)) return false;
        if (
          tool.requiredEntitlement &&
          !activeEntitlements.has(tool.requiredEntitlement)
        )
          return false;
        return true;
      }).map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations: tool.annotations,
        securitySchemes: tool.securitySchemes,
        _meta: {
          securitySchemes: tool.securitySchemes,
          "krabiclaw/toolInfo": {
            domain: tool.domain,
            minimumRole: tool.minimumRole,
            confirmRequired: tool.confirmRequired,
          },
          ...(tool.fileParams?.length
            ? { "openai/fileParams": tool.fileParams }
            : {}),
          ...(tool.uiResourceUri
            ? {
                ui: { resourceUri: tool.uiResourceUri },
                "openai/outputTemplate": tool.uiResourceUri,
              }
            : {}),
        },
      }));

      const domains = (() => {
        try {
          return [...new Set(tools.map((t) => t._meta["krabiclaw/toolInfo"].domain))]
        } catch {
          return []
        }
      })()
      logMcpEventDetached(event, cfEnv.DB, {
        organizationId: siteCtx?.organizationId ?? null,
        siteId: siteCtx?.siteId ?? null,
        userId: user.userId,
        requestId: request.id,
        method: request.method,
        result: { count: tools.length, domains },
        status: "success",
      });

      return mcpSuccess(request.id, { tools });
    }

    if (request.method === "tools/call") {
      const toolName =
        typeof request.params?.name === "string" ? request.params.name : "";
      const rawArgs =
        request.params?.arguments &&
        typeof request.params.arguments === "object" &&
        !Array.isArray(request.params.arguments)
          ? (request.params.arguments as Record<string, unknown>)
          : Object.fromEntries(
              Object.entries(request.params ?? {}).filter(
                ([key]) => key !== "name",
              ),
            );

      assertConversationalToolEnabled(toolName, cfEnv as ApiRecord);

      const toolDef = MCP_TOOLS.find((t) => t.name === toolName);
      const toolStartedAt = Date.now();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let mcpUser: any = null;
      try {
        mcpUser = await requireMcpUser(event, tenantAuthOptions);
      } catch (authError) {
        logMcpEventDetached(event, cfEnv.DB, {
          requestId: request.id,
          method: request.method,
          toolName,
          toolDomain: toolDef?.domain ?? null,
          isMutating: isMcpMutatingTool(toolDef),
          arguments: rawArgs,
          status: "auth_required",
          errorMessage: authError instanceof Error ? authError.message : String(authError),
          durationMs: Date.now() - toolStartedAt,
        });
        throw authError;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let result: any;
      try {
        result = await executeMcpToolCall(event, toolName, rawArgs);
      } catch (toolError) {
        const mcpErr = asMcpError(toolError);
        logMcpEventDetached(event, cfEnv.DB, {
          userId: mcpUser.userId,
          organizationId: mcpUser.activeOrganizationId ?? null,
          siteId: typeof rawArgs.site_id === "string" ? rawArgs.site_id : null,
          requestId: request.id,
          method: request.method,
          toolName,
          toolDomain: toolDef?.domain ?? null,
          isMutating: isMcpMutatingTool(toolDef),
          arguments: rawArgs,
          status: "error",
          errorCode: mcpErr.code,
          errorMessage: mcpErr.message,
          durationMs: Date.now() - toolStartedAt,
        });
        throw toolError;
      }

      const isRender = isMcpRenderResponse(result);
      const structuredContent = isRender ? result.structuredContent : result;
      const modelText = isRender && result.fallbackText
        ? result.fallbackText
        : JSON.stringify(structuredContent, null, 2);

      // Resolved once and reused for both telemetry and the cache-purge below.
      const ctxSiteId = structuredContent && typeof structuredContent === 'object' && 'context' in structuredContent
        ? (structuredContent.context as Record<string, unknown>)?.site_id
        : null;
      const resolvedSiteId = typeof ctxSiteId === "string"
        ? ctxSiteId.trim()
        : typeof rawArgs.site_id === "string"
          ? rawArgs.site_id.trim()
          : null;

      logMcpEventDetached(event, cfEnv.DB, {
        userId: mcpUser.userId,
        organizationId: mcpUser.activeOrganizationId ?? null,
        siteId: resolvedSiteId,
        requestId: request.id,
        method: request.method,
        toolName,
        toolDomain: toolDef?.domain ?? null,
        isMutating: isMcpMutatingTool(toolDef),
        arguments: rawArgs,
        result: structuredContent,
        status: "success",
        durationMs: Date.now() - toolStartedAt,
      });

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
            // Bootstrap cache is keyed by siteId directly (not hostname), so no
            // domain lookup is needed here — unlike the HTML purge below.
            // Awaited inline (not waitUntil) so the MCP response never returns
            // before the stale bootstrap entry is cleared — otherwise a client
            // that reads bootstrap immediately after this mutation could still
            // see stale data.
            try {
              await purgeBootstrapCache(kv, siteId)
            } catch (err: unknown) {
              console.warn("[mcp-cache-purge] bootstrap purge failed:", String(err))
            }
          }
          if (kv && db) {
            // Look up all active hostnames for this site (subdomain + custom domains)
            const purgeAsync = queryAll<{ domain: string }>(
              db,
              `SELECT domain FROM site_domains
                 WHERE site_id = ? AND status = 'active'
                 LIMIT 20`,
              [siteId],
            )
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

      return mcpSuccess(request.id, {
        isError: false,
        structuredContent,
        content: [
          { type: "text", text: modelText },
        ],
        ...(isRender && result.privateMeta
          ? {
              _meta: {
                "krabiclaw/privateMeta": result.privateMeta,
              },
            }
          : {}),
      });
    }

    throw createError({
      statusCode: 404,
      statusMessage: `Unsupported MCP method: ${request.method}`,
    });
  } catch (error) {
    const mcpError = asMcpError(error);
    const errorStatus =
      typeof (error as { statusCode?: unknown })?.statusCode === "number"
        ? Number((error as { statusCode: number }).statusCode)
        : null;
    const status =
      errorStatus ??
      (mcpError.code === MCP_ERROR.methodNotFound
        ? 404
        : mcpError.code === MCP_ERROR.invalidRequest ||
            mcpError.code === MCP_ERROR.invalidParams
          ? 400
          : mcpError.code === MCP_ERROR.parse
            ? 400
            : 500);
    // Temporary: log all MCP errors so wrangler tail can capture them
    console.error(
      "[MCP]",
      status,
      mcpError.code,
      mcpError.message,
      "method:",
      requestMethod ?? null,
      "tool:",
      requestToolName ?? null,
      "request_id:",
      requestId ?? null,
    );
    if (status === 401) {
      const cfEnv = cloudflareEnv(event);
      const baseUrl = (
        cfEnv.BETTER_AUTH_URL ?? "https://krabiclaw.com"
      ).replace(/\/$/, "");
      const authChallenge = buildMcpAuthChallengeForError(error, {
        resourceMetadataUrl: resourceMetadataUrl(baseUrl),
        defaultDescription: TENANT_AUTH_DESCRIPTION,
      });
      if (requestMethod === "tools/call") {
        return mcpSuccess(requestId, mcpAuthRequiredResult({ challenge: authChallenge, message: TENANT_AUTH_REQUIRED_TEXT }));
      }
      setResponseStatus(event, 401);
      setMcpAuthChallenge(event, authChallenge);
      return mcpFailure(requestId, mcpError);
    }
    setResponseStatus(event, status);
    return mcpFailure(requestId, mcpError);
  }
});
