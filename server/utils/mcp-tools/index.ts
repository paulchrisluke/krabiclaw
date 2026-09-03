import type { McpToolDefinition } from './shared'
import { TOOL_ANNOTATIONS_BY_NAME } from './shared'
import { ANALYTICS_TOOLS } from './analytics'
import { BLOG_TOOLS } from './blog'
import { CONTENT_TOOLS } from './content'
import { CONTEXT_TOOLS } from './context'
import { EXPERIENCES_TOOLS } from './experiences'
import { LOCALES_TOOLS } from './locales'
import { LOCATIONS_TOOLS } from './locations'
import { MEDIA_TOOLS } from './media'
import { PRODUCTS_TOOLS } from './products'
import { ONBOARDING_TOOLS } from './onboarding'
import { POSTS_TOOLS } from './posts'
import { QA_TOOLS } from './qa'
import { REVIEWS_TOOLS } from './reviews'
import { SETTINGS_TOOLS } from './settings'
import { SITES_TOOLS } from './sites'
import { SUBMISSIONS_TOOLS } from './submissions'

export const MCP_PUBLIC_TOOLS: McpToolDefinition[] = [
  ...ANALYTICS_TOOLS,
  ...BLOG_TOOLS,
  ...CONTENT_TOOLS,
  ...CONTEXT_TOOLS,
  ...EXPERIENCES_TOOLS,
  ...LOCALES_TOOLS,
  ...LOCATIONS_TOOLS,
  ...MEDIA_TOOLS,
  ...PRODUCTS_TOOLS,
  ...ONBOARDING_TOOLS,
  ...POSTS_TOOLS,
  ...QA_TOOLS,
  ...REVIEWS_TOOLS,
  ...SETTINGS_TOOLS,
  ...SITES_TOOLS,
  ...SUBMISSIONS_TOOLS,
].sort((a, b) => a.name.localeCompare(b.name))

export const MCP_INTERNAL_TOOLS: McpToolDefinition[] = []

export const MCP_TOOLS: McpToolDefinition[] = [
  ...MCP_PUBLIC_TOOLS,
  ...MCP_INTERNAL_TOOLS,
].sort((a, b) => a.name.localeCompare(b.name))


{
  const toolNames = new Set(MCP_TOOLS.map((tool) => tool.name))
  for (const name of TOOL_ANNOTATIONS_BY_NAME.keys()) {
    if (!toolNames.has(name)) {
      console.warn(`MCP tool annotation classification exists for unknown tool "${name}".`)
    }
  }

  const seenNames = new Set<string>()
  for (const tool of MCP_TOOLS) {
    if (seenNames.has(tool.name)) {
      throw new Error(`Duplicate MCP tool name registered: "${tool.name}".`)
    }
    seenNames.add(tool.name)
  }
}

export function getMcpTool(name: string) {
  return MCP_TOOLS.find((tool) => tool.name === name) ?? null
}
