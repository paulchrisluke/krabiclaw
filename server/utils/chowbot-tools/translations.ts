import type { AiTool } from '~/server/utils/ai-gateway'
import { TRANSLATIONS_TOOLS } from '~/server/utils/mcp-tools/translations'
import { chowbotToolFromMcp } from './from-mcp'

// All 8 tools carry requiredEntitlement: 'translation' on MCP, enforced
// generically by runMcpExecutorToolForChowbot — and all 8 are also behind
// the CONVERSATIONAL_TOOLS_TRANSLATIONS_ENABLED feature flag
// (filterConversationalTools in chowbot-agent.ts). Previously only 2 of the
// 8 were exposed here, so the other 6 were unreachable from ChowBot even
// with the flag on — the case bodies existed in chowbot-agent.ts but there
// was no schema for the model to call them with.
export const TRANSLATIONS_CHOWBOT_TOOLS: AiTool[] = TRANSLATIONS_TOOLS.map(chowbotToolFromMcp)
