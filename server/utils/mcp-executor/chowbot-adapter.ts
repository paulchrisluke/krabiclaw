// Lets ChowBot (dashboard chat + WhatsApp) call the same domain handlers MCP
// uses (server/utils/mcp-executor/*.ts) instead of maintaining a duplicate
// implementation per tool. See GitHub issue "Consolidate ChowBot onto the
// MCP tool-executor" for the full migration this is the first slice of.
//
// ChowBot resolves its own org/site/user/role via dashboard session
// (getSiteForMember) or WhatsApp phone-number mapping — neither has an
// H3Event carrying MCP OAuth/session auth, so this builds an
// McpExecutorContext directly from already-resolved values rather than
// going through requireMcpSite.
import type { McpToolRole } from '~/server/utils/mcp-auth'
import { handleMenusTools } from './menus'
import { NOT_HANDLED, type McpExecutorContext } from './shared'

export interface ChowbotExecutorSite {
  db: D1Database
  env: CloudflareEnv
  userId: string
  organizationId: string
  siteId: string
  role: McpToolRole
}

const DOMAIN_HANDLERS: Record<string, (_ctx: McpExecutorContext) => Promise<unknown>> = {
  menus: handleMenusTools,
}

const TOOL_DOMAIN: Record<string, string> = {
  list_menus: 'menus',
  get_menu: 'menus',
  create_menu: 'menus',
  update_menu: 'menus',
  delete_menu: 'menus',
  create_menu_item: 'menus',
  add_menu_items_batch: 'menus',
  sync_menu_items: 'menus',
  update_menu_item: 'menus',
  set_menu_item_image: 'menus',
  delete_menu_item: 'menus',
  rename_menu_section: 'menus',
  delete_menu_section: 'menus',
  reorder_menu_items: 'menus',
}

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
 */
export async function runMcpExecutorToolForChowbot(
  site: ChowbotExecutorSite,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ApiValue> {
  const domain = TOOL_DOMAIN[toolName]
  const handler = domain ? DOMAIN_HANDLERS[domain] : undefined
  if (!handler) {
    return { error: `Unhandled tool: ${toolName}` }
  }

  try {
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
