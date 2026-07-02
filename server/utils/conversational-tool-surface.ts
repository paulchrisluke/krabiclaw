// Relative (not '~/...') import — this file is loaded directly by the plain
// node:test runner in tests/unit/conversational-tool-surface.test.ts, outside
// Nuxt's build context, where the '~' alias doesn't resolve.
import { mcpProtocolError, MCP_ERROR } from './mcp-protocol.ts'

type ToolLike = {
  name: string
  description?: string
}

type McpToolLike = ToolLike & {
  inputSchema?: Record<string, unknown>
}

type ChowBotToolLike = ToolLike & {
  input_schema?: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export type ConversationalToolSurfaceGroup =
  | 'translations'
  | 'social_publishing'
  | 'domains'
  | 'managed_service'

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled'])

const GROUP_FLAG_ENV: Record<ConversationalToolSurfaceGroup, string> = {
  translations: 'CONVERSATIONAL_TOOLS_TRANSLATIONS_ENABLED',
  social_publishing: 'CONVERSATIONAL_TOOLS_SOCIAL_PUBLISHING_ENABLED',
  domains: 'CONVERSATIONAL_TOOLS_DOMAINS_ENABLED',
  managed_service: 'CONVERSATIONAL_TOOLS_MANAGED_SERVICE_ENABLED',
}

const GROUP_TOOL_NAMES: Record<ConversationalToolSurfaceGroup, readonly string[]> = {
  translations: [
    'list_locales',
    'upsert_locale',
    'delete_locale',
    'get_translation_inventory',
    'start_translation_job',
    'list_translation_jobs',
    'get_translation_job',
    'run_translation_job_batch',
    'get_translation_review_items',
    'save_translation_review_item',
    'publish_translations',
  ],
  social_publishing: [
    'get_facebook_connection',
    'publish_to_facebook',
    'sync_facebook_page',
    'get_google_business_connection',
    'get_google_business_auth_url',
    'list_google_business_accounts',
    'sync_google_business_locations',
  ],
  domains: [
    'get_site_domains',
    'create_domain',
    'set_canonical_domain',
    'delete_domain',
    'sync_domain',
  ],
  managed_service: [
    'list_work_requests',
    'create_work_request',
  ],
}

const TOOL_GROUP_BY_NAME = new Map<string, ConversationalToolSurfaceGroup>(
  Object.entries(GROUP_TOOL_NAMES).flatMap(([group, names]) =>
    names.map((name) => [name, group as ConversationalToolSurfaceGroup]),
  ),
)

function flagEnabled(env: ApiRecord | undefined, key: string) {
  const raw = env?.[key]
  return typeof raw === 'string' && TRUE_VALUES.has(raw.trim().toLowerCase())
}

export function conversationalToolGroupForName(name: string) {
  return TOOL_GROUP_BY_NAME.get(name) ?? null
}

export function isConversationalToolGroupEnabled(
  env: ApiRecord | undefined,
  group: ConversationalToolSurfaceGroup,
) {
  return flagEnabled(env, GROUP_FLAG_ENV[group])
}

export function isConversationalToolEnabled(name: string, env?: ApiRecord) {
  const group = conversationalToolGroupForName(name)
  return !group || isConversationalToolGroupEnabled(env, group)
}

export function assertConversationalToolEnabled(name: string, env?: ApiRecord) {
  const group = conversationalToolGroupForName(name)
  if (!group || isConversationalToolGroupEnabled(env, group)) return

  const flag = GROUP_FLAG_ENV[group]
  // MCP-shaped (not a plain Error) so mcp.post.ts's asMcpError() preserves
  // methodNotFound instead of falling back to a generic internal (-32603)
  // error for a tools/call against a surface-disabled tool. chowbot-agent.ts's
  // `error instanceof Error` catch still works — mcpProtocolError() returns a
  // real Error with an extra `.mcp` property attached.
  throw mcpProtocolError(
    MCP_ERROR.methodNotFound,
    `Tool ${name} is not exposed on the conversational surface. Enable ${flag}=true to opt into ${group.replaceAll('_', ' ')} tools.`,
  )
}

function stripExternalChannelsFromProperties(properties: Record<string, unknown>) {
  const next = { ...properties }
  const siteOnlyArray = {
    type: 'array',
    items: { type: 'string', enum: ['site'] },
    description: 'Channels to publish to. Defaults to ["site"]. Social publishing is currently managed from the dashboard.',
  }
  if ('channels' in next) next.channels = siteOnlyArray
  if ('targets' in next) {
    next.targets = {
      ...siteOnlyArray,
      description: 'Deprecated alias for channels. Only ["site"] is available on the conversational surface.',
    }
  }
  return next
}

export function normalizeMcpToolForConversationalSurface<T extends McpToolLike>(
  tool: T,
  env?: ApiRecord,
): T {
  if (tool.name !== 'publish_post' || isConversationalToolGroupEnabled(env, 'social_publishing')) {
    return tool
  }

  const inputSchema = tool.inputSchema
  if (!inputSchema || typeof inputSchema !== 'object') return tool
  const properties = inputSchema.properties
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return tool

  return {
    ...tool,
    description: 'Publish a post to the site. Social publishing is currently managed from the dashboard.',
    inputSchema: {
      ...inputSchema,
      properties: stripExternalChannelsFromProperties(properties as Record<string, unknown>),
    },
  }
}

export function normalizeChowBotToolForConversationalSurface<T extends ChowBotToolLike>(
  tool: T,
  env?: ApiRecord,
): T {
  if (tool.name !== 'publish_post' || isConversationalToolGroupEnabled(env, 'social_publishing')) {
    return tool
  }

  return {
    ...tool,
    description: 'Publish a post to the site. Social publishing is currently managed from the dashboard.',
  }
}

export function filterConversationalTools<T extends ToolLike>(tools: readonly T[], env?: ApiRecord): T[] {
  return tools.filter((tool) => isConversationalToolEnabled(tool.name, env))
}
