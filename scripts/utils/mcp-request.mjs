// One JSON-RPC 2.0 request to /api/mcp, as @modelcontextprotocol/server reads it:
// the method and tool come from the body, a notification carries no id, and the
// client accepts both JSON and SSE (the transport answers one result as a
// one-event SSE stream, whose data lines are the message).
export async function mcpRequest(baseUrl, method, params = {}, headers = {}, { omitId = false } = {}) {
  const res = await fetch(`${baseUrl}/api/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify({
      jsonrpc: '2.0',
      ...(omitId || method.startsWith('notifications/') ? {} : { id: `${method}-${Date.now()}` }),
      method,
      params,
    }),
  })
  const raw = await res.text()
  const text = (res.headers.get('content-type') ?? '').includes('text/event-stream')
    ? raw.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice('data:'.length).trim()).join('')
    : raw
  let body
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = raw
  }
  return { res, status: res.status, body }
}

export function mcpToolCall(baseUrl, headers, name, args = {}) {
  return mcpRequest(baseUrl, 'tools/call', { name, arguments: args }, headers)
}
