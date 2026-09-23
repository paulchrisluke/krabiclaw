import { randomUUID } from 'node:crypto'
import { expect, type APIRequestContext, type APIResponse } from '@playwright/test'
import { authRequestHeaders, loginAs } from './auth'

// The Streamable HTTP transport requires clients to accept both
// application/json and text/event-stream (see the Accept header below), and
// @modelcontextprotocol/server reserves the right to answer with either —
// our own stateless tool calls always resolve a single terminal result, but
// the SDK still wraps it as a one-event SSE stream rather than a plain JSON
// body. Real MCP clients already have to handle both; this makes
// mcpRequest()'s return value do the same so every existing `.json()` call
// site across the e2e suite keeps working unchanged.
export async function mcpJson<T>(response: APIResponse): Promise<T> {
  return parseMcpResponseBody<T>(response)
}

async function parseMcpResponseBody<T>(response: APIResponse): Promise<T> {
  const contentType = response.headers()['content-type'] ?? ''
  const text = await response.text()
  if (!contentType.includes('text/event-stream')) return JSON.parse(text) as T
  const dataLines = text.split('\n')
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice('data:'.length).trim())
  if (dataLines.length === 0) throw new Error(`SSE response carried no data: line(s): ${text.slice(0, 200)}`)
  return JSON.parse(dataLines.join('')) as T
}

function withMcpJson(response: APIResponse): APIResponse {
  return new Proxy(response, {
    get(target, prop, receiver) {
      if (prop === 'json') return () => parseMcpResponseBody(target)
      return Reflect.get(target, prop, receiver)
    },
  })
}

export const MCP_VERSION = '2025-06-18'
// Fixed fixture sites retained in the production snapshot with the matching plan already
// active. Entitlement checks are site-scoped (hasSiteEntitlement), so a plan-gated tool
// call needs the org's actual paid organization, not a brand-new one from
// ensureOrganization() (which always starts on `free`).
export const MCP_GROWTH_ORGANIZATION_ID = 'org-demo'

export async function mcpRequest(
  request: APIRequestContext,
  baseURL: string,
  options: {
    method: 'initialize' | 'notifications/initialized' | 'server/discover' | 'tools/list' | 'tools/call' | 'resources/list' | 'resources/read' | 'bad/method'
    id?: string | number
    organizationId?: string
    toolName?: string
    args?: Record<string, unknown>
    extraHeaders?: Record<string, string>
    params?: Record<string, unknown>
    idempotent?: boolean
  },
) {
  // Plain, standard JSON-RPC 2.0 — no `_meta['io.modelcontextprotocol/...']`
  // claim and no `mcp-protocol-version`/`mcp-method`/`mcp-name` headers.
  // Those were the old hand-rolled protocol layer's header/meta fallback for
  // resolving method/tool name; @modelcontextprotocol/server reads `method`
  // and `params.name`/`params.arguments` from the body per spec, and treats
  // any `_meta['io.modelcontextprotocol/...']` key as a modern-protocol
  // envelope claim — which this legacy-era (2025-06-18) suite doesn't carry
  // the rest of (e.g. `clientCapabilities`), so every request was rejected
  // as a malformed modern envelope regardless of method.
  // A JSON-RPC notification (notifications/initialized) must carry no `id`
  // at all — that's the spec's own distinction between a notification (no
  // response expected, 202 Accepted) and a request (a real result). This
  // helper used to attach an id unconditionally, silently turning that
  // notification into a request the SDK correctly answers as one (200 with
  // a result) instead of 202.
  const isNotification = options.method.startsWith('notifications/')
  const payload = {
    jsonrpc: '2.0',
    ...(isNotification ? {} : { id: options.id ?? `${options.method}-${Date.now()}` }),
    method: options.method,
    params: options.params ?? (options.method === 'tools/call'
      ? { name: options.toolName, arguments: options.args ?? {} }
      : {}),
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
        // The Streamable HTTP transport requires clients to declare both
        // response formats they accept; @modelcontextprotocol/server answers
        // 406 without this (the old hand-rolled route never checked Accept).
        accept: 'application/json, text/event-stream',
        // organization_id is a KrabiClaw extension for tenant-scoped
        // tools/list discovery, not part of the MCP spec's
        // ListToolsRequestParams — the SDK validates that against the spec's
        // schema (only cursor/_meta) and silently drops anything else, so it
        // has to travel as a header instead of a JSON-RPC param.
        ...(options.organizationId ? { 'x-krabiclaw-organization-id': options.organizationId } : {}),
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
    return withMcpJson(response)
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

export async function ensureOrganization(request: APIRequestContext, baseURL: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
  // POST /api/organizations requires the target organization explicitly. loginAs() made the
  // fixture's membership the active organization; a fixture with no organization
  // (user-e2e-growth-service-owner) gets one through Better Auth's organization
  // API, which also makes it the session's active organization.
  const sessionRes = await request.get(`${baseURL}/api/auth/get-session`)
  expect(sessionRes.ok(), await sessionRes.text()).toBe(true)
  const body = await sessionRes.json() as { session?: { activeOrganizationId?: string | null } } | null
  expect(body?.session, 'ensureOrganization requires an authenticated session').toBeTruthy()
  let organizationId = body!.session!.activeOrganizationId ?? null
  if (!organizationId) {
    const created = await request.post(`${baseURL}/api/auth/organization/create`, {
      headers: authRequestHeaders(baseURL),
      data: { name: `MCP E2E Org ${suffix}`, slug: `e2e-mcp-org-${suffix}` },
    })
    expect(created.ok(), await created.text()).toBe(true)
    organizationId = (await created.json() as { id: string }).id
  }
  const res = await request.post(`${baseURL}/api/organizations`, {
    // A tenant created here is live immediately, so it states the currency its
    // prices are quoted in rather than inheriting one nobody chose.
    data: { name: `MCP E2E ${suffix}`, subdomain: `e2e-mcp-${suffix}`, vertical: 'restaurant', organizationId, defaultCurrency: 'THB' },
  })
  // The fixture's organization is reused deliberately — it carries the growth
  // subscription these tools are gated on — and it is already provisioned under
  // its own subdomain. Provisioning it again under a fresh e2e-mcp-* one would
  // rewrite a live tenant's address, status and vertical in place, so the route
  // refuses it, and that refusal is precisely what this helper wanted to know.
  // Only the exact 409 counts; any other non-2xx is still a failure.
  if (res.status() === 409) {
    expect(await res.text()).toContain('already provisioned')
    return organizationId
  }
  expect(res.ok(), await res.text()).toBe(true)
  const created = await res.json() as { organizationId: string }
  expect(created.organizationId).toEqual(expect.any(String))
  return created.organizationId
}

export async function ensureLocation(request: APIRequestContext, baseURL: string, organizationId: string) {
  const locations = await mcpRequest(request, baseURL, {
    method: 'tools/call',
    toolName: 'list_locations',
    args: { organization_id: organizationId },
  })
  expect(locations.status()).toBe(200)
  const locationsBody = await locations.json()
  const data = mcpData<{ locations: Array<{ id: string }> }>(locationsBody)
  // The fixture tenant has exactly two locations, and that is a fact about the
  // fixture rather than a range. Asserting "at least one" would pass if a test
  // leaked a third, which is how the scratch locations this suite creates go
  // unnoticed. The choice is pinned by id so a new location cannot silently
  // change which one a test edits.
  expect(data.locations.map(location => location.id).sort(), 'fixture tenant locations')
    .toEqual(['loc-demo', 'loc-demo-2'])
  return [...data.locations].sort((left, right) => left.id.localeCompare(right.id))[0]!.id
}

// Create disposable locations through the same API the CMS uses. That endpoint
// is route-scoped: it reads the organization from the `org` query the dashboard
// transport sends and refuses the request without it, so the helper resolves
// the same slug the dashboard URL would carry.
async function dashboardScope(request: APIRequestContext, baseURL: string, organizationId: string) {
  const orgRes = await request.get(`${baseURL}/api/auth/organization/get-full-organization`)
  expect(orgRes.ok(), await orgRes.text()).toBe(true)
  const { id, slug: org } = await orgRes.json() as { id: string; slug: string }
  expect(org, 'The session has no active organization to scope the request to').toEqual(expect.any(String))
  expect(id, `Organization ${organizationId} is not the session's active organization`).toBe(organizationId)
  return `org=${encodeURIComponent(org)}`
}

// The endpoint answers with the new location's slug; the id comes from the same
// list the dashboard reads.
export async function createScratchLocation(request: APIRequestContext, baseURL: string, organizationId: string) {
  const scope = await dashboardScope(request, baseURL, organizationId)
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
