import type { AiTool } from '~/server/utils/ai-gateway'
import { LOCALES_TOOLS } from '~/server/utils/mcp-tools/locales'
import { chowbotToolFromMcp } from './from-mcp'

// Gated by CONVERSATIONAL_TOOLS_TRANSLATIONS_ENABLED alongside the
// translations domain (see conversational-tool-surface.ts's
// GROUP_TOOL_NAMES.translations, which bundles both mcp-executor domains).
// Previously had no chowbot-tools file at all — the flag existed but had
// nothing to un-hide for locale management.
export const LOCALES_CHOWBOT_TOOLS: AiTool[] = LOCALES_TOOLS.map(chowbotToolFromMcp)
