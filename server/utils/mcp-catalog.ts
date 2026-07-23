import { createHash } from 'node:crypto'

export interface McpCatalogToolSnapshot {
  name: string
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, sortValue(nested)]),
  )
}

export function canonicalCatalogSnapshot(tools: McpCatalogToolSnapshot[]) {
  return tools
    .map(tool => ({
      name: tool.name,
      inputSchema: sortValue(tool.inputSchema) as Record<string, unknown>,
      outputSchema: sortValue(tool.outputSchema ?? {}) as Record<string, unknown>,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function serializeCatalogSnapshot(tools: McpCatalogToolSnapshot[]) {
  return JSON.stringify(canonicalCatalogSnapshot(tools))
}

export function catalogFingerprint(tools: McpCatalogToolSnapshot[]) {
  const digest = createHash('sha256').update(serializeCatalogSnapshot(tools)).digest('hex')
  return `sha256:${digest}`
}

export function catalogMeta(tools: McpCatalogToolSnapshot[]) {
  return {
    'krabiclaw/catalogFingerprint': catalogFingerprint(tools),
  }
}
