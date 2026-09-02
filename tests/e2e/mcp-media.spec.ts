import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'
import { MCP_GROWTH_USER_ID } from './helpers/plan-fixtures'
import { MCP_VERSION, MCP_GROWTH_SITE_ID, mcpRequest, mcpData, ensureSite, loginAsFreshMcpUser } from './helpers/mcp'
import { devLoginHeaders } from './test-env'

const MCP_VIDEO_ATTACHMENT_URL = 'https://media.krabiclaw.com/sites/site-demo/media/media-demo-pizza-prep-video.mp4'
const MCP_VIDEO_POSTER_URL = 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/0762ea49-0bd2-4cc8-1044-d6c9b1f00100/public'

test.describe('stateless MCP server', () => {
  test('ChatGPT session exposes native media upload without widget launchers', async ({ request, baseURL }) => {
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
    expect(toolsBody.result.tools.filter(tool => tool.name.startsWith('open_') && tool.name.includes('upload')).map(tool => tool.name)).toEqual([])
    expect(toolsBody.result.tools.find(tool => tool.name === 'upload_user_photo')).toBeUndefined()
    const uploadTool = toolsBody.result.tools.find(tool => tool.name === 'upload_user_media')
    expect(uploadTool?.inputSchema?.required).toEqual(['file'])
    expect(uploadTool?.inputSchema?.properties?.file_id).toBeUndefined()
    expect(uploadTool?.inputSchema?.properties?.poster_file).toBeDefined()
    expect(uploadTool?.inputSchema?.additionalProperties).toBe(false)
    expect(uploadTool?._meta?.['openai/fileParams']).toEqual(['file', 'poster_file'])
    const setMediaTool = toolsBody.result.tools.find(tool => tool.name === 'set_media')
    expect(setMediaTool?.inputSchema?.required).toEqual(['placement', 'asset_id'])
    expect(setMediaTool?.inputSchema?.properties?.placement).toBeDefined()
    expect(setMediaTool?.inputSchema?.additionalProperties).toBe(false)
    expect(toolsBody.result.tools.filter(tool => tool._meta?.ui || tool._meta?.['openai/outputTemplate'])).toEqual([])

    const locations = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'list_locations',
      args: { site_id: MCP_GROWTH_SITE_ID },
    })
    expect(locations.status()).toBe(200)
    const locationId = mcpData<{ locations: Array<{ id: string }> }>(await locations.json()).locations[0]?.id
    expect(locationId).toEqual(expect.any(String))

    const mismatchedTarget = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'set_media',
      siteId: MCP_GROWTH_SITE_ID,
      args: {
        site_id: MCP_GROWTH_SITE_ID,
        placement: { owner_type: 'business_location', owner_id: locationId, slot: 'hero' },
        location_id: locationId,
        asset_id: 'media-does-not-matter-for-this-check',
      },
    })
    expect(mismatchedTarget.status()).toBe(200)
    const mismatchedTargetBody = await mismatchedTarget.json() as { result?: { isError?: boolean, content?: Array<{ text?: string }> } }
    expect(mismatchedTargetBody.result?.isError).toBe(true)
    expect(mismatchedTargetBody.result?.content?.[0]?.text).toContain('Unknown argument: location_id')

    const resources = await mcpRequest(request, baseURL!, { method: 'resources/list' })
    expect(resources.status()).toBe(200)
    const resourcesBody = await resources.json() as { result: { resources: Array<{ uri: string }> } }
    expect(resourcesBody.result.resources).toHaveLength(0)

    for (const uri of ['ui://media-upload', 'ui://video-upload']) {
      const resource = await mcpRequest(request, baseURL!, {
        method: 'resources/read',
        params: { uri },
      })
      expect(resource.status()).toBe(200)
      const body = await resource.json() as { error?: { code?: number, message?: string } }
      expect(body.error?.code).toBe(-32602)
      expect(body.error?.message).toContain('Unknown MCP app resource')
    }
  })

  test('ChatGPT-shaped video and poster attachments produce an active public asset', async ({ request, baseURL }) => {
    test.setTimeout(90_000)
    await loginAsFreshMcpUser(request, baseURL!, 'media')
    const siteId = await ensureSite(request, baseURL!)
    let assetId = ''

    try {
      const upload = await mcpRequest(request, baseURL!, {
        method: 'tools/call',
        toolName: 'upload_user_media',
        args: {
          site_id: siteId,
          category: 'other',
          file: {
            download_url: MCP_VIDEO_ATTACHMENT_URL,
            file_id: 'sediment://file_widget_e2e_video',
          },
          poster_file: {
            download_url: MCP_VIDEO_POSTER_URL,
            file_id: 'sediment://file_widget_e2e_video_poster',
          },
        },
      })
      if (upload.status() !== 200) console.error(await upload.text())
      expect(upload.status()).toBe(200)
      const uploaded = mcpData<{ asset_id: string; public_url: string; thumbnail_url: string | null; status: string; kind: string }>(await upload.json())
      expect(uploaded.status).toBe('active')
      expect(uploaded.kind).toBe('video')
      expect(uploaded.public_url).toContain('/sites/')
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
        const remove = await mcpRequest(request, baseURL!, { method: 'tools/call', toolName: 'delete_media_asset', args: { site_id: siteId, asset_id: assetId } })
        expect(mcpData<{ deleted: boolean }>(await remove.json()).deleted).toBe(true)
      }
    }
  })
})
