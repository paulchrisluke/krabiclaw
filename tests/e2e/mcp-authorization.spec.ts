import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'
import { mcpRequest, loginAsFreshMcpUser } from './helpers/mcp'

// Split out of mcp.spec.ts (authorization/isolation tests) — see
// helpers/mcp.ts for why. This group covers role-based tool visibility,
// fail-closed behavior for inaccessible sites, cross-tenant isolation, and
// access checks through MCP.

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
      params: { site_id: '   ' },
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

})
