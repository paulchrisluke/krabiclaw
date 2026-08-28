import type { AiTool } from '~/server/utils/ai-gateway'
import { PRODUCTS_TOOLS } from '~/server/utils/mcp-tools/products'
import { chowbotToolFromMcp } from './from-mcp'

export const PRODUCTS_CHOWBOT_TOOLS: AiTool[] = PRODUCTS_TOOLS
  .filter(tool => !tool.uiResourceUri)
  .map(chowbotToolFromMcp)
