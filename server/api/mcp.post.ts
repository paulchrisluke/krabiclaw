import { createError, getHeader, getRequestURL, setResponseHeader } from "h3";
import {
  asMcpError,
  mcpFailure,
  mcpProtocolError,
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
import { cloudflareEnv } from "~/server/utils/api-response";
import { isWidgetEnabledForTool } from "~/server/utils/mcp-widget-config";
import { purgeSiteKvCache } from "~/server/utils/edge-cache";
import { queryAll } from "~/server/db";

const WIDGET_RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

// Increment this whenever widgets are changed to bust ChatGPT's ui:// cache.
// ChatGPT caches widget resources by URI, so the same ui://widget/foo.html
// URI will continue to serve the old widget until the URI changes.
const WIDGET_VERSION = "v9";

function widgetResourceUri(name: string) {
  return `ui://widget/${name}@${WIDGET_VERSION}.html`;
}

// Prefer BETTER_AUTH_URL from Cloudflare env — it is set correctly per environment
// (krabiclaw.com for prod, staging.krabiclaw.com for staging, etc.).
// Falling back to the raw request URL origin can return a Workers internal hostname
// on Cloudflare, which the ChatGPT sandbox then blocks in CSP.
function resolveBaseUrl(event: Parameters<typeof getRequestURL>[0]): string {
  const cfEnv = cloudflareEnv(event);
  return (cfEnv.BETTER_AUTH_URL ?? getRequestURL(event).origin).replace(
    /\/$/,
    "",
  );
}

function oauthChallenge(baseUrl: string, error = "invalid_token", description = "Connect KrabiClaw to continue.") {
  return `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource", error="${error}", error_description="${description}"`
}

function setMcpAuthChallenge(event: Parameters<typeof getRequestURL>[0], challenge: string) {
  setResponseHeader(event, "WWW-Authenticate", challenge)
}

function mcpAuthRequiredResult(challenge: string) {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: "Authentication required: connect KrabiClaw to continue.",
      },
    ],
    _meta: {
      "mcp/www_authenticate": [challenge],
    },
  }
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
    const authChallenge = oauthChallenge(baseUrl);
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
      setResponseStatus(event, 401);
      setMcpAuthChallenge(event, authChallenge);
      if (requestMethod === "tools/call") {
        return mcpSuccess(requestId ?? null, mcpAuthRequiredResult(authChallenge));
      }
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
      await requireMcpUser(event);
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
- Primary happy path:
  1. When the user has already attached an image in ChatGPT, inspect it visually first. Do not upload or mutate anything yet.
  2. If the intended use is obvious, describe it briefly and ask the user to confirm the target site, the target placement, and that the attached image should be used.
  3. Do not upload media, assign an image, publish, or overwrite anything until the user explicitly confirms.
  4. After confirmation, call upload_user_photo({ site_id, file: <attached local file argument>, category, description }).
  5. The file argument is the primary contract. Pass the ChatGPT attachment through the file field and let the host rewrite it into an authorized file reference for KrabiClaw. Do not fabricate download URLs or wrap fake file objects.
  6. After upload_user_photo returns assetId/publicUrl, call the appropriate assignment tool such as set_home_hero_image, set_logo, set_about_story_image, set_home_story_image, set_location_hero_image, set_post_image, or set_experience_image.
  7. Reply with the exact site, placement, assetId, and publicUrl that were updated.
- Secondary fallback only:
  - If the user wants to provide an image but has not attached one in ChatGPT, call request_photo_upload({ site_id, category }) to open the in-chat file picker widget.
  - Use file_id-only upload_user_photo calls only when the file argument rewrite path is unavailable.

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

All other tools require a site_id obtained from list_sites. Never guess or invent site IDs. Use get_current_user when the user asks which account is connected.

Common workflows: update menus and items, create and publish posts, triage contact and reservation submissions, update page content directly, upload media, translate content, reply to reviews, manage experiences and bookings, and generate or replace images for any content section.`,
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

    // Widget resources served as ui://widget/{name}.html with the MCP Apps UI MIME type.
    // ChatGPT fetches these when it sees openai/outputTemplate on a tool definition.
    const WIDGETS = [
      { name: "photo-upload", title: "Photo Upload" },
    ] as const;

    function widgetHtml(name: string, baseUrl: string) {
      return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>KrabiClaw</title>
<script>window.__KC_WIDGET_VERSION__="${WIDGET_VERSION}";</script>
<script type="module" crossorigin src="${baseUrl}/mcp-assets/${name}.js"></script>
<link rel="modulepreload" crossorigin href="${baseUrl}/mcp-assets/jsx-runtime-chunk.js">
</head>
<body><div id="app"></div></body>
</html>`;
    }

    if (request.method === "resources/list") {
      await requireMcpUser(event);
      return mcpSuccess(request.id, {
        resources: WIDGETS.map((w) => ({
          uri: widgetResourceUri(w.name),
          name: w.title,
          description: `${w.title} widget`,
          mimeType: WIDGET_RESOURCE_MIME_TYPE,
        })),
      });
    }

    if (request.method === "resources/templates/list") {
      await requireMcpUser(event);
      return mcpSuccess(request.id, { resourceTemplates: [] });
    }

    if (request.method === "resources/read") {
      await requireMcpUser(event);
      const uri =
        typeof request.params?.uri === "string" ? request.params.uri : "";
      // Accept both versioned (name@vN.html) and plain (name.html) forms so that
      // older cached tool references from prior sessions can still resolve.
      const match = uri.match(
        /^ui:\/\/widget\/([^@]+?)(?:@[^.]+)?(?:\.html)?$/,
      );
      if (!match) {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          `Unknown resource: ${uri}`,
        );
      }
      const widgetName = match[1]!;
      if (!WIDGETS.some((w) => w.name === widgetName)) {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          `Unknown widget: ${widgetName}`,
        );
      }
      const baseUrl = resolveBaseUrl(event);
      const r2MediaOrigin = (() => {
        try {
          const base = cfEnv.MEDIA_BASE_URL as string | undefined;
          return base ? new URL(base).origin : null;
        } catch { return null; }
      })();
      const extraDomains = r2MediaOrigin ? [r2MediaOrigin] : [];
      return mcpSuccess(request.id, {
        contents: [
          {
            uri: widgetResourceUri(widgetName),
            mimeType: WIDGET_RESOURCE_MIME_TYPE,
            text: widgetHtml(widgetName, baseUrl),
            _meta: {
              ui: {
                prefersBorder: true,
                domain: baseUrl,
                csp: {
                  connectDomains: [...extraDomains, baseUrl, "https://upload.imagedelivery.net", "https://imagedelivery.net"],
                  resourceDomains: [...extraDomains, baseUrl, "https://imagedelivery.net"],
                  imageDomains: [...extraDomains, "https://imagedelivery.net"],
                },
              },
              "openai/widgetDescription": `${WIDGETS.find((w) => w.name === widgetName)?.title ?? "KrabiClaw"} widget`,
              "openai/widgetPrefersBorder": true,
              "openai/widgetDomain": baseUrl,
              "openai/widgetCSP": {
                connect_domains: [...extraDomains, baseUrl, "https://upload.imagedelivery.net", "https://imagedelivery.net"],
                resource_domains: [...extraDomains, baseUrl, "https://imagedelivery.net"],
                image_domains: [...extraDomains, "https://imagedelivery.net"],
                redirect_domains: [
                  ...new Set([
                    baseUrl,
                    cloudflareEnv(event).NUXT_PUBLIC_PLATFORM_DOMAIN?.replace(/\/$/, "") ??
                      "https://krabiclaw.com",
                  ]),
                ],
              },
            },
          },
        ],
      });
    }

    if (request.method === "prompts/list") {
      await requireMcpUser(event);
      return mcpSuccess(request.id, { prompts: [] });
    }

    if (request.method === "server/discover") {
      await requireMcpUser(event);
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
      const user = await requireMcpUser(event);
      const siteId =
        typeof request.params?.site_id === "string"
          ? request.params.site_id
          : null;
      const siteCtx = siteId
        ? await getVisibleSiteContext(event, siteId)
        : null;

      const entitlementKeys = siteCtx
        ? [
            ...new Set(
              MCP_TOOLS.map((t) => t.requiredEntitlement).filter(
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

      const tools = MCP_TOOLS.filter((tool) => {
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
        ...(isWidgetEnabledForTool(tool.name) && tool.widgetName
          ? {
              _meta: {
                securitySchemes: tool.securitySchemes,
                "krabiclaw/toolInfo": {
                  domain: tool.domain,
                  minimumRole: tool.minimumRole,
                  confirmRequired: tool.confirmRequired,
                },
                ui: { resourceUri: widgetResourceUri(tool.widgetName) },
                "openai/outputTemplate": widgetResourceUri(tool.widgetName),
                "openai/widgetAccessible": true,
                "openai/toolInvocation/invoking":
                  tool.widgetInvoking ?? "Loading…",
                "openai/toolInvocation/invoked": tool.widgetInvoked ?? "Done",
                ...(tool.fileParams?.length
                  ? { "openai/fileParams": tool.fileParams }
                  : {}),
              },
            }
          : tool.fileParams?.length
            ? {
                _meta: {
                  securitySchemes: tool.securitySchemes,
                  "krabiclaw/toolInfo": {
                    domain: tool.domain,
                    minimumRole: tool.minimumRole,
                    confirmRequired: tool.confirmRequired,
                  },
                  "openai/fileParams": tool.fileParams,
                },
              }
            : {
                _meta: {
                  securitySchemes: tool.securitySchemes,
                  "krabiclaw/toolInfo": {
                    domain: tool.domain,
                    minimumRole: tool.minimumRole,
                    confirmRequired: tool.confirmRequired,
                  },
                },
              }),
      }));

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

      const result = await executeMcpToolCall(event, toolName, rawArgs);

      const isRender = isMcpRenderResponse(result);
      const structuredContent = isRender ? result.structuredContent : result;
      const modelText = isRender && result.fallbackText
        ? result.fallbackText
        : JSON.stringify(structuredContent, null, 2);

      // After any mutating tool call, purge KV HTML cache for the site so the
      // next browser load gets fresh SSR HTML with the correct /_nuxt/ asset hashes.
      // Fire-and-forget — never block the MCP response on cache ops.
      const mutatedTool = MCP_TOOLS.find((t) => t.name === toolName);
      const isReadOnly = mutatedTool?.annotations?.readOnlyHint !== false;
      if (!isReadOnly) {
        const ctxSiteId = structuredContent && typeof structuredContent === 'object' && 'context' in structuredContent
          ? (structuredContent.context as Record<string, unknown>)?.site_id
          : null;
        const rawSiteId = ctxSiteId ?? rawArgs.site_id;
        const siteId = typeof rawSiteId === "string" ? rawSiteId.trim() : null;
        if (siteId) {
          const env = cloudflareEnv(event);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const kv = (env as any).SITE_CACHE as KVNamespace | undefined;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const db = (env as any).DB as D1Database | undefined;
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ctx = (event.context.cloudflare as any)?.context as { waitUntil?: (_p: Promise<unknown>) => void } | undefined
            if (ctx?.waitUntil) {
              ctx.waitUntil(purgeAsync)
            }
            // purgeAsync already runs detached whether or not waitUntil is available
          }
        }
      }

      const tool =
        isWidgetEnabledForTool(toolName) && isRender
          ? MCP_TOOLS.find((t) => t.name === toolName)
          : null;
      return mcpSuccess(request.id, {
        isError: false,
        structuredContent,
        content: [
          { type: "text", text: modelText },
        ],
        ...(tool
          ? {
              _meta: {
                "openai/toolInvocation/invoking":
                  tool.widgetInvoking ?? "Loading…",
                "openai/toolInvocation/invoked": tool.widgetInvoked ?? "Done",
                ...(isRender && result.privateMeta
                  ? { "krabiclaw/widgetData": result.privateMeta }
                  : {}),
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
    setResponseStatus(event, status);
    if (status === 401) {
      const cfEnv = cloudflareEnv(event);
      const baseUrl = (
        cfEnv.BETTER_AUTH_URL ?? "https://krabiclaw.com"
      ).replace(/\/$/, "");
      const authChallenge = oauthChallenge(baseUrl);
      setMcpAuthChallenge(event, authChallenge);
      if (requestMethod === "tools/call") {
        return mcpSuccess(requestId, mcpAuthRequiredResult(authChallenge));
      }
    }
    return mcpFailure(requestId, mcpError);
  }
});
