import type { McpToolDefinition } from './shared'
import { TOOL_ANNOTATIONS_BY_NAME } from './shared'
import { ACCOUNT_TOOLS } from './account'
import { ANALYTICS_TOOLS } from './analytics'
import { BLOG_TOOLS } from './blog'
import { CONTENT_TOOLS } from './content'
import { CONTEXT_TOOLS } from './context'
import { EXPERIENCES_TOOLS } from './experiences'
import { GOOGLE_BUSINESS_TOOLS } from './google-business'
import { INTEGRATIONS_TOOLS } from './integrations'
import { LOCALES_TOOLS } from './locales'
import { LOCATIONS_TOOLS } from './locations'
import { MANAGED_SERVICE_TOOLS } from './managed-service'
import { MEDIA_TOOLS } from './media'
import { MENUS_TOOLS } from './menus'
import { NOTIFICATIONS_TOOLS } from './notifications'
import { ONBOARDING_TOOLS } from './onboarding'
import { POSTS_TOOLS } from './posts'
import { QA_TOOLS } from './qa'
import { REVIEWS_TOOLS } from './reviews'
import { SETTINGS_TOOLS } from './settings'
import { SITES_TOOLS } from './sites'
import { SUBMISSIONS_TOOLS } from './submissions'
import { TRANSLATIONS_TOOLS } from './translations'

export const MCP_TOOLS: McpToolDefinition[] = [
  ...ACCOUNT_TOOLS,
  ...ANALYTICS_TOOLS,
  ...BLOG_TOOLS,
  ...CONTENT_TOOLS,
  ...CONTEXT_TOOLS,
  ...EXPERIENCES_TOOLS,
  ...GOOGLE_BUSINESS_TOOLS,
  ...INTEGRATIONS_TOOLS,
  ...LOCALES_TOOLS,
  ...LOCATIONS_TOOLS,
  ...MANAGED_SERVICE_TOOLS,
  ...MEDIA_TOOLS,
  ...MENUS_TOOLS,
  ...NOTIFICATIONS_TOOLS,
  ...ONBOARDING_TOOLS,
  ...POSTS_TOOLS,
  ...QA_TOOLS,
  ...REVIEWS_TOOLS,
  ...SETTINGS_TOOLS,
  ...SITES_TOOLS,
  ...SUBMISSIONS_TOOLS,
  ...TRANSLATIONS_TOOLS,
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
