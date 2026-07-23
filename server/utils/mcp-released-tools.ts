import { MCP_PUBLIC_TOOLS, MCP_TOOLS } from '~/server/utils/mcp-tools'
import { PLATFORM_MCP_TOOLS, PLATFORM_PUBLIC_MCP_TOOLS } from '~/server/utils/platform-mcp-tools'

export type McpReleasedSurface = 'tenant' | 'platform'
export type McpReleasedToolStatus = 'current' | 'deprecated' | 'retired'

export interface McpReleasedToolManifestEntry {
  surface: McpReleasedSurface
  name: string
  firstReleasedAt: string
  status: McpReleasedToolStatus
  replacementTools: string[]
  compatibilityHandler?: string
}

const CURRENT_RELEASE_DATE = '2026-07-23'

const DEPRECATED_RELEASED_TOOLS: McpReleasedToolManifestEntry[] = [
  {
    surface: 'platform',
    name: 'update_platform_blog_post',
    firstReleasedAt: '2026-07-22',
    status: 'deprecated',
    replacementTools: ['update_platform_blog_metadata', 'replace_platform_blog_content'],
    compatibilityHandler: 'server/utils/mcp-compat/platform-blog.ts:updatePlatformBlogPostCompatibility',
  },
  {
    surface: 'tenant',
    name: 'open_media_upload',
    firstReleasedAt: '2026-07-06',
    status: 'retired',
    replacementTools: ['upload_user_media', 'open_video_upload'],
  },
]

export const MCP_RELEASED_TOOLS: McpReleasedToolManifestEntry[] = [
  ...MCP_PUBLIC_TOOLS.map(tool => ({
    surface: 'tenant' as const,
    name: tool.name,
    firstReleasedAt: CURRENT_RELEASE_DATE,
    status: 'current' as const,
    replacementTools: [],
  })),
  ...PLATFORM_PUBLIC_MCP_TOOLS.map(tool => ({
    surface: 'platform' as const,
    name: tool.name,
    firstReleasedAt: CURRENT_RELEASE_DATE,
    status: 'current' as const,
    replacementTools: [],
  })),
  ...DEPRECATED_RELEASED_TOOLS,
].sort((a, b) => `${a.surface}:${a.name}`.localeCompare(`${b.surface}:${b.name}`))

export function releasedDispatchNames(surface: McpReleasedSurface) {
  const tools = surface === 'tenant' ? MCP_TOOLS : PLATFORM_MCP_TOOLS
  return new Set(tools.map(tool => tool.name))
}

export function releasedPublicNames(surface: McpReleasedSurface) {
  const tools = surface === 'tenant' ? MCP_PUBLIC_TOOLS : PLATFORM_PUBLIC_MCP_TOOLS
  return new Set(tools.map(tool => tool.name))
}
