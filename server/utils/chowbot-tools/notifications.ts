import type { AiTool } from '~/server/utils/ai-gateway'
import { NOTIFICATIONS_TOOLS } from '~/server/utils/mcp-tools/notifications'
import { chowbotToolFromMcp } from './from-mcp'

export const NOTIFICATIONS_CHOWBOT_TOOLS: AiTool[] = NOTIFICATIONS_TOOLS.map(chowbotToolFromMcp)
