import { randomUUID } from 'node:crypto'
import { expect, type APIRequestContext } from '@playwright/test'
import { loginAs } from './auth'

export const MCP_VERSION = '2025-06-18'
// Fixed fixture sites seeded by generate-demo-seed.ts with the matching plan already
// active. Entitlement checks are site-scoped (hasSiteEntitlement), so a plan-gated tool
// call needs the org's actual paid site, not a brand-new site from ensureSite() (which
// always starts on `free` per the second-site billing rule).
export const MCP_GROWTH_SITE_ID = 'site-mcp-growth'
export const MCP_GROWTH_SERVICE_SITE_ID = 'site-mcp-growth-service'

export async function mcpRequest(
  request: APIRequestContext,
  baseURL: string,
  options: {
    method: 'initialize' | 'notifications/initialized' | 'server/discover' | 'tools/list' | 'tools/call' | 'resources/list' | 'resources/read' | 'bad/method'
    id?: string | number
    siteId?: string
    toolName?: string
    args?: Record<string, unknown>
    extraHeaders?: Record<string, string>
    params?: Record<string, unknown>
    idempotent?: boolean
  },
) {
  const payload = {
    jsonrpc: '2.0',
    id: options.id ?? `${options.method}-${Date.now()}`,
    method: options.method,
    params: options.params ?? (options.method === 'tools/call'
      ? { name: options.toolName, arguments: options.args ?? {} }
      : options.siteId ? { site_id: options.siteId } : {}),
    _meta: {
      'io.modelcontextprotocol/version': MCP_VERSION,
      'io.modelcontextprotocol/method': options.method,
      ...(options.method === 'tools/call' && options.toolName ? { 'io.modelcontextprotocol/name': options.toolName } : {}),
    },
  }

  const requestId = randomUUID()
  const startedAt = Date.now()
  const diagnostic = { requestId, method: options.method, tool: options.toolName ?? null }
  console.info('[e2e-mcp]', JSON.stringify({ event: 'started', ...diagnostic }))
  try {
    const response = await request.post(`${baseURL}/api/mcp`, {
      maxRetries: options.idempotent ? 1 : 0,
      headers: {
        'content-type': 'application/json',
        'mcp-protocol-version': MCP_VERSION,
        'mcp-method': options.method,
        ...(options.method === 'tools/call' && options.toolName ? { 'mcp-name': options.toolName } : {}),
        ...(options.extraHeaders ?? {}),
        'x-request-id': requestId,
      },
      data: payload,
    })
    console.info('[e2e-mcp]', JSON.stringify({
      event: 'finished', ...diagnostic, durationMs: Date.now() - startedAt,
      status: response.status(), rayId: response.headers()['cf-ray'] ?? null,
      serverTiming: response.headers()['server-timing'] ?? null,
    }))
    return response
  } catch {
    // Playwright errors include request headers, including session credentials.
    console.error('[e2e-mcp]', JSON.stringify({ event: 'transport_failed', ...diagnostic, durationMs: Date.now() - startedAt }))
    throw new Error(`MCP transport failed: ${options.method} ${options.toolName ?? ''}; requestId=${requestId}`)
  }
}

// Extracts typed data from a tools/call result and preserves protocol/tool
// failures as test failures with the server's error text.
export function mcpData<T>(body: { error?: unknown; result?: { isError?: boolean; content?: Array<{ type?: string; text?: string }>; structuredContent?: unknown } }): T {
  if (body.error) {
    throw new Error(`MCP request failed: ${JSON.stringify(body.error)}`)
  }
  if (body.result?.isError) {
    const message = body.result.content
      ?.map(item => item.text)
      .filter((text): text is string => typeof text === 'string' && text.length > 0)
      .join('\n')
    throw new Error(`MCP tool call failed: ${message || 'unknown error'}`)
  }
  if (body.result?.structuredContent && typeof body.result.structuredContent === 'object') {
    return body.result.structuredContent as T
  }
  throw new Error('MCP tool response contained no result.structuredContent')
}

type McpToolCallBody = {
  error?: unknown
  result?: {
    isError?: boolean
    content?: Array<{ type?: string; text?: string }>
    structuredContent?: unknown
  }
}

export async function ensureSite(request: APIRequestContext, baseURL: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
  const res = await mcpRequest(request, baseURL, {
    method: 'tools/call',
    toolName: 'create_site',
    args: {
      name: `MCP E2E ${suffix}`,
      subdomain: `e2e-mcp-${suffix}`,
      vertical: 'restaurant',
    },
  })

  const responseBody = await res.text()
  expect(res.status(), `create_site HTTP response: ${responseBody}`).toBe(200)

  let body: McpToolCallBody
  try {
    body = JSON.parse(responseBody) as McpToolCallBody
  } catch {
    throw new Error(`create_site returned invalid JSON: ${responseBody}`)
  }

  const data = mcpData<{ siteId: string }>(body)
  const siteId = data.siteId
  expect(siteId).toEqual(expect.any(String))
  return siteId
}

export async function ensureLocation(request: APIRequestContext, baseURL: string, siteId: string) {
  const locations = await mcpRequest(request, baseURL, {
    method: 'tools/call',
    toolName: 'list_locations',
    args: { site_id: siteId },
  })
  expect(locations.status()).toBe(200)
  const locationsBody = await locations.json()
  let locationId = mcpData<{ locations: Array<{ id: string }> }>(locationsBody).locations[0]?.id
  if (!locationId) {
    const createLocation = await mcpRequest(request, baseURL, {
      method: 'tools/call',
      toolName: 'create_location',
      args: { site_id: siteId, title: `MCP Location ${Date.now()}`, city: 'Krabi' },
    })
    expect(createLocation.status()).toBe(200)
    const locationBody = await createLocation.json()
    const locationData = mcpData<{ id: string }>(locationBody)
    locationId = locationData.id
  }
  expect(locationId).toEqual(expect.any(String))
  return locationId as string
}

// Unlike ensureLocation, this never reuses an existing fixture location — tests that
// later call delete_location must create their own scratch location, otherwise running
// tests can race over the same shared fixture location and delete it out from under
// each other.
export async function createScratchLocation(request: APIRequestContext, baseURL: string, siteId: string) {
  const createLocation = await mcpRequest(request, baseURL, {
    method: 'tools/call',
    toolName: 'create_location',
    args: { site_id: siteId, title: `MCP Scratch Location ${Date.now()}`, city: 'Krabi' },
  })
  expect(createLocation.status()).toBe(200)
  const locationBody = await createLocation.json()
  const locationData = mcpData<{ id: string }>(locationBody)
  const locationId = locationData.id
  expect(locationId).toEqual(expect.any(String))
  return locationId as string
}

export async function loginAsFreshMcpUser(request: APIRequestContext, baseURL: string, label: string) {
  const userId = `user-e2e-mcp-fresh-${label}`
  await loginAs(request, baseURL, userId)
  return userId
}
