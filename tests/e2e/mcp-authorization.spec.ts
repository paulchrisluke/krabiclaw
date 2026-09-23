import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'
import { mcpRequest, loginAsFreshMcpUser } from './helpers/mcp'

// Split out of mcp.spec.ts (authorization/isolation tests) — see
// helpers/mcp.ts for why. Two boundaries: what a role may see and invoke on a
// tenant it belongs to, and what any principal may see and invoke on a tenant
// it does not.

test.describe('stateless MCP server', () => {
  // Discovery and execution are one boundary, not two: a tool the role may not
  // use must be absent from its catalog AND refuse the call, because a client
  // that guesses the name never reads the catalog.
  test('a role sees and can invoke only its own tools', async ({ request, baseURL }) => {
    await loginAs(request, baseURL!, 'user-e2e-pottery-editor')
    const organizationId = 'org-user-pottery-house'

    const listForOrg = await mcpRequest(request, baseURL!, { method: 'tools/list', organizationId })
    expect(listForOrg.status()).toBe(200)
    const toolNames = ((await listForOrg.json()) as { result: { tools: Array<{ name: string }> } })
      .result.tools.map(tool => tool.name)
    expect(toolNames).toContain('update_tenant_page')
    expect(toolNames).not.toContain('set_default_currency')

    // isError alone is not proof of a denial: a tool body can answer with
    // isError for its own reasons, so a regressed role guard that let the
    // editor reach the implementation would still look green. requireMcpOrganization
    // refuses below the tool's minimumRole with 403 'Insufficient permissions',
    // and that is the string this contract is about. set_default_currency is
    // admin-only; the reviews surface is read-only and has no reply tool.
    const editorWrite = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'set_default_currency',
      args: { organization_id: organizationId, currency: 'USD' },
    })
    expect(editorWrite.status()).toBe(200)
    const editorWriteBody = await editorWrite.json() as {
      result?: { isError?: boolean; content?: Array<{ text?: string }> }
    }
    expect(editorWriteBody.result?.isError).toBe(true)
    expect(editorWriteBody.result?.content?.[0]?.text).toBe('Insufficient permissions')
  })

  test('a tenant the principal cannot reach yields no tools and no writes', async ({ request, baseURL }) => {
    await loginAsFreshMcpUser(request, baseURL!, 'inaccessible')
    const missingOrganizationId = `org-missing-${Date.now()}`

    const wrongOrgTools = await mcpRequest(request, baseURL!, { method: 'tools/list', organizationId: missingOrganizationId })
    expect(wrongOrgTools.status()).toBe(200)
    expect(((await wrongOrgTools.json()) as { result: { tools: unknown[] } }).result.tools).toEqual([])

    // A blank header is not "no tenant selected": it names a tenant that
    // resolves to nothing, and must fail closed the same way.
    const blankOrgTools = await mcpRequest(request, baseURL!, {
      method: 'tools/list',
      extraHeaders: { 'x-krabiclaw-organization-id': '   ' },
    })
    expect(blankOrgTools.status()).toBe(200)
    expect(((await blankOrgTools.json()) as { result: { tools: unknown[] } }).result.tools).toEqual([])

    const wrongOrg = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_organization',
      args: { organization_id: missingOrganizationId },
    })
    expect(wrongOrg.status()).toBe(200)
    expect((await wrongOrg.json()).result?.isError).toBe(true)
  })
})
