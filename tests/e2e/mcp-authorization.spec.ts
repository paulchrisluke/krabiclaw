import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'
import { mcpRequest, ensureSite, loginAsFreshMcpUser } from './helpers/mcp'

// Split out of mcp.spec.ts (authorization/isolation tests) — see
// helpers/mcp.ts for why. This group covers role-based tool visibility,
// fail-closed behavior for inaccessible sites, cross-tenant isolation, and
// owner/admin-only tool gating (e.g. review replies) through MCP.

test.describe('stateless MCP server', () => {
  test('site-scoped tool visibility follows current roles', async ({ request, baseURL }) => {
    await loginAs(request, baseURL!, 'user-e2e-pottery-editor')
    const siteId = 'site-pottery-house'

    const listForSite = await mcpRequest(request, baseURL!, {
      method: 'tools/list',
      siteId,
    })
    expect(listForSite.status()).toBe(200)
    const toolsBody = await listForSite.json() as { result: { tools: Array<{ name: string }> } }
    const toolNames = toolsBody.result.tools.map(tool => tool.name)
    expect(toolNames).toContain('update_tenant_page')
    expect(toolNames).not.toContain('get_site_domains')
  })

  test('site-scoped tools/list fails closed for inaccessible site ids', async ({ request, baseURL }) => {
    await loginAsFreshMcpUser(request, baseURL!, 'inaccessible')

    const wrongSiteTools = await mcpRequest(request, baseURL!, {
      method: 'tools/list',
      siteId: `site-missing-${Date.now()}`,
    })
    expect(wrongSiteTools.status()).toBe(200)
    const wrongSiteToolsBody = await wrongSiteTools.json() as { result: { tools: Array<{ name: string }> } }
    expect(wrongSiteToolsBody.result.tools).toEqual([])

    const blankSiteTools = await mcpRequest(request, baseURL!, {
      method: 'tools/list',
      extraHeaders: { 'x-krabiclaw-site-id': '   ' },
    })
    expect(blankSiteTools.status()).toBe(200)
    const blankSiteToolsBody = await blankSiteTools.json() as { result: { tools: Array<{ name: string }> } }
    expect(blankSiteToolsBody.result.tools).toEqual([])
  })

  test('wrong-site MCP tool calls fail', async ({ request, baseURL }) => {
    await loginAsFreshMcpUser(request, baseURL!, 'wrong-site')

    const wrongSite = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_site',
      args: { site_id: `site-missing-${Date.now()}` },
    })
    expect(wrongSite.status()).toBe(200)
    expect((await wrongSite.json()).result?.isError).toBe(true)
  })

  test('owner reply to a missing review returns an error through MCP', async ({ request, baseURL }) => {
    await loginAsFreshMcpUser(request, baseURL!, 'owner-reply')
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
    await loginAs(request, baseURL!, 'user-e2e-pottery-editor')
    const siteId = 'site-pottery-house'

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
