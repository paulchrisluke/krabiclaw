import type { AiTool } from '~/server/utils/ai-gateway'
import { MANAGED_SERVICE_TOOLS } from '~/server/utils/mcp-tools/managed-service'
import { PUBLIC_SEARCH_TYPES } from '~/server/utils/platform-search-types'
import { chowbotToolFromMcp } from './from-mcp'

export const MANAGED_SERVICE_CHOWBOT_TOOLS: AiTool[] = [
  ...MANAGED_SERVICE_TOOLS.map(chowbotToolFromMcp),
  // search_public_resources has no MCP equivalent — ChowBot-only tool over
  // the platform search index, unrelated to managed-service work requests
  // but bundled in this file for convenience.
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
