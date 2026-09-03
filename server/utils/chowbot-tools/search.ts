import type { AiTool } from '~/server/utils/ai-gateway'
import { PUBLIC_SEARCH_TYPES } from '~/server/utils/platform-search-types'

// search_public_resources has no MCP equivalent — ChowBot-only tool over
// the platform search index.
export const SEARCH_CHOWBOT_TOOLS: AiTool[] = [
  {
    name: "search_public_resources",
    description: "Search the unified KrabiClaw AI Search knowledge index across docs, blog posts, support answers, platform pages, and route guidance.",
    input_schema: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description: "The search query to run against the KrabiClaw platform knowledge index.",
        },
        type: {
          type: "string",
          enum: [...PUBLIC_SEARCH_TYPES],
          description: "Optional result type filter. Omit for all indexed platform knowledge resources.",
        },
      },
      required: ["q"],
    },
  },
]
