import type { AiTool } from '~/server/utils/ai-gateway'
import { LOCALES_TOOLS } from '~/server/utils/mcp-tools/locales'
import { chowbotToolFromMcp } from './from-mcp'

// Locale management remains available for owners who maintain localized page
// content themselves. Automated translation jobs are not part of this surface.
export const LOCALES_CHOWBOT_TOOLS: AiTool[] = LOCALES_TOOLS.map(chowbotToolFromMcp)
