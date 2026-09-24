import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'
import { MCP_GROWTH_USER_ID } from './helpers/plan-fixtures'
import { MCP_VERSION, MCP_GROWTH_ORGANIZATION_ID, mcpRequest, mcpData } from './helpers/mcp'
import { devLoginHeaders } from './test-env'

const MCP_VIDEO_ATTACHMENT_URL = 'https://media.krabiclaw.com/organizations/org-demo/media/media-demo-pizza-prep-video.mp4'
const MCP_VIDEO_POSTER_URL = 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/0762ea49-0bd2-4cc8-1044-d6c9b1f00100/public'

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
    const uploadTool = toolsBody.result.tools.find(tool => tool.name === 'upload_user_media')
    expect(toolsBody.result.tools.some(tool => tool.name === 'show_generated_images')).toBe(false)
    const generatedFileTool = toolsBody.result.tools.find(tool => tool.name === 'save_generated_image_file')
    expect(generatedFileTool?._meta?.['openai/fileParams']).toEqual(['attachment_id'])
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

  test('ChatGPT-shaped video and poster attachments produce an active public asset', async ({ request, baseURL }) => {
    test.setTimeout(90_000)
    await loginAs(request, baseURL!, MCP_GROWTH_USER_ID)
    const organizationId = MCP_GROWTH_ORGANIZATION_ID
    let assetId = ''

    try {
      const upload = await mcpRequest(request, baseURL!, {
        method: 'tools/call',
        toolName: 'upload_user_media',
        args: {
          organization_id: organizationId,
          category: 'other',
          file: {
            download_url: MCP_VIDEO_ATTACHMENT_URL,
            file_id: 'sediment://file_e2e_video',
          },
          poster_file: {
            download_url: MCP_VIDEO_POSTER_URL,
            file_id: 'sediment://file_e2e_video_poster',
          },
        },
      })
      if (upload.status() !== 200) console.error(await upload.text())
      expect(upload.status()).toBe(200)
      const uploaded = mcpData<{ asset_id: string; public_url: string; thumbnail_url: string | null; status: string; kind: string }>(await upload.json())
      expect(uploaded.status).toBe('active')
      expect(uploaded.kind).toBe('video')
      expect(uploaded.public_url).toContain(`/organizations/${organizationId}/media/`)
      expect(uploaded.thumbnail_url).toContain('imagedelivery.net')
      assetId = uploaded.asset_id

      const uploadedPath = new URL(uploaded.public_url).pathname
      const mediaPath = uploadedPath.startsWith('/__media/') ? uploadedPath : `/__media${uploadedPath}`
      const [videoDelivery, posterDelivery] = await Promise.all([
        request.get(`${baseURL}${mediaPath}`, { headers: devLoginHeaders() }),
        request.get(uploaded.thumbnail_url!),
      ])
      expect(videoDelivery.status()).toBe(200)
      expect(videoDelivery.headers()['content-type']).toContain('video/mp4')
      expect(posterDelivery.status()).toBe(200)
      expect(posterDelivery.headers()['content-type']).toContain('image/')

    } finally {
      if (assetId) {
        const remove = await mcpRequest(request, baseURL!, { method: 'tools/call', toolName: 'delete_media_asset', args: { organization_id: organizationId, asset_id: assetId } })
        expect(mcpData<{ deleted: boolean }>(await remove.json()).deleted).toBe(true)
      }
    }
  })
})
