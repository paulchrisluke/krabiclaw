import { expect, test, request as playwrightRequest, type APIRequestContext } from '@playwright/test'
import { devLoginHeaders } from './test-env'
import { loginAs } from './helpers/auth'
import { MCP_FREE_USER_ID } from './helpers/plan-fixtures'
import { mcpRequest, ensureSite, getSiteOrg, ensureLocation, loginAsFreshMcpUser } from './helpers/mcp'

// Split out of mcp.spec.ts (authorization/isolation tests) — see
// helpers/mcp.ts for why. This group covers role-based tool visibility,
// fail-closed behavior for inaccessible sites, cross-tenant isolation, and
// owner/admin-only tool gating (e.g. review replies) through MCP.

test.describe('stateless MCP server', () => {
  test('site-scoped tool visibility follows current roles', async ({ request, baseURL }) => {
    await loginAsFreshMcpUser(request, baseURL!)
    const siteId = await ensureSite(request, baseURL!)
    const organizationId = await getSiteOrg(request, baseURL!, siteId)

    const editorCreate = await request.post(`${baseURL}/api/dev/test-member`, {
      headers: devLoginHeaders(),
      data: { role: 'editor', organizationId },
    })
    expect(editorCreate.status()).toBe(200)
    const editorBody = await editorCreate.json() as { user: { id: string } }

    await loginAs(request, baseURL!, editorBody.user.id)

    const listForSite = await mcpRequest(request, baseURL!, {
      method: 'tools/list',
      siteId,
    })
    expect(listForSite.status()).toBe(200)
    const toolsBody = await listForSite.json() as { result: { tools: Array<{ name: string }> } }
    const toolNames = toolsBody.result.tools.map(tool => tool.name)
    expect(toolNames).toContain('update_page_content')
    expect(toolNames).not.toContain('update_notification_settings')
    expect(toolNames).not.toContain('get_google_business_auth_url')
  })

  test('site-scoped tools/list fails closed for inaccessible site ids', async ({ request, baseURL }) => {
    await loginAsFreshMcpUser(request, baseURL!)

    const wrongSiteTools = await mcpRequest(request, baseURL!, {
      method: 'tools/list',
      siteId: `site-missing-${Date.now()}`,
    })
    expect(wrongSiteTools.status()).toBe(200)
    const wrongSiteToolsBody = await wrongSiteTools.json() as { result: { tools: Array<{ name: string }> } }
    expect(wrongSiteToolsBody.result.tools).toEqual([])

    const blankSiteTools = await mcpRequest(request, baseURL!, {
      method: 'tools/list',
      params: { site_id: '   ' },
    })
    expect(blankSiteTools.status()).toBe(200)
    const blankSiteToolsBody = await blankSiteTools.json() as { result: { tools: Array<{ name: string }> } }
    expect(blankSiteToolsBody.result.tools).toEqual([])
  })

  test('wrong-site MCP tool calls fail', async ({ request, baseURL }) => {
    await loginAsFreshMcpUser(request, baseURL!)

    const wrongSite = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_site',
      args: { site_id: `site-missing-${Date.now()}` },
    })
    expect(wrongSite.status()).toBe(200)
    expect((await wrongSite.json()).result?.isError).toBe(true)
  })

  test('translation, google business, and work request tools are hidden from the conversational surface by default', async ({ request, baseURL }) => {
    await loginAs(request, baseURL!, MCP_FREE_USER_ID)
    const siteId = await ensureSite(request, baseURL!)

    const toolsList = await mcpRequest(request, baseURL!, {
      method: 'tools/list',
      siteId,
    })
    expect(toolsList.status()).toBe(200)
    const toolsBody = await toolsList.json() as { result: { tools: Array<{ name: string }> } }
    const toolNames = toolsBody.result.tools.map(t => t.name)
    expect(toolNames).not.toContain('get_translation_inventory')
    expect(toolNames).not.toContain('start_translation_job')
    expect(toolNames).not.toContain('publish_translations')
    expect(toolNames).not.toContain('list_google_business_accounts')
    expect(toolNames).not.toContain('sync_google_business_locations')
    expect(toolNames).not.toContain('list_work_requests')
    expect(toolNames).not.toContain('create_work_request')

    // Blocked by the conversational-surface flag (see conversational-tool-surface.ts) before
    // ever reaching the free-plan entitlement check, so these now 404 (methodNotFound) rather
    // than the old plan-based 403 — CI runs with CONVERSATIONAL_TOOLS_*_ENABLED unset, matching
    // production default.
    const inventoryCall = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_translation_inventory',
      args: { site_id: siteId, locale: 'th' },
    })
    expect(inventoryCall.status()).toBe(200)
    expect((await inventoryCall.json()).error?.code).toBe(-32601)

    const startJobCall = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'start_translation_job',
      args: { site_id: siteId, locale: 'th' },
    })
    expect(startJobCall.status()).toBe(200)
    expect((await startJobCall.json()).error?.code).toBe(-32601)

    const locationId = await ensureLocation(request, baseURL!, siteId)
    const gbConnectionCall = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_google_business_connection',
      args: { site_id: siteId, location_id: locationId },
    })
    expect(gbConnectionCall.status()).toBe(200)
    expect((await gbConnectionCall.json()).error?.code).toBe(-32601)
  })

  // Grouped so siteA/siteB and the logged-in-as-site-B-owner session are
  // created once (in beforeAll) and shared by all three tests below, instead
  // of each test independently calling ensureSite() twice (a full
  // site-creation flow, not a cheap operation) — was 3 tests x 2 site
  // creations = 6 total; now 2 total. Cross-tenant isolation tests were
  // intermittently timing out under preview-deploy cold-start load
  // (mcpRequest/ensureSite round trips each paying real latency); this
  // reduces the total request volume this group puts on the preview Worker
  // rather than papering over it with a longer timeout.
  //
  // Playwright's built-in `request` fixture cannot be reused across
  // beforeAll and a test — it's disposed the instant beforeAll returns (see
  // node_modules/playwright's own fixture implementation and
  // https://playwright.dev/docs/api-testing#sending-api-requests-from-ui-tests).
  // A manually created/disposed APIRequestContext is the documented way to
  // share authenticated state across hooks and tests in one file.
  test.describe('cross-tenant isolation', () => {
    let siteA: string
    let siteB: string
    let sharedRequest: APIRequestContext

    test.beforeAll(async ({ baseURL }) => {
      sharedRequest = await playwrightRequest.newContext()
      await loginAsFreshMcpUser(sharedRequest, baseURL!)
      siteA = await ensureSite(sharedRequest, baseURL!)
      await loginAsFreshMcpUser(sharedRequest, baseURL!)
      siteB = await ensureSite(sharedRequest, baseURL!)
    })

    test.afterAll(async () => {
      await sharedRequest.dispose()
    })

    test('owner of site B cannot read site A through MCP', async ({ baseURL }) => {
      const crossRead = await mcpRequest(sharedRequest, baseURL!, {
        method: 'tools/call',
        toolName: 'get_site',
        args: { site_id: siteA },
      })
      expect(crossRead.status()).toBe(200)
      expect((await crossRead.json()).result?.isError).toBe(true)
    })

    test('owner of site B cannot mutate site A through MCP', async ({ baseURL }) => {
      const crossMutate = await mcpRequest(sharedRequest, baseURL!, {
        method: 'tools/call',
        toolName: 'update_site_settings',
        args: { site_id: siteA, brand_description: 'cross-tenant injection attempt' },
      })
      expect(crossMutate.status()).toBe(200)
      expect((await crossMutate.json()).result?.isError).toBe(true)
    })

    // Positive control for the isolation tests above — proves the errors
    // there come from cross-tenant isolation and not from the caller's own
    // session/site being broken.
    test('owner can still read their own site (site B) through MCP', async ({ baseURL }) => {
      const ownSiteRead = await mcpRequest(sharedRequest, baseURL!, {
        method: 'tools/call',
        toolName: 'get_site',
        args: { site_id: siteB },
      })
      expect(ownSiteRead.status()).toBe(200)
    })
  })

  // Split into two tests (was one test doing both scenarios sequentially,
  // sharing a single 30s budget across ~7 network round trips: login, site
  // creation, owner reply, editor member creation, editor login, tools/list,
  // editor reply) so each scenario gets its own independent timeout budget.
  test('owner reply to a missing review returns an error through MCP', async ({ request, baseURL }) => {
    await loginAsFreshMcpUser(request, baseURL!)
    const siteId = await ensureSite(request, baseURL!)

    const ownerReply = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'reply_to_review',
      args: { site_id: siteId, review_id: 'missing-review-id', reply: `MCP owner reply ${Date.now()}` },
    })
    expect(ownerReply.status()).toBe(200)
    expect((await ownerReply.json()).result?.isError).toBe(true)
  })

  test('an editor cannot see or use reply_to_review through MCP', async ({ request, baseURL }) => {
    await loginAsFreshMcpUser(request, baseURL!)
    const siteId = await ensureSite(request, baseURL!)
    const organizationId = await getSiteOrg(request, baseURL!, siteId)

    const editorCreate = await request.post(`${baseURL}/api/dev/test-member`, {
      headers: devLoginHeaders(),
      data: { role: 'editor', organizationId },
    })
    expect(editorCreate.status()).toBe(200)
    const editorBody = await editorCreate.json() as { user: { id: string } }
    await loginAs(request, baseURL!, editorBody.user.id)

    const editorTools = await mcpRequest(request, baseURL!, {
      method: 'tools/list',
      siteId,
    })
    expect(editorTools.status()).toBe(200)
    const editorToolsBody = await editorTools.json() as { result: { tools: Array<{ name: string }> } }
    expect(editorToolsBody.result.tools.map(tool => tool.name)).not.toContain('reply_to_review')

    const editorReply = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'reply_to_review',
      args: { site_id: siteId, review_id: 'missing-review-id', reply: 'editor should fail' },
    })
    expect(editorReply.status()).toBe(200)
    expect((await editorReply.json()).result?.isError).toBe(true)
  })
})
