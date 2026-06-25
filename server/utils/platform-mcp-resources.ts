import { mcpProtocolError, MCP_ERROR } from '~/server/utils/mcp-protocol'

export interface PlatformMcpResourceDefinition {
  uri: string
  name: string
  description: string
  mimeType: string
}

export const PLATFORM_MCP_RESOURCES: PlatformMcpResourceDefinition[] = [
  {
    uri: 'kc://docs/product-context',
    name: 'KrabiClaw Product & Brand Context',
    description: 'PRODUCT.md — what KrabiClaw is, its MCP surfaces, verticals, business model, and architecture. Read this for product facts before writing or editing platform blog posts or docs.',
    mimeType: 'text/markdown',
  },
]

export async function readPlatformMcpResource(uri: string): Promise<{ uri: string; mimeType: string; text: string }> {
  const resource = PLATFORM_MCP_RESOURCES.find(r => r.uri === uri)
  if (!resource) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, `Unknown resource: ${uri}`)
  }

  const storage = useStorage('assets:platform')
  const text = await storage.getItem('PRODUCT.md') as string | null
  if (!text) {
    throw mcpProtocolError(MCP_ERROR.internal, 'PRODUCT.md asset is missing from the server bundle.')
  }

  return { uri: resource.uri, mimeType: resource.mimeType, text }
}
