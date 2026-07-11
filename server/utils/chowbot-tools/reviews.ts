import type { AiTool } from '~/server/utils/ai-gateway'
import { REVIEWS_TOOLS } from '~/server/utils/mcp-tools/reviews'
import { chowbotToolFromMcp } from './from-mcp'

export const REVIEWS_CHOWBOT_TOOLS: AiTool[] = REVIEWS_TOOLS.map(chowbotToolFromMcp)
