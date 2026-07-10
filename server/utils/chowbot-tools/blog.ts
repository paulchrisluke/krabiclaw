import type { AiTool } from '~/server/utils/ai-gateway'
import { BLOG_TOOLS } from '~/server/utils/mcp-tools/blog'
import { chowbotToolFromMcp } from './from-mcp'

// reorder_blog_posts (editorial nav ordering) was never exposed to ChowBot
// and isn't added here — lower-priority chat action, not a drift bug.
const BLOG_DOMAIN_TOOL_NAMES = new Set([
  'list_blog_posts',
  'get_blog_post',
  'create_blog_post',
  'update_blog_post',
  'set_blog_post_image',
  'delete_blog_post',
])

export const BLOG_CHOWBOT_TOOLS: AiTool[] = BLOG_TOOLS
  .filter((tool) => BLOG_DOMAIN_TOOL_NAMES.has(tool.name))
  .map(chowbotToolFromMcp)
