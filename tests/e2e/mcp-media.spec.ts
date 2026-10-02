import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'
import { MCP_GROWTH_USER_ID } from './helpers/plan-fixtures'
import { MCP_VERSION, MCP_GROWTH_ORGANIZATION_ID, mcpRequest, mcpData } from './helpers/mcp'
import { acquireTenantMutationLock } from './helpers/tenant-mutation-lock'

test.describe('stateless MCP server', () => {
  test('ChatGPT session exposes native media upload', async ({ request, baseURL }) => {
    await loginAs(request, baseURL!, MCP_GROWTH_USER_ID)

    const initialize = await mcpRequest(request, baseURL!, {
      method: 'initialize',
      params: { protocolVersion: MCP_VERSION, capabilities: {}, clientInfo: { name: 'openai-mcp', version: '1.0.0' } },
      extraHeaders: { 'user-agent': 'openai-mcp/1.0.0' },
    })
    expect(initialize.status()).toBe(200)
    const initializeBody = await initialize.json() as { result?: { protocolVersion?: string; capabilities?: { tools?: unknown; resources?: unknown } } }
    expect(initializeBody.result?.protocolVersion).toBe(MCP_VERSION)
    expect(initializeBody.result?.capabilities?.tools).toBeDefined()
    expect(initializeBody.result?.capabilities?.resources).toBeDefined()
    const sessionId = initialize.headers()['mcp-session-id']
    expect(sessionId).toEqual(expect.any(String))

    const initialized = await mcpRequest(request, baseURL!, {
      method: 'notifications/initialized',
      extraHeaders: { 'user-agent': 'openai-mcp/1.0.0', 'mcp-session-id': sessionId! },
    })
    expect(initialized.status()).toBe(202)

    const tools = await mcpRequest(request, baseURL!, {
      method: 'tools/list',
      extraHeaders: { 'user-agent': 'openai-mcp/1.0.0', 'mcp-session-id': sessionId! },
    })
    expect(tools.status()).toBe(200)
    const toolsBody = await tools.json() as { result: { tools: Array<{ name: string, inputSchema?: { required?: string[], properties?: Record<string, unknown>, additionalProperties?: boolean }, outputSchema?: Record<string, unknown>, _meta?: Record<string, unknown> }> } }
    const uploadTool = toolsBody.result.tools.find(tool => tool.name === 'save_media_attachment')
    expect(toolsBody.result.tools.some(tool => tool.name === 'show_generated_images')).toBe(false)
    const removedPicker = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'show_generated_images',
      args: { images: [] },
    })
    expect(removedPicker.status()).toBe(200)
    const removedPickerBody = await removedPicker.json() as { error?: { code?: number, message?: string } }
    expect(removedPickerBody.error?.code).toBe(-32601)
    expect(removedPickerBody.error?.message).toContain('Unknown tool')
    expect(uploadTool?.inputSchema?.required).toEqual(['file'])
    expect(uploadTool?.inputSchema?.properties?.file_id).toBeUndefined()
    expect(uploadTool?.inputSchema?.properties?.poster_file).toBeDefined()
    expect(uploadTool?.inputSchema?.additionalProperties).toBe(false)
    expect(uploadTool?._meta?.['openai/fileParams']).toEqual(['file', 'poster_file'])
    const setMediaTool = toolsBody.result.tools.find(tool => tool.name === 'set_media')
    expect(setMediaTool?.inputSchema?.required).toEqual(['placement', 'asset_id'])
    expect(setMediaTool?.inputSchema?.properties?.placement).toBeDefined()
    expect(setMediaTool?.inputSchema?.additionalProperties).toBe(false)

    const locations = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'list_locations',
      args: { organization_id: MCP_GROWTH_ORGANIZATION_ID },
    })
    expect(locations.status()).toBe(200)
    const locationId = mcpData<{ locations: Array<{ id: string }> }>(await locations.json()).locations[0]?.id
    expect(locationId).toEqual(expect.any(String))

    const mismatchedTarget = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'set_media',
      organizationId: MCP_GROWTH_ORGANIZATION_ID,
      args: {
        organization_id: MCP_GROWTH_ORGANIZATION_ID,
        placement: { owner_type: 'business_location', owner_id: locationId, slot: 'hero' },
        location_id: locationId,
        asset_id: 'media-does-not-matter-for-this-check',
      },
    })
    expect(mismatchedTarget.status()).toBe(200)
    const mismatchedTargetBody = await mismatchedTarget.json() as { result?: { isError?: boolean, content?: Array<{ text?: string }> } }
    expect(mismatchedTargetBody.result?.isError).toBe(true)
    expect(mismatchedTargetBody.result?.content?.[0]?.text).toContain('Unknown argument: location_id')
  })

  test('a gallery reorder moves the fixture gallery and get_location reads the new order', async ({ request, baseURL }, testInfo) => {
    const releaseTenantMutationLock = await acquireTenantMutationLock(testInfo, MCP_GROWTH_ORGANIZATION_ID)
    const call = async <T>(toolName: string, args: Record<string, unknown>) => mcpData<T>(await (await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName, args: { organization_id: MCP_GROWTH_ORGANIZATION_ID, ...args },
    })).json())
    const locationId = 'loc-demo-2'
    const placement = { owner_type: 'business_location', owner_id: locationId, slot: 'gallery' }
    let original: string[] = []
    try {
      await loginAs(request, baseURL!, MCP_GROWTH_USER_ID)
      const galleryOrder = async () => (await call<{ location: { media: Array<{ slot: string; asset_id: string }> } }>('get_location', { location_id: locationId }))
        .location.media.filter(item => item.slot === 'gallery').map(item => item.asset_id)
      // The fixture's two-image gallery, in its stored order.
      original = await galleryOrder()
      const [first, second] = original
      expect(second, 'loc-demo-2 fixture gallery has two images').toEqual(expect.any(String))
      await call('reorder_media', { placement, moves: [{ asset_id: second, before_asset_id: first }] })
      expect(await galleryOrder()).toEqual([second, first])
      await call('reorder_media', { placement, moves: [{ asset_id: first, before_asset_id: second }] })
      expect(await galleryOrder()).toEqual([first, second])
    } finally {
      // Put the fixture back in its stored order whatever failed above.
      try {
        if (original.length === 2) await call('reorder_media', { placement, moves: [{ asset_id: original[0], before_asset_id: original[1] }] })
      } finally {
        await releaseTenantMutationLock()
      }
    }
  })
})
