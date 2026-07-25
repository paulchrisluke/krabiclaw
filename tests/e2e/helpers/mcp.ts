import { expect, type APIRequestContext } from '@playwright/test'
import { loginAs } from './auth'

// Shared by every tests/e2e/mcp-*.spec.ts file — split out of one 1600+
// line mcp.spec.ts (issue: hard to triage which subsystem broke, and the
// file ran ~12 minutes serialized against the shared preview deployment)
// into media/content/owner-tools/authorization files that all depend on
// these same request/fixture helpers.

export const MCP_VERSION = '2025-06-18'
// Fixed fixture sites seeded by generate-demo-seed.ts with the matching plan already
// active. Entitlement checks are site-scoped (hasSiteEntitlement), so a plan-gated tool
// call needs the org's actual paid site, not a brand-new site from ensureSite() (which
// always starts on `free` per the second-site billing rule).
export const MCP_GROWTH_SITE_ID = 'site-mcp-growth'
export const MCP_MANAGED_SITE_ID = 'site-mcp-managed'

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

  return request.post(`${baseURL}/api/mcp`, {
    headers: {
      'content-type': 'application/json',
      'mcp-protocol-version': MCP_VERSION,
      'mcp-method': options.method,
      ...(options.method === 'tools/call' && options.toolName ? { 'mcp-name': options.toolName } : {}),
      ...(options.extraHeaders ?? {}),
    },
    data: payload,
  })
}

// Extracts typed data from a tools/call result.
// Handles both the current spec format { type: 'text', text: string }
// and the legacy format { type: 'json', json: object }.
// Also handles renderStructuredResponse responses where text may be human-readable fallback.
export function mcpData<T>(body: { result?: { content?: Array<{ type?: string; text?: string; json?: unknown }>; structuredContent?: unknown }; structuredContent?: unknown }): T {
  // Prefer structuredContent if available (from renderStructuredResponse)
  if (body.result?.structuredContent && typeof body.result.structuredContent === 'object') {
    return body.result.structuredContent as T
  }
  if (body.structuredContent && typeof body.structuredContent === 'object') {
    return body.structuredContent as T
  }
  const item = body.result?.content?.[0]
  if (!item) return {} as T
  if (item.type === 'json' && typeof item.json === 'object') {
    return item.json as T
  }
  if (item.type === 'text' && typeof item.text === 'string') {
    try {
      return JSON.parse(item.text) as T
    } catch {
      // Text is not JSON (e.g., renderStructuredResponse fallbackText)
      // Return empty object to avoid breaking tests that expect structured data
      return {} as T
    }
  }
  return {} as T
}

export async function ensureSite(request: APIRequestContext, baseURL: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
  const res = await mcpRequest(request, baseURL, {
    method: 'tools/call',
    toolName: 'create_site',
    args: {
      name: `MCP E2E ${suffix}`,
      subdomain: `mcp-e2e-${suffix}`,
      vertical: 'restaurant',
    },
  })
  if (res.status() !== 200) console.error(await res.text()); expect(res.status()).toBe(200)
  const body = await res.json()
  const siteId = mcpData<{ siteId?: string }>(body).siteId
  expect(siteId).toEqual(expect.any(String))
  return siteId as string
}

export async function getSiteOrg(request: APIRequestContext, baseURL: string, siteId: string) {
  const res = await request.get(`${baseURL}/api/sites/${siteId}`)
  if (res.status() !== 200) console.error(await res.text()); expect(res.status()).toBe(200)
  const body = await res.json() as { organization_id: string }
  return body.organization_id
}

export async function ensureLocation(request: APIRequestContext, baseURL: string, siteId: string) {
  const locations = await mcpRequest(request, baseURL, {
    method: 'tools/call',
    toolName: 'list_locations',
    args: { site_id: siteId },
  })
  expect(locations.status()).toBe(200)
  const locationsBody = await locations.json()
  let locationId = mcpData<{ locations?: Array<{ id: string }> }>(locationsBody).locations?.[0]?.id
  if (!locationId) {
    const createLocation = await mcpRequest(request, baseURL, {
      method: 'tools/call',
      toolName: 'create_location',
      args: { site_id: siteId, title: `MCP Location ${Date.now()}`, city: 'Krabi' },
    })
    expect(createLocation.status()).toBe(200)
    const locationBody = await createLocation.json()
    const locationData = mcpData<{ id?: string; location?: { id?: string } }>(locationBody)
    locationId = locationData.id ?? locationData.location?.id
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
  const locationData = mcpData<{ id?: string; location?: { id?: string } }>(locationBody)
  const locationId = locationData.id ?? locationData.location?.id
  expect(locationId).toEqual(expect.any(String))
  return locationId as string
}

export async function loginAsFreshMcpUser(request: APIRequestContext, baseURL: string) {
  const userId = `e2e-mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  await loginAs(request, baseURL, userId)
  return userId
}
