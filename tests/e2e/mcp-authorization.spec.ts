import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'
import { mcpRequest, loginAsFreshMcpUser } from './helpers/mcp'

// Split out of mcp.spec.ts (authorization/isolation tests) — see
// helpers/mcp.ts for why. Two boundaries: what a role may see and invoke on a
// site it belongs to, and what any principal may see and invoke on a site it
// does not.

test.describe('stateless MCP server', () => {
  // Discovery and execution are one boundary, not two: a tool the role may not
  // use must be absent from its catalog AND refuse the call, because a client
  // that guesses the name never reads the catalog.
  test('a role sees and can invoke only its own tools @smoke', async ({ request, baseURL }) => {
    await loginAs(request, baseURL!, 'user-e2e-pottery-editor')
    const siteId = 'site-pottery-house'

    const listForSite = await mcpRequest(request, baseURL!, { method: 'tools/list', siteId })
    expect(listForSite.status()).toBe(200)
    const toolNames = ((await listForSite.json()) as { result: { tools: Array<{ name: string }> } })
      .result.tools.map(tool => tool.name)
    expect(toolNames).toContain('update_tenant_page')
    expect(toolNames).not.toContain('set_default_currency')

    // isError alone is not proof of a denial: a tool body can answer with
    // isError for its own reasons, so a regressed role guard that let the
    // editor reach the implementation would still look green. requireMcpSite
    // refuses below the tool's minimumRole with 403 'Insufficient permissions',
    // and that is the string this contract is about. set_default_currency is
    // admin-only; the reviews surface is read-only and has no reply tool.
    const editorWrite = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'set_default_currency',
      args: { site_id: siteId, currency: 'USD' },
    })
    expect(editorWrite.status()).toBe(200)
    const editorWriteBody = await editorWrite.json() as {
      result?: { isError?: boolean; content?: Array<{ text?: string }> }
    }
    expect(editorWriteBody.result?.isError).toBe(true)
    expect(editorWriteBody.result?.content?.[0]?.text).toBe('Insufficient permissions')
  })

  test('a site the principal cannot reach yields no tools and no writes', async ({ request, baseURL }) => {
    await loginAsFreshMcpUser(request, baseURL!, 'inaccessible')
    const missingSiteId = `site-missing-${Date.now()}`

    const wrongSiteTools = await mcpRequest(request, baseURL!, { method: 'tools/list', siteId: missingSiteId })
    expect(wrongSiteTools.status()).toBe(200)
    expect(((await wrongSiteTools.json()) as { result: { tools: unknown[] } }).result.tools).toEqual([])

    // A blank header is not "no site selected": it names a site that resolves
    // to nothing, and must fail closed the same way.
    const blankSiteTools = await mcpRequest(request, baseURL!, {
      method: 'tools/list',
      extraHeaders: { 'x-krabiclaw-site-id': '   ' },
    })
    expect(blankSiteTools.status()).toBe(200)
    expect(((await blankSiteTools.json()) as { result: { tools: unknown[] } }).result.tools).toEqual([])

    const wrongSite = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_site',
      args: { site_id: missingSiteId },
    })
    expect(wrongSite.status()).toBe(200)
    expect((await wrongSite.json()).result?.isError).toBe(true)
  })
})
