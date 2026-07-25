import { expect, test } from '@playwright/test'
import { isDeployedWorkerTarget } from './test-env'
import { loginAs } from './helpers/auth'
import { MCP_GROWTH_USER_ID } from './helpers/plan-fixtures'
import { MCP_VERSION, MCP_GROWTH_SITE_ID, mcpRequest, mcpData, ensureSite, loginAsFreshMcpUser } from './helpers/mcp'

// Split out of mcp.spec.ts (media/asset workflow tests) — see helpers/mcp.ts
// for why. This group covers the ChatGPT video-upload widget flow and the
// full sequence/video-widget-to-published-asset lifecycle.

test.describe('stateless MCP server', () => {
  test('ChatGPT session can launch the video upload widget without transport failures', async ({ request, baseURL }) => {
    await loginAsFreshMcpUser(request, baseURL!)
    const siteId = await ensureSite(request, baseURL!)

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
    const toolsBody = await tools.json() as { result: { tools: Array<{ name: string, outputSchema?: Record<string, unknown>, _meta?: Record<string, unknown> }> } }
    const openVideoTool = toolsBody.result.tools.find(tool => tool.name === 'open_video_upload')
    expect(openVideoTool).toBeTruthy()
    expect(openVideoTool?.outputSchema?.required).toEqual(['launched'])
    expect((openVideoTool?._meta?.ui as { resourceUri?: string, visibility?: string[] } | undefined)?.resourceUri).toBe('ui://widget/video-upload@v1.html')
    expect((openVideoTool?._meta?.ui as { resourceUri?: string, visibility?: string[] } | undefined)?.visibility).toEqual(['model', 'app'])
    expect(openVideoTool?._meta?.['openai/outputTemplate']).toBe('ui://widget/video-upload@v1.html')

    const launchVideo = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'open_video_upload',
      args: { site_id: siteId, category: 'other' },
      extraHeaders: { 'user-agent': 'openai-mcp/1.0.0' },
    })
    expect(launchVideo.status()).toBe(200)
    const launchVideoBody = await launchVideo.json() as {
      result?: {
        structuredContent?: Record<string, unknown>
        _meta?: Record<string, unknown>
      }
    }
    expect(launchVideoBody.result?.structuredContent).toEqual({
      launched: true,
    })
    expect(launchVideoBody.result?.structuredContent).not.toHaveProperty('context')
    expect(launchVideoBody.result?._meta?.resourceUri).toBe('ui://widget/video-upload@v1.html')
    expect((launchVideoBody.result?._meta as { context?: { site_id?: string; category?: string | null } } | undefined)?.context).toEqual({
      site_id: siteId,
      category: 'other',
    })

    const staleLauncher = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'open_media_upload',
      args: { site_id: siteId, category: 'other' },
      extraHeaders: { 'user-agent': 'openai-mcp/1.0.0' },
    })
    expect(staleLauncher.status()).toBe(200)
    expect((await staleLauncher.json()).error?.code).toBe(-32601)

    const resource = await mcpRequest(request, baseURL!, {
      method: 'resources/read',
      params: { uri: 'ui://widget/video-upload@v1.html' },
      extraHeaders: { 'user-agent': 'openai-mcp/1.0.0' },
    })
    expect(resource.status()).toBe(200)
    const resourceBody = await resource.json() as {
      result: {
        contents: Array<{
          text: string
          _meta?: {
            ui?: {
              csp?: { resourceDomains?: string[]; connectDomains?: string[] }
              domain?: string
            }
            'openai/widgetDomain'?: string
            'openai/widgetCSP'?: { resource_domains?: string[]; connect_domains?: string[] }
          }
        }>
      }
    }
    const content = resourceBody.result.contents[0]!
    const baseOrigin = new URL(baseURL!).origin
    expect(content._meta?.ui?.csp?.resourceDomains).toContain(baseOrigin)
    expect(content._meta?.ui?.csp?.connectDomains).toContain(baseOrigin)
    expect(content._meta?.['openai/widgetDomain']).toBe(baseOrigin)
    expect(content._meta?.['openai/widgetCSP']?.resource_domains).toContain(baseOrigin)
    expect(content._meta?.['openai/widgetCSP']?.connect_domains).toContain(baseOrigin)
    expect(content.text).toContain('/mcp-assets/video-upload-widget.v1.js')
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

  test('ChatGPT sequence and video widget produce an active, public, assignable asset', async ({ page, request, baseURL }) => {
    // The widget's downloadUrl points at this same app's own /api/mcp-test/tiny-video
    // fixture, so the server-side upload_user_media executor's fetch(downloadUrl) is a
    // same-zone Worker self-fetch on a deployed Cloudflare Worker — the same platform
    // restriction already documented and skipped for in oauth-discovery.spec.ts's CIMD
    // tests (reproduces deterministically as a Cloudflare 522, not app logic; confirmed
    // by reproducing the exact same code successfully through a real public tunnel
    // locally). In real ChatGPT usage the download_url is externally hosted (OpenAI's
    // servers), never same-zone, so this is a test-fixture artifact, not a product bug.
    // Covered instead by the local MCP harness (yarn test:mcp:chatgpt, docs/local-mcp-harness.md).
    test.skip(isDeployedWorkerTarget(baseURL!), 'Same-zone self-fetch of the tiny-video test fixture is not supported on deployed Cloudflare Workers — verify via the local MCP tunnel harness instead')
    test.setTimeout(90_000)
    await loginAsFreshMcpUser(request, baseURL!)
    const siteId = await ensureSite(request, baseURL!)
    let assetId = ''

    const initialize = await mcpRequest(request, baseURL!, {
      method: 'initialize',
      params: { protocolVersion: MCP_VERSION, capabilities: {}, clientInfo: { name: 'openai-mcp', version: '1.0.0' } },
      extraHeaders: { 'user-agent': 'openai-mcp/1.0.0' },
    })
    expect(initialize.status()).toBe(200)
    const initializeBody = await initialize.json() as { result?: { protocolVersion?: string; capabilities?: { tools?: unknown } } }
    expect(initializeBody.result?.protocolVersion).toBe(MCP_VERSION)
    expect(initializeBody.result?.capabilities?.tools).toBeDefined()

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
    const toolsBody = await tools.json() as { result: { tools: Array<{ name: string, outputSchema?: Record<string, unknown>, _meta?: Record<string, unknown> }> } }
    expect(toolsBody.result.tools.filter(tool => tool.name.startsWith('open_') && tool.name.includes('upload')).map(tool => tool.name)).toEqual(['open_video_upload'])
    const openVideoTool = toolsBody.result.tools.find(tool => tool.name === 'open_video_upload')
    expect(openVideoTool?.outputSchema?.required).toEqual(['launched'])
    expect((openVideoTool?._meta?.ui as { resourceUri?: string, visibility?: string[] } | undefined)?.resourceUri).toBe('ui://widget/video-upload@v1.html')

    const launchVideo = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'open_video_upload',
      args: { site_id: siteId, category: 'other' },
      extraHeaders: { 'user-agent': 'openai-mcp/1.0.0' },
    })
    expect(launchVideo.status()).toBe(200)
    const launchVideoBody = await launchVideo.json() as {
      result?: {
        structuredContent?: Record<string, unknown>
        _meta?: Record<string, unknown>
      }
    }
    expect(launchVideoBody.result?.structuredContent).toEqual({
      launched: true,
    })
    expect(launchVideoBody.result?.structuredContent).not.toHaveProperty('context')
    expect(launchVideoBody.result?._meta?.resourceUri).toBe('ui://widget/video-upload@v1.html')
    expect((launchVideoBody.result?._meta as { context?: { site_id?: string; category?: string | null } } | undefined)?.context).toEqual({
      site_id: siteId,
      category: 'other',
    })

    const currentUser = await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'get_current_user', args: {},
      extraHeaders: { 'user-agent': 'openai-mcp/1.0.0' },
    })
    expect(currentUser.status()).toBe(200)

    const resources = await mcpRequest(request, baseURL!, { method: 'resources/list' })
    expect(resources.status()).toBe(200)
    const resourcesBody = await resources.json() as { result: { resources: Array<{ uri: string }> } }
    expect(resourcesBody.result.resources).toHaveLength(1)
    expect(resourcesBody.result.resources[0]?.uri).toBe('ui://widget/video-upload@v1.html')

    const resource = await mcpRequest(request, baseURL!, {
      method: 'resources/read',
      params: { uri: resourcesBody.result.resources[0]!.uri },
    })
    expect(resource.status()).toBe(200)
    const resourceBody = await resource.json() as {
      result: {
        contents: Array<{
          text: string
          _meta?: {
            ui?: {
              csp?: { resourceDomains?: string[]; connectDomains?: string[] }
              domain?: string
            }
            'openai/widgetCSP'?: { resource_domains?: string[]; connect_domains?: string[] }
          }
        }>
      }
    }
    const html = resourceBody.result.contents[0]!.text
    const resourceMeta = resourceBody.result.contents[0]!._meta
    const baseOrigin = new URL(baseURL!).origin
    expect(resourceMeta?.ui?.csp?.resourceDomains).toContain(baseOrigin)
    expect(resourceMeta?.ui?.csp?.connectDomains).toContain(baseOrigin)
    expect(resourceMeta?.['openai/widgetCSP']?.resource_domains).toContain(baseOrigin)
    expect(resourceMeta?.['openai/widgetCSP']?.connect_domains).toContain(baseOrigin)
    const scriptSrc = html.match(/<script[^>]+src="([^"]+)"/)?.[1]
    expect(scriptSrc).toBeTruthy()
    const script = await request.get(scriptSrc!)
    expect(script.status()).toBe(200)

    await page.exposeFunction('krabiclawWidgetCallTool', async (name: string, args: Record<string, unknown>) => {
      const response = await mcpRequest(request, baseURL!, { method: 'tools/call', toolName: name, args })
      const body = await response.json()
      if (response.status() !== 200) throw new Error(`MCP ${name} returned ${response.status()}: ${JSON.stringify(body)}`)
      return body.result
    })
    type WidgetBridge = {
      krabiclawWidgetCallTool(_name: string, _args: Record<string, unknown>): Promise<unknown>
    }
    const installHostMock = ({ targetSiteId, downloadUrl }: { targetSiteId: string, downloadUrl: string }) => {
      const calls: string[] = []
      Object.defineProperty(window, '__krabiclawWidgetCalls', { value: calls })
      Object.defineProperty(window, 'openai', {
        value: {
          toolInput: { site_id: targetSiteId, category: 'other' },
          async uploadFile(file: File) {
            calls.push(`uploadFile:${file.name}:${file.type}:${file.size}`)
            return { fileId: 'file_widget_e2e_video' }
          },
          async getFileDownloadUrl({ fileId }: { fileId: string }) {
            calls.push(`getFileDownloadUrl:${fileId}`)
            return { downloadUrl }
          },
          async callTool(name: string, args: Record<string, unknown>) {
            calls.push(`callTool:${name}`)
            return await (window as unknown as WidgetBridge).krabiclawWidgetCallTool(name, args)
          },
        },
      })
    }

    try {
      const htmlWithoutScript = html.replace(/<script[^>]+src="[^"]+"><\/script>/, '')
      await page.setContent(htmlWithoutScript)
      await page.evaluate(installHostMock, { targetSiteId: siteId, downloadUrl: `${baseURL}/api/mcp-test/tiny-video` })
      await page.addScriptTag({ url: scriptSrc })
      const fixtureResponse = await request.get(`${baseURL}/api/mcp-test/tiny-video`)
      expect(fixtureResponse.status()).toBe(200)
      const fixture = await fixtureResponse.body()
      expect(fixture.byteLength).toBeGreaterThan(1_000)
      await page.locator('input[type=file]').setInputFiles({ name: 'tiny-widget-e2e.mp4', mimeType: 'video/mp4', buffer: fixture })
      await page.getByRole('button', { name: 'Upload video' }).click()
      // The real chain here is: fetch the fixture, stream it to Cloudflare
      // Images, then respond — reproduced locally through a real HTTPS tunnel
      // in well under 10s, but has consistently needed longer against the
      // deployed preview Worker in CI (observed: still "Uploading…" at the
      // default 10s timeout on three consecutive runs, no error surfaced).
      // Widen this one assertion rather than the whole test's budget.
      await expect(page.getByRole('status')).toContainText('is ready to assign', { timeout: 30_000 })
      const calls = await page.evaluate(() => (window as unknown as { __krabiclawWidgetCalls: string[] }).__krabiclawWidgetCalls)
      expect(calls.map(call => call.split(':')[0])).toEqual(['uploadFile', 'getFileDownloadUrl', 'callTool'])
      expect(calls[2]).toBe('callTool:upload_user_media')

      const media = await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName: 'get_site_media_assets', args: { site_id: siteId, kind: 'video' },
      })
      expect(media.status()).toBe(200)
      const assets = mcpData<{ assets: Array<{ id?: string, asset_id?: string, status?: string, public_url?: string, publicUrl?: string }> }>(await media.json()).assets
      const uploaded = assets.find(asset => (asset.id ?? asset.asset_id) && (asset.public_url ?? asset.publicUrl))
      expect(uploaded).toBeTruthy()
      assetId = uploaded!.id ?? uploaded!.asset_id ?? ''
      expect(uploaded!.status).toBe('active')
      const publicUrl = uploaded!.public_url ?? uploaded!.publicUrl
      expect((await request.get(publicUrl!)).status()).toBe(200)

      const assign = await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName: 'set_home_hero_video', args: { site_id: siteId, asset_id: assetId },
      })
      if (assign.status() !== 200) console.error(await assign.text())
      expect(assign.status()).toBe(200)
    } finally {
      if (assetId) {
        await mcpRequest(request, baseURL!, { method: 'tools/call', toolName: 'clear_home_hero_video', args: { site_id: siteId } })
        await mcpRequest(request, baseURL!, { method: 'tools/call', toolName: 'delete_media_asset', args: { site_id: siteId, asset_id: assetId } })
      }
    }
  })

})
