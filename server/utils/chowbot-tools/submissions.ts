import type { AiTool } from '~/server/utils/ai-gateway'
import { SUBMISSIONS_TOOLS } from '~/server/utils/mcp-tools/submissions'
import { chowbotToolFromMcp } from './from-mcp'

export const SUBMISSIONS_CHOWBOT_TOOLS: AiTool[] = SUBMISSIONS_TOOLS.map(chowbotToolFromMcp)
