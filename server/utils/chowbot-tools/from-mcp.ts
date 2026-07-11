// Derives ChowBot's AiTool schema from an MCP McpToolDefinition, so a tool's
// argument shape has one source of truth instead of two hand-maintained
// copies. site_id is stripped since ChowBot already knows its own site from
// dashboard/WhatsApp context, unlike the MCP surface which takes it per call.
import type { AiTool } from '~/server/utils/ai-gateway'
import type { McpToolDefinition } from '~/server/utils/mcp-tools/shared'

export function chowbotToolFromMcp(tool: McpToolDefinition): AiTool {
  const schemaProperties = (tool.inputSchema.properties ?? {}) as Record<string, unknown>
  const { site_id: _siteId, ...properties } = schemaProperties
  const schemaRequired = (tool.inputSchema.required ?? []) as string[]
  const required = schemaRequired.filter((key) => key !== 'site_id')
  return {
    name: tool.name,
    description: tool.description,
    input_schema: { type: 'object', properties, required },
  }
}
