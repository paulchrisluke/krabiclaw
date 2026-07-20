import type { AiTool } from '~/server/utils/ai-gateway'
import { POSTS_TOOLS } from '~/server/utils/mcp-tools/posts'
import { chowbotToolFromMcp } from './from-mcp'

// Video widget launchers are tenant-MCP-only and live in mcp-tools/media.ts.
// publish_post's channels/targets fields are derived along with everything
// else, but chowbot-agent.ts's publish_post case always overrides channels
// to ["site"] regardless of what's passed — ChowBot has no social_publishing
// UI/prompt surface, matching docs/tool-parity.md.
export const POSTS_CHOWBOT_TOOLS: AiTool[] = POSTS_TOOLS
  .filter((tool) => !tool.uiResourceUri)
  .map(chowbotToolFromMcp)
