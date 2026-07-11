// Lets ChowBot (dashboard chat + WhatsApp) call the same domain handlers MCP
// uses (server/utils/mcp-executor/*.ts) instead of maintaining a duplicate
// implementation per tool. See GitHub issue "Consolidate ChowBot onto the
// MCP tool-executor" for the full migration this is one slice of.
//
// ChowBot resolves its own org/site/user/role via dashboard session
// (getSiteForMember) or WhatsApp phone-number mapping — neither has an
// H3Event carrying MCP OAuth/session auth, so this builds an
// McpExecutorContext directly from already-resolved values rather than
// going through requireMcpSite. It still enforces the same per-tool
// minimumRole and requiredEntitlement checks executeMcpToolCall does for
// MCP, by looking the tool up in the same MCP_TOOLS catalog — those checks
// are metadata on the tool definition, not something a caller can skip.
import { hasSiteEntitlement } from '~/server/utils/billing'
import { roleSatisfies, type McpToolRole } from '~/server/utils/mcp-auth'
import { getMcpTool } from '~/server/utils/mcp-tools'
import { DOMAIN_HANDLERS } from './index'
import { NOT_HANDLED, humanizeEntitlement, type McpExecutorContext } from './shared'

export interface ChowbotExecutorSite {
  db: D1Database
  env: CloudflareEnv
  userId: string
  organizationId: string
  siteId: string
  role: McpToolRole
}

// privateMeta is, on the MCP surface, sent as JSON-RPC `_meta` — a channel
// conventionally meant for the connecting host app (widget hydration etc.),
// separate from the model-visible content/structuredContent. ChowBot has no
// such separate host channel — everything returned here goes straight into
// the model's tool-result context — so spreading privateMeta in is only
// safe if its contents are themselves safe for the model to see. Verified:
// every renderStructuredResponse(...) call across mcp-executor/*.ts as of
// this migration passes only the plain domain entity as privateMeta
// (menu/item/post/location/experience/settings/policy/manifest) — no
// tokens, no host-only widget wiring, no internal-only fields. Re-check
// this if a future domain's privateMeta ever carries something host-only.
function unwrapMcpExecutorResult(result: unknown): ApiValue {
  if (
    result && typeof result === 'object' &&
    (result as { __mcpStructuredResponse?: boolean }).__mcpStructuredResponse === true
  ) {
    const rendered = result as { structuredContent: unknown; privateMeta?: Record<string, unknown> }
    const structured = rendered.structuredContent && typeof rendered.structuredContent === 'object'
      ? rendered.structuredContent as Record<string, unknown>
      : {}
    return { ...structured, ...(rendered.privateMeta ?? {}) }
  }
  return result
}

/**
 * Runs an mcp-executor domain handler for ChowBot, given context ChowBot has
 * already resolved itself (dashboard membership check, WhatsApp phone
 * mapping). Never throws — mirrors the existing ChowBot tool convention of
 * returning `{ error: message }` so the agent loop can report it back to the
 * model instead of crashing the chat turn.
 *
 * toolName must be a real MCP tool name (looked up via getMcpTool) — ChowBot
 * -only convenience tools (e.g. publish_menu) are translated to their MCP
 * equivalent by the caller in chowbot-agent.ts before reaching here.
 */
export async function runMcpExecutorToolForChowbot(
  site: ChowbotExecutorSite,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ApiValue> {
  const tool = getMcpTool(toolName)
  const handler = tool?.domain ? DOMAIN_HANDLERS[tool.domain] : undefined
  if (!tool || !handler) {
    return { error: `Unhandled tool: ${toolName}` }
  }

  try {
    if (!roleSatisfies(site.role, tool.minimumRole)) {
      return { error: `Your role does not have permission to use ${toolName}.` }
    }

    if (
      tool.requiredEntitlement &&
      !(await hasSiteEntitlement(site.db, site.siteId, tool.requiredEntitlement))
    ) {
      return { error: `${humanizeEntitlement(tool.requiredEntitlement)} is not enabled for this site.` }
    }

    const ctx: McpExecutorContext = {
      toolName,
      args,
      site: {
        env: site.env,
        db: site.db,
        userId: site.userId,
        // ChowBot's dashboard route resolves site access via membership only
        // (getSiteForMember), never the platform-admin bypass requireMcpSite
        // supports for MCP — so this is always accurate for this caller.
        isPlatformAdmin: false,
        scopes: ['tenant'],
        organizationId: site.organizationId,
        siteId: site.siteId,
        role: site.role,
      },
    }
    const result = await handler(ctx)
    if (result === NOT_HANDLED) {
      return { error: `Unhandled tool: ${toolName}` }
    }
    return unwrapMcpExecutorResult(result)
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}
