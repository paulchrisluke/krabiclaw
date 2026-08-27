import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'

export type McpPageInfo = {
  has_more: boolean
  next_cursor: string | null
}

type McpCursorPayload = {
  v: 1
  resource: string
  offset: number
  revision?: string
}

function encodeMcpCursor(payload: McpCursorPayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  let binary = ''
  bytes.forEach(byte => { binary += String.fromCharCode(byte) })
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function decodeMcpCursor(cursor: string): McpCursorPayload {
  try {
    const padded = cursor.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(cursor.length / 4) * 4, '=')
    const bytes = Uint8Array.from(atob(padded), char => char.charCodeAt(0))
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as Partial<McpCursorPayload>
    if (payload.v !== 1 || typeof payload.resource !== 'string' || !Number.isInteger(payload.offset) || (payload.offset ?? -1) < 0) {
      throw new Error('invalid cursor payload')
    }
    if (payload.revision !== undefined && typeof payload.revision !== 'string') throw new Error('invalid cursor revision')
    return payload as McpCursorPayload
  } catch {
    throw mcpProtocolError(MCP_ERROR.invalidParams, 'Invalid pagination cursor. Read the first page again.')
  }
}

export function paginateMcpCollection<T>(
  items: readonly T[],
  args: Record<string, unknown>,
  options: { resource: string; revision?: string },
): { items: T[]; page_info: McpPageInfo } {
  const rawLimit = args.limit
  const limit = rawLimit === undefined ? 50 : rawLimit
  if (!Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > 100) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, 'limit must be an integer between 1 and 100.')
  }

  let offset = 0
  if (args.cursor !== undefined) {
    if (typeof args.cursor !== 'string' || !args.cursor) {
      throw mcpProtocolError(MCP_ERROR.invalidParams, 'cursor must be a non-empty string.')
    }
    const cursor = decodeMcpCursor(args.cursor)
    if (cursor.resource !== options.resource) {
      throw mcpProtocolError(MCP_ERROR.invalidParams, 'Pagination cursor does not belong to this resource.')
    }
    if (cursor.revision !== options.revision) {
      throw mcpProtocolError(MCP_ERROR.invalidParams, 'This resource changed between pages. Read the first page again.')
    }
    offset = cursor.offset
  }

  const page = items.slice(offset, offset + Number(limit))
  const nextOffset = offset + page.length
  const hasMore = nextOffset < items.length
  return {
    items: page,
    page_info: {
      has_more: hasMore,
      next_cursor: hasMore ? encodeMcpCursor({ v: 1, resource: options.resource, offset: nextOffset, revision: options.revision }) : null,
    },
  }
}
