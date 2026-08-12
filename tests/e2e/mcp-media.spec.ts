import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'
import { MCP_GROWTH_USER_ID } from './helpers/plan-fixtures'
import { MCP_VERSION, MCP_GROWTH_SITE_ID, mcpRequest, mcpData, ensureSite, loginAsFreshMcpUser } from './helpers/mcp'

// Split out of mcp.spec.ts (media/asset workflow tests) — see helpers/mcp.ts
// for why. This group covers the native ChatGPT attachment upload path.

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

    const initialized = await mcpRequest(request, baseURL!, {
      method: 'notifications/initialized',
      extraHeaders: { 'user-agent': 'openai-mcp/1.0.0' },
    })
    expect(initialized.status()).toBe(202)

    const tools = await mcpRequest(request, baseURL!, {
      method: 'tools/list',
      extraHeaders: { 'user-agent': 'openai-mcp/1.0.0' },
    })
    expect(tools.status()).toBe(200)
    const toolsBody = await tools.json() as { result: { tools: Array<{ name: string, inputSchema?: { required?: string[], properties?: Record<string, unknown>, additionalProperties?: boolean }, outputSchema?: Record<string, unknown>, _meta?: Record<string, unknown> }> } }
    expect(toolsBody.result.tools.filter(tool => tool.name.startsWith('open_') && tool.name.includes('upload')).map(tool => tool.name)).toEqual([])
    expect(toolsBody.result.tools.find(tool => tool.name === 'upload_user_photo')).toBeUndefined()
    const uploadTool = toolsBody.result.tools.find(tool => tool.name === 'upload_user_media')
    expect(uploadTool?.inputSchema?.required).toEqual(['file'])
    expect(uploadTool?.inputSchema?.properties?.file_id).toBeUndefined()
    expect(uploadTool?.inputSchema?.additionalProperties).toBe(false)
    const setMediaTool = toolsBody.result.tools.find(tool => tool.name === 'set_media')
    expect(setMediaTool?.inputSchema?.required).toEqual(['target_type', 'asset_ids'])
    expect(setMediaTool?.inputSchema?.properties?.target).toBeUndefined()
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
        target_type: 'home_hero',
        location_id: locationId,
        asset_ids: [],
      },
    })
    expect(mismatchedTarget.status()).toBe(200)
    const mismatchedTargetBody = await mismatchedTarget.json() as { result?: { isError?: boolean, content?: Array<{ text?: string }> } }
    expect(mismatchedTargetBody.result?.isError).toBe(true)
    expect(mismatchedTargetBody.result?.content?.[0]?.text).toContain('location_id cannot be used with target_type home_hero')

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

  test('ChatGPT session can resolve and review scoped agent guidance', async ({ request, baseURL }) => {
    await loginAs(request, baseURL!, MCP_GROWTH_USER_ID)
    const siteId = MCP_GROWTH_SITE_ID

    const tools = await mcpRequest(request, baseURL!, {
      method: 'tools/list',
      siteId,
      extraHeaders: { 'user-agent': 'openai-mcp/1.0.0' },
    })
    expect(tools.status()).toBe(200)
    const toolsBody = await tools.json() as { result: { tools: Array<{ name: string, annotations?: { readOnlyHint?: boolean } }> } }
    const guidanceTools = toolsBody.result.tools.filter(tool => tool.name === 'resolve_agent_guidance' || tool.name === 'review_agent_guidance_candidate')
    expect(guidanceTools.map(tool => tool.name).sort()).toEqual(['resolve_agent_guidance', 'review_agent_guidance_candidate'])
    expect(guidanceTools.every(tool => tool.annotations?.readOnlyHint === true)).toBe(true)

    const resolve = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'resolve_agent_guidance',
      args: { site_id: siteId, task: 'image.generate' },
      extraHeaders: { 'user-agent': 'openai-mcp/1.0.0' },
    })
    expect(resolve.status()).toBe(200)
    const guidance = mcpData<{
      requested_scope: { scope_type: string; site_id: string | null }
      scope_order: string[]
      skills: Array<{ scope_type: string; instructions_markdown: string }>
    }>(await resolve.json())
    expect(guidance.requested_scope).toMatchObject({ scope_type: 'site', site_id: siteId })
    expect(guidance.scope_order).toEqual(['platform', 'organization', 'site'])
    expect(guidance.skills[0]?.scope_type).toBe('platform')
    expect(guidance.skills[0]?.instructions_markdown).toContain('save_generated_image_file')

    const review = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'review_agent_guidance_candidate',
      args: {
        site_id: siteId,
        task: 'image.generate',
        candidate_type: 'image_brief',
        candidate: {
          prompt: 'Homepage hero for a hands-on local class.',
          intended_use: 'homepage hero',
          alt_text: 'Hands shaping clay on a wheel',
          transport: 'image_data_base64 from image_generation_call.result',
        },
      },
      extraHeaders: { 'user-agent': 'openai-mcp/1.0.0' },
    })
    expect(review.status()).toBe(200)
    const reviewBody = mcpData<{
      review: {
        recommendation: string
        persistence: string
        findings: Array<{ message: string }>
      }
    }>(await review.json())
    expect(reviewBody.review.recommendation).toBe('revise')
    expect(reviewBody.review.persistence).toBe('not_persisted')
    expect(reviewBody.review.findings.some(finding => finding.message.includes('file reference'))).toBe(true)
  })

  test('native ChatGPT attachment upload produces an active, public, assignable video asset', async ({ request, baseURL }) => {
    test.setTimeout(90_000)
    await loginAsFreshMcpUser(request, baseURL!)
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
            download_url: `${baseURL}/api/mcp-test/tiny-video`,
            file_id: 'sediment://file_widget_e2e_video',
          },
        },
      })
      if (upload.status() !== 200) console.error(await upload.text())
      expect(upload.status()).toBe(200)
      const uploaded = mcpData<{ asset_id: string; public_url: string; status: string; kind: string }>(await upload.json())
      expect(uploaded.status).toBe('active')
      expect(uploaded.kind).toBe('video')
      expect(uploaded.public_url).toContain('/sites/')
      assetId = uploaded.asset_id

      const assign = await mcpRequest(request, baseURL!, {
        method: 'tools/call',
        toolName: 'set_media',
        args: { site_id: siteId, target_type: 'home_hero', asset_ids: [assetId] },
      })
      if (assign.status() !== 200) console.error(await assign.text())
      expect(assign.status()).toBe(200)
    } finally {
      if (assetId) {
        await mcpRequest(request, baseURL!, { method: 'tools/call', toolName: 'set_media', args: { site_id: siteId, target_type: 'home_hero', asset_ids: [] } })
        await mcpRequest(request, baseURL!, { method: 'tools/call', toolName: 'delete_media_asset', args: { site_id: siteId, asset_id: assetId } })
      }
    }
  })
})
