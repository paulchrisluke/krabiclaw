import { randomUUID } from 'node:crypto'
import { expect, type APIRequestContext } from '@playwright/test'
import { authRequestHeaders, loginAs } from './auth'

export const MCP_VERSION = '2025-06-18'
// Fixed fixture sites retained in the production snapshot with the matching plan already
// active. Entitlement checks are site-scoped (hasSiteEntitlement), so a plan-gated tool
// call needs the org's actual paid site, not a brand-new site from ensureSite() (which
// always starts on `free` per the second-site billing rule).
export const MCP_GROWTH_SITE_ID = 'site-mcp-growth'

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
    const headers = response.headers()
    console.info('[e2e-mcp]', JSON.stringify({
      event: 'finished', ...diagnostic, durationMs: Date.now() - startedAt,
      status: response.status(), rayId: headers['cf-ray'] ?? null,
      serverRequestId: headers['x-request-id'] ?? null,
      d1Statements: headers['x-d1-query-count'] ?? null,
      d1Batches: headers['x-d1-batch-count'] ?? null,
      d1DurationMs: headers['x-d1-duration-ms'] ?? null,
      serverDurationMs: headers['x-total-duration-ms'] ?? null,
    }))
    return response
  } catch (error) {
    // Playwright puts the full request, cookies included, in the error's call log.
    // The first line is only the failure kind, e.g. "apiRequestContext.post: read ECONNRESET".
    const reason = error instanceof Error ? error.message.split('\n')[0] : String(error)
    console.error('[e2e-mcp]', JSON.stringify({ event: 'transport_failed', ...diagnostic, reason, durationMs: Date.now() - startedAt }))
    // The original error is deliberately not attached as `cause`: its call log carries the cookies.
    // eslint-disable-next-line preserve-caught-error
    throw new Error(`MCP transport failed: ${options.method} ${options.toolName ?? ''}; ${reason}; requestId=${requestId}`)
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

export async function ensureSite(request: APIRequestContext, baseURL: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
  // POST /api/sites requires the target organization explicitly. loginAs() made the
  // fixture's membership the active organization; a fixture with no organization
  // (user-e2e-growth-service-owner) gets one through Better Auth's organization
  // API, which also makes it the session's active organization.
  const sessionRes = await request.get(`${baseURL}/api/auth/get-session`)
  expect(sessionRes.ok(), await sessionRes.text()).toBe(true)
  const body = await sessionRes.json() as { session?: { activeOrganizationId?: string | null } } | null
  expect(body?.session, 'ensureSite requires an authenticated session').toBeTruthy()
  let organizationId = body!.session!.activeOrganizationId ?? null
  if (!organizationId) {
    const created = await request.post(`${baseURL}/api/auth/organization/create`, {
      headers: authRequestHeaders(baseURL),
      data: { name: `MCP E2E Org ${suffix}`, slug: `e2e-mcp-org-${suffix}` },
    })
    expect(created.ok(), await created.text()).toBe(true)
    organizationId = (await created.json() as { id: string }).id
  }
  const res = await request.post(`${baseURL}/api/sites`, {
    data: { name: `MCP E2E ${suffix}`, subdomain: `e2e-mcp-${suffix}`, vertical: 'restaurant', organizationId },
  })
  expect(res.ok(), await res.text()).toBe(true)
  const { siteId } = await res.json() as { siteId: string }
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
  const data = mcpData<{ locations: Array<{ id: string }> }>(locationsBody)
  expect(data.locations, 'A newly provisioned test site has one seeded location').toHaveLength(1)
  return data.locations[0]!.id
}

// Create disposable locations through the same API the CMS uses. That endpoint
// is route-scoped: it reads the organization and site from the `org` and `site`
// query the dashboard transport sends and refuses the request without them, so
// the helper resolves the same pair the dashboard URL would carry. `site` is the
// subdomain, which is what a /dashboard/{orgSlug}/sites/{siteSlug} route holds.
async function dashboardScope(request: APIRequestContext, baseURL: string, siteId: string) {
  const orgRes = await request.get(`${baseURL}/api/auth/organization/get-full-organization`)
  expect(orgRes.ok(), await orgRes.text()).toBe(true)
  const { slug: org } = await orgRes.json() as { slug: string }
  expect(org, 'The session has no active organization to scope the request to').toEqual(expect.any(String))

  const contextRes = await request.get(`${baseURL}/api/dashboard/context?org=${encodeURIComponent(org)}`)
  expect(contextRes.ok(), await contextRes.text()).toBe(true)
  const { sites } = await contextRes.json() as { sites: Array<{ id: string; subdomain: string | null }> }
  const site = sites.find(candidate => candidate.id === siteId)
  expect(site?.subdomain, `Site ${siteId} is not in organization ${org}`).toEqual(expect.any(String))
  return `org=${encodeURIComponent(org)}&site=${encodeURIComponent(site!.subdomain!)}`
}

// The endpoint answers with the new location's slug; the id comes from the same
// list the dashboard reads.
export async function createScratchLocation(request: APIRequestContext, baseURL: string, siteId: string) {
  const scope = await dashboardScope(request, baseURL, siteId)
  const response = await request.post(`${baseURL}/api/dashboard/locations?${scope}`, {
    data: { name: `MCP Scratch Location ${Date.now()}`, details: { city: 'Krabi' } },
  })
  expect(response.status(), await response.text()).toBe(200)
  const { locationSlug } = await response.json() as { locationSlug: string }
  expect(locationSlug).toEqual(expect.any(String))

  const listed = await request.get(`${baseURL}/api/dashboard/locations?${scope}`)
  expect(listed.ok(), await listed.text()).toBe(true)
  const { locations } = await listed.json() as { locations: Array<{ id: string; slug: string }> }
  const created = locations.find(location => location.slug === locationSlug)
  expect(created, `The location created as ${locationSlug} is missing from the dashboard list`).toBeTruthy()
  return created!.id
}

export async function loginAsFreshMcpUser(request: APIRequestContext, baseURL: string, label: string) {
  const userId = `user-e2e-mcp-fresh-${label}`
  await loginAs(request, baseURL, userId)
  return userId
}
