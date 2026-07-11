import type { AiTool } from '~/server/utils/ai-gateway'
import { QA_TOOLS } from '~/server/utils/mcp-tools/qa'
import { chowbotToolFromMcp } from './from-mcp'

export const QA_CHOWBOT_TOOLS: AiTool[] = QA_TOOLS.map(chowbotToolFromMcp)
