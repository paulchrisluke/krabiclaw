type ToolLike = {
  name: string
  description?: string
}

type McpToolLike = ToolLike & {
  inputSchema?: Record<string, unknown>
}

export type ConversationalToolSurfaceGroup =
  | 'social_publishing'

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled'])

const GROUP_FLAG_ENV: Record<ConversationalToolSurfaceGroup, string> = {
  social_publishing: 'CONVERSATIONAL_TOOLS_SOCIAL_PUBLISHING_ENABLED',
}

function flagEnabled(env: ApiRecord | undefined, key: string) {
  const raw = env?.[key]
  return typeof raw === 'string' && TRUE_VALUES.has(raw.trim().toLowerCase())
}

export function isConversationalToolGroupEnabled(
  env: ApiRecord | undefined,
  group: ConversationalToolSurfaceGroup,
) {
  return flagEnabled(env, GROUP_FLAG_ENV[group])
}

function stripExternalChannelsFromProperties(properties: Record<string, unknown>) {
  const next = { ...properties }
  const siteOnlyArray = {
    type: 'array',
    items: { type: 'string', enum: ['site'] },
    description: 'Channels to publish to. Defaults to ["site"]. Social publishing is currently managed from the dashboard.',
  }
  if ('channels' in next) next.channels = siteOnlyArray
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

export function visibleConversationalMcpTools<T extends McpToolLike>(
  tools: readonly T[],
  env?: ApiRecord,
): T[] {
  return tools.map((tool) => normalizeMcpToolForConversationalSurface(tool, env))
}
