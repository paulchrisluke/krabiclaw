import { expect, test, type APIRequestContext } from '@playwright/test'
import { devLoginHeaders, isDeployedWorkerTarget } from './test-env'
import { loginAs } from './helpers/auth'
import { MCP_FREE_USER_ID, MCP_GROWTH_USER_ID, MCP_MANAGED_USER_ID } from './helpers/plan-fixtures'

const MCP_VERSION = '2026-07-28'
// Fixed fixture sites seeded by generate-demo-seed.ts with the matching plan already
// active. Entitlement checks are site-scoped (hasSiteEntitlement), so a plan-gated tool
// call needs the org's actual paid site, not a brand-new site from ensureSite() (which
// always starts on `free` per the second-site billing rule).
const MCP_GROWTH_SITE_ID = 'site-mcp-growth'
const MCP_MANAGED_SITE_ID = 'site-mcp-managed'

async function mcpRequest(
  request: APIRequestContext,
  baseURL: string,
  options: {
    method: 'initialize' | 'notifications/initialized' | 'server/discover' | 'tools/list' | 'tools/call' | 'resources/list' | 'resources/read' | 'bad/method'
    id?: string | number
    siteId?: string
    toolName?: string
    args?: Record<string, unknown>
    extraHeaders?: Record<string, string>
    params?: Record<string, unknown>
  },
) {
  const payload = {
    jsonrpc: '2.0',
    id: options.id ?? `${options.method}-${Date.now()}`,
    method: options.method,
    params: options.params ?? (options.method === 'tools/call'
      ? { name: options.toolName, arguments: options.args ?? {} }
      : options.siteId ? { site_id: options.siteId } : {}),
    _meta: {
      'io.modelcontextprotocol/version': MCP_VERSION,
      'io.modelcontextprotocol/method': options.method,
      ...(options.method === 'tools/call' && options.toolName ? { 'io.modelcontextprotocol/name': options.toolName } : {}),
    },
  }

  return request.post(`${baseURL}/api/mcp`, {
    headers: {
      'content-type': 'application/json',
      'mcp-protocol-version': MCP_VERSION,
      'mcp-method': options.method,
      ...(options.method === 'tools/call' && options.toolName ? { 'mcp-name': options.toolName } : {}),
      ...(options.extraHeaders ?? {}),
    },
    data: payload,
  })
}

// Extracts typed data from a tools/call result.
// Handles both the current spec format { type: 'text', text: string }
// and the legacy format { type: 'json', json: object }.
// Also handles renderStructuredResponse responses where text may be human-readable fallback.
function mcpData<T>(body: { result?: { content?: Array<{ type?: string; text?: string; json?: unknown }>; structuredContent?: unknown }; structuredContent?: unknown }): T {
  // Prefer structuredContent if available (from renderStructuredResponse)
  if (body.result?.structuredContent && typeof body.result.structuredContent === 'object') {
    return body.result.structuredContent as T
  }
  if (body.structuredContent && typeof body.structuredContent === 'object') {
    return body.structuredContent as T
  }
  const item = body.result?.content?.[0]
  if (!item) return {} as T
  if (item.type === 'json' && typeof item.json === 'object') {
    return item.json as T
  }
  if (item.type === 'text' && typeof item.text === 'string') {
    try {
      return JSON.parse(item.text) as T
    } catch {
      // Text is not JSON (e.g., renderStructuredResponse fallbackText)
      // Return empty object to avoid breaking tests that expect structured data
      return {} as T
    }
  }
  return {} as T
}

async function ensureSite(request: APIRequestContext, baseURL: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
  const res = await mcpRequest(request, baseURL, {
    method: 'tools/call',
    toolName: 'create_site',
    args: {
      name: `MCP E2E ${suffix}`,
      subdomain: `mcp-e2e-${suffix}`,
      vertical: 'restaurant',
    },
  })
  if (res.status() !== 200) console.error(await res.text()); expect(res.status()).toBe(200)
  const body = await res.json()
  const siteId = mcpData<{ siteId?: string }>(body).siteId
  expect(siteId).toEqual(expect.any(String))
  return siteId as string
}

async function getSiteOrg(request: APIRequestContext, baseURL: string, siteId: string) {
  const res = await request.get(`${baseURL}/api/sites/${siteId}`)
  if (res.status() !== 200) console.error(await res.text()); expect(res.status()).toBe(200)
  const body = await res.json() as { organization_id: string }
  return body.organization_id
}

async function ensureLocation(request: APIRequestContext, baseURL: string, siteId: string) {
  const locations = await mcpRequest(request, baseURL, {
    method: 'tools/call',
    toolName: 'list_locations',
    args: { site_id: siteId },
  })
  expect(locations.status()).toBe(200)
  const locationsBody = await locations.json()
  let locationId = mcpData<{ locations?: Array<{ id: string }> }>(locationsBody).locations?.[0]?.id
  if (!locationId) {
    const createLocation = await mcpRequest(request, baseURL, {
      method: 'tools/call',
      toolName: 'create_location',
      args: { site_id: siteId, title: `MCP Location ${Date.now()}`, city: 'Krabi' },
    })
    expect(createLocation.status()).toBe(200)
    const locationBody = await createLocation.json()
    const locationData = mcpData<{ id?: string; location?: { id?: string } }>(locationBody)
    locationId = locationData.id ?? locationData.location?.id
  }
  expect(locationId).toEqual(expect.any(String))
  return locationId as string
}

// Unlike ensureLocation, this never reuses an existing fixture location — tests that
// later call delete_location must create their own scratch location, otherwise running
// tests can race over the same shared fixture location and delete it out from under
// each other.
async function createScratchLocation(request: APIRequestContext, baseURL: string, siteId: string) {
  const createLocation = await mcpRequest(request, baseURL, {
    method: 'tools/call',
    toolName: 'create_location',
    args: { site_id: siteId, title: `MCP Scratch Location ${Date.now()}`, city: 'Krabi' },
  })
  expect(createLocation.status()).toBe(200)
  const locationBody = await createLocation.json()
  const locationData = mcpData<{ id?: string; location?: { id?: string } }>(locationBody)
  const locationId = locationData.id ?? locationData.location?.id
  expect(locationId).toEqual(expect.any(String))
  return locationId as string
}

async function loginAsFreshMcpUser(request: APIRequestContext, baseURL: string) {
  const userId = `e2e-mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  await loginAs(request, baseURL, userId)
  return userId
}

test.describe('stateless MCP server', () => {
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
    expect((await initialize.json() as { result?: { capabilities?: { tools?: unknown } } }).result?.capabilities?.tools).toBeDefined()

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
    const toolsBody = await tools.json() as { result: { tools: Array<{ name: string, _meta?: Record<string, unknown> }> } }
    expect(toolsBody.result.tools.filter(tool => tool.name.startsWith('open_') && tool.name.includes('upload')).map(tool => tool.name)).toEqual(['open_video_upload'])
    const openVideoTool = toolsBody.result.tools.find(tool => tool.name === 'open_video_upload')
    expect(openVideoTool?._meta?.['openai/widgetAccessible']).toBe(true)

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
    const resourceBody = await resource.json() as { result: { contents: Array<{ text: string }> } }
    const html = resourceBody.result.contents[0]!.text
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

  test('posts publish immediately with validated types, real media, skipped social outcomes, and idempotency', async ({ request, baseURL }) => {
    test.setTimeout(90_000)
    await loginAs(request, baseURL!, MCP_MANAGED_USER_ID)
    const siteId = MCP_MANAGED_SITE_ID
    const createdPostIds: string[] = []

    try {
      const mediaResponse = await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName: 'get_site_media_assets', args: { site_id: siteId, kind: 'image' },
      })
      expect(mediaResponse.status()).toBe(200)
      const mediaAssets = mcpData<{ assets: Array<{ id?: string, asset_id?: string, status?: string }> }>(await mediaResponse.json()).assets
      const imageAsset = mediaAssets.find(asset => asset.status === 'active' && (asset.id ?? asset.asset_id))
      expect(imageAsset).toBeTruthy()
      const imageAssetId = imageAsset!.id ?? imageAsset!.asset_id!

      const invalidEvent = await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName: 'create_post',
        args: { site_id: siteId, title: 'Invalid event', body: 'Missing its start.', post_type: 'event' },
      })
      expect(invalidEvent.status()).toBe(400)
      expect(await invalidEvent.text()).toContain('event_start')

      const invalidOffer = await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName: 'create_post',
        args: { site_id: siteId, title: 'Invalid offer', body: 'Missing terms.', post_type: 'offer' },
      })
      expect(invalidOffer.status()).toBe(400)
      expect(await invalidOffer.text()).toMatch(/offer_coupon|offer_terms/)

      const now = Date.now()
      const create = await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName: 'create_post',
        args: {
          site_id: siteId,
          title: `MCP immediate publication ${now}`,
          body: 'Visible immediately through MCP and the public API.',
          image_asset_id: imageAssetId,
          gallery_media: [{ media_asset_id: imageAssetId, role: 'cover', alt_text: 'MCP seeded image' }],
        },
      })
      if (create.status() !== 200) console.error(await create.text())
      expect(create.status()).toBe(200)
      const created = mcpData<{ id: string, slug: string }>(await create.json())
      createdPostIds.push(created.id)

      const read = await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName: 'get_post', args: { site_id: siteId, post_id: created.id },
      })
      expect(read.status()).toBe(200)
      const firstPost = mcpData<{ post: { status: string, slug: string, published_at: string, image_asset_id: string, media: Array<{ mediaAssetId?: string }> } }>(await read.json()).post
      expect(firstPost.status).toBe('published')
      expect(firstPost.published_at).toEqual(expect.any(String))
      expect(firstPost.image_asset_id).toBe(imageAssetId)
      expect(firstPost.media.some(item => item.mediaAssetId === imageAssetId)).toBe(true)

      const publicRead = await request.get(`${baseURL}/api/public/sites/${siteId}/posts/${encodeURIComponent(firstPost.slug)}`)
      expect(publicRead.status()).toBe(200)
      const publicPost = (await publicRead.json() as { post: { id: string, image_asset_id: string, media: Array<{ mediaAssetId?: string }> } }).post
      expect(publicPost.id).toBe(created.id)
      expect(publicPost.image_asset_id).toBe(imageAssetId)
      expect(publicPost.media.some(item => item.mediaAssetId === imageAssetId)).toBe(true)

      const publish = await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName: 'publish_post',
        args: { site_id: siteId, post_id: created.id, channels: ['site', 'facebook'] },
      })
      expect(publish.status()).toBe(200)
      const publishData = mcpData<{ channel_outcomes: Record<string, { status: string, reason?: string }> }>(await publish.json())
      expect(publishData.channel_outcomes.site?.status).toBe('published')
      expect(publishData.channel_outcomes.facebook?.status).toBe('skipped')
      expect(publishData.channel_outcomes.facebook?.reason).toMatch(/not_connected|not_entitled|social_publishing_disabled/)

      const repeat = await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName: 'publish_post',
        args: { site_id: siteId, post_id: created.id, channels: ['site', 'facebook'] },
      })
      expect(repeat.status()).toBe(200)
      const reread = await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName: 'get_post', args: { site_id: siteId, post_id: created.id },
      })
      const repeatedPost = mcpData<{ post: { published_at: string, channels: Array<{ channel: string }> } }>(await reread.json()).post
      expect(repeatedPost.published_at).toBe(firstPost.published_at)
      expect(repeatedPost.channels.filter(job => job.channel === 'site')).toHaveLength(1)
      expect(repeatedPost.channels.filter(job => job.channel === 'facebook')).toHaveLength(1)

      const eventStart = new Date(Date.now() + 86_400_000).toISOString()
      const eventEnd = new Date(Date.now() + 90_000_000).toISOString()
      const event = await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName: 'create_post',
        args: { site_id: siteId, title: `Valid event ${now}`, body: 'Event details.', post_type: 'event', event_title: 'MCP Event', event_start: eventStart, event_end: eventEnd },
      })
      expect(event.status()).toBe(200)
      const eventId = mcpData<{ id: string }>(await event.json()).id
      createdPostIds.push(eventId)
      const eventRead = await mcpRequest(request, baseURL!, { method: 'tools/call', toolName: 'get_post', args: { site_id: siteId, post_id: eventId } })
      const eventPost = mcpData<{ post: { post_type: string, event_start: string, event_end: string } }>(await eventRead.json()).post
      expect(eventPost).toMatchObject({ post_type: 'event', event_start: eventStart, event_end: eventEnd })

      const offer = await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName: 'create_post',
        args: { site_id: siteId, title: `Valid offer ${now}`, body: 'Offer details.', post_type: 'offer', offer_coupon: 'MCP20', offer_terms: 'Valid during the E2E window.' },
      })
      expect(offer.status()).toBe(200)
      const offerId = mcpData<{ id: string }>(await offer.json()).id
      createdPostIds.push(offerId)
      const offerRead = await mcpRequest(request, baseURL!, { method: 'tools/call', toolName: 'get_post', args: { site_id: siteId, post_id: offerId } })
      const offerPost = mcpData<{ post: { post_type: string, offer_coupon: string, offer_terms: string } }>(await offerRead.json()).post
      expect(offerPost).toMatchObject({ post_type: 'offer', offer_coupon: 'MCP20', offer_terms: 'Valid during the E2E window.' })
    } finally {
      for (const postId of createdPostIds) {
        await mcpRequest(request, baseURL!, { method: 'tools/call', toolName: 'delete_post', args: { site_id: siteId, post_id: postId } })
      }
    }
  })

  test('tenant blog tools write the same canonical block document as the dashboard', async ({ request, baseURL }) => {
    test.setTimeout(60_000)
    await loginAs(request, baseURL!, MCP_FREE_USER_ID)
    const siteId = 'site-mcp-free'
    let postId = ''
    try {
      const legacy = await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName: 'create_blog_post',
        args: { site_id: siteId, title: 'Legacy MCP body', body: 'Rejected' },
      })
      expect(legacy.status()).toBe(400)

      const create = await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName: 'create_blog_post',
        args: {
          site_id: siteId,
          title: `MCP canonical blog ${Date.now()}`,
          category: 'Guides',
          content_blocks: [
            { type: 'heading', level: 2, data: { text: 'Created through MCP' } },
            { type: 'markdown', data: { markdown: 'One shared **document**.', editor_mode: 'rich' } },
          ],
        },
      })
      if (create.status() !== 200) console.error(await create.text())
      expect(create.status()).toBe(200)
      const createBody = await create.json()
      const created = mcpData<{ id: string; expected_document_updated_at: string }>(createBody)
      postId = created.id
      expect(created.expected_document_updated_at).toEqual(expect.any(String))

      const update = await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName: 'update_blog_post',
        args: {
          site_id: siteId,
          post_id: postId,
          expected_document_updated_at: created.expected_document_updated_at,
          content_blocks: [
            { type: 'heading', level: 2, data: { text: 'Edited through MCP' } },
            { type: 'markdown', data: { markdown: 'Still one shared **document**.', editor_mode: 'rich' } },
            { type: 'faq', data: { items: [{ question: 'Shared?', answer: 'Yes.' }] } },
          ],
        },
      })
      expect(update.status()).toBe(200)

      const dashboardRead = await request.get(`${baseURL}/api/editor/sites/${siteId}/blog/${postId}`)
      expect(dashboardRead.status()).toBe(200)
      const dashboardBody = await dashboardRead.json() as { post: { content_document: { blocks: Array<{ type: string; data: Record<string, unknown> }> } } }
      expect(dashboardBody.post.content_document.blocks.map(block => block.type)).toEqual(['heading', 'markdown', 'faq'])
      expect(dashboardBody.post.content_document.blocks[0]?.data.text).toBe('Edited through MCP')
    } finally {
      if (postId) await request.delete(`${baseURL}/api/editor/sites/site-mcp-free/blog/${postId}`)
    }
  })

  test('requires auth and handles stateless discovery/list/error flow without initialize', async ({ request, baseURL }) => {
    const unauthenticated = await mcpRequest(request, baseURL!, { method: 'server/discover' })
    expect(unauthenticated.status()).toBe(401)

    await loginAs(request, baseURL!)

    const discover1 = await mcpRequest(request, baseURL!, { method: 'server/discover', id: 'discover-1' })
    expect(discover1.status()).toBe(200)
    const discoverBody1 = await discover1.json() as { result: { supportedVersions: string[]; capabilities: { tools: object } } }
    expect(discoverBody1.result.supportedVersions).toContain(MCP_VERSION)
    expect(discoverBody1.result.capabilities.tools).toBeDefined()

    const discover2 = await mcpRequest(request, baseURL!, { method: 'server/discover', id: 'discover-2' })
    expect(discover2.status()).toBe(200)

    const toolsList = await mcpRequest(request, baseURL!, { method: 'tools/list', id: 'list-no-site' })
    expect(toolsList.status()).toBe(200)
    const listBody = await toolsList.json() as { result: { tools: Array<{ name: string }> } }
    // Without site_id, all non-gated tools must be discoverable so AI clients (e.g. ChatGPT) see
    // the full capability set on first connection. Security gates enforce at execution time, not
    // at discovery. Translations/social-publishing/domains/managed-service tools are hidden here
    // by the conversational-surface flags (see conversational-tool-surface.ts) — CI runs with
    // those flags unset, matching production default — so they're intentionally excluded below.
    const allToolNames = listBody.result.tools.map(tool => tool.name)
    expect(allToolNames).toEqual(expect.arrayContaining([
      'list_sites', 'create_site',
      'get_site', 'list_locations', 'list_menus', 'list_posts', 'get_site_media_assets',
      'get_page_fields', 'list_experiences', 'get_contact_inquiries',
    ]))
    expect(allToolNames).not.toEqual(expect.arrayContaining([
      'get_translation_inventory', 'list_work_requests', 'get_google_business_connection',
    ]))
    expect(allToolNames.length).toBeGreaterThan(50)

    const invalid = await mcpRequest(request, baseURL!, { method: 'bad/method', id: 'bad-method' })
    expect(invalid.status()).toBe(404)
    const invalidBody = await invalid.json() as { id: string; error: { message: string } }
    expect(invalidBody.id).toBe('bad-method')
    expect(invalidBody.error.message).toContain('Unsupported MCP method')
  })

  test('owner can use site content and settings tools', async ({ request, baseURL }) => {
    test.setTimeout(60_000)
    await loginAs(request, baseURL!, MCP_GROWTH_USER_ID)
    const siteId = MCP_GROWTH_SITE_ID

    const sitesList = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'list_sites',
      args: {},
    })
    expect(sitesList.status()).toBe(200)
    const sitesListBody = await sitesList.json()
    const sitesListText = sitesListBody?.result?.content?.[0]?.text as string | undefined
    expect(sitesListText).toContain('You have')

    const siteRead = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_site',
      args: { site_id: siteId },
    })
    expect(siteRead.status()).toBe(200)

    const contentUpdate = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'update_page_content',
      args: {
        site_id: siteId,
        page: 'home',
        changes: {
          'hero.title': `MCP Hero ${Date.now()}`,
          'hero.subtitle': 'Drafted through MCP',
        },
      },
    })
    expect(contentUpdate.status()).toBe(200)

    const contentRead = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_page_fields',
      args: { site_id: siteId, page: 'home' },
    })
    expect(contentRead.status()).toBe(200)
    const mergedBody = await contentRead.json()
    const mergedHero = mcpData<{ fields: Array<{ field: string; hero_title?: string }> }>(mergedBody).fields.find(item => item.field === 'hero')
    expect(mergedHero?.hero_title).toContain('MCP Hero')

    const settingsBefore = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_site_settings',
      args: { site_id: siteId },
    })
    expect(settingsBefore.status()).toBe(200)

    const settingsUpdate = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'update_site_settings',
      args: { site_id: siteId, brand_description: 'Updated through MCP' },
    })
    expect(settingsUpdate.status()).toBe(200)

    const brandColorUpdate = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'set_brand_color',
      args: { site_id: siteId, color: '#0F4C5C' },
    })
    expect(brandColorUpdate.status()).toBe(200)
    const brandColorBody = await brandColorUpdate.json()
    expect(mcpData<{ brand_color: string; updated: boolean }>(brandColorBody).brand_color).toBe('#0F4C5C')
    expect(mcpData<{ brand_color: string; updated: boolean }>(brandColorBody).updated).toBe(true)

    const deleteFieldSeed = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'update_page_content',
      args: {
        site_id: siteId,
        page: 'about',
        changes: {
          'story.headline': `Delete me ${Date.now()}`,
        },
      },
    })
    expect(deleteFieldSeed.status()).toBe(200)

    const deleteField = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'delete_content_field',
      args: { site_id: siteId, page: 'about', field: 'story.headline' },
    })
    expect(deleteField.status()).toBe(200)
  })

  test('owner can use notification settings and submission inquiry tools', async ({ request, baseURL }) => {
    test.setTimeout(60_000)
    await loginAs(request, baseURL!, MCP_GROWTH_USER_ID)
    const siteId = MCP_GROWTH_SITE_ID

    const notifications = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'update_notification_settings',
      args: { site_id: siteId, whatsapp_phone: '+1 415 555 2671' },
    })
    expect(notifications.status()).toBe(200)
    const notificationsBody = await notifications.json()
    expect(mcpData<{ notifications: { whatsapp_phone: string } }>(notificationsBody).notifications.whatsapp_phone).toContain('+14155552671')

    const notificationsRead = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_notification_settings',
      args: { site_id: siteId },
    })
    expect(notificationsRead.status()).toBe(200)

    const publicContact = await request.post(`${baseURL}/api/public/sites/${siteId}/contact`, {
      data: { name: 'MCP Contact', email: `mcp-contact-${Date.now()}@example.test`, message: 'hello from MCP e2e' },
    })
    expect(publicContact.status()).toBe(201)
    const publicReservation = await request.post(`${baseURL}/api/public/sites/${siteId}/reservations`, {
      data: {
        name: 'MCP Reservation',
        email: `mcp-res-${Date.now()}@example.test`,
        phone: '+15555550199',
        date: '2030-01-15',
        time: '19:00',
        guests: '2',
        location_id: 'loc-mcp-growth',
      },
    })
    expect(publicReservation.status()).toBe(201)

    const listContacts = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_contact_inquiries',
      args: { site_id: siteId },
    })
    expect(listContacts.status()).toBe(200)
    const contactsBody = await listContacts.json()
    const contactSubmissionId = mcpData<{ submissions: Array<{ id: string }> }>(contactsBody).submissions[0]?.id
    expect(contactSubmissionId).toEqual(expect.any(String))

    const listReservations = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_reservation_inquiries',
      args: { site_id: siteId },
    })
    expect(listReservations.status()).toBe(200)
    const reservationsBody = await listReservations.json()
    const reservationSubmission = mcpData<{ submissions: Array<{
      id: string
      location_id: string | null
      location_title: string | null
      guests: string
      date: string
      time: string
      party_size?: unknown
      requested_date?: unknown
      requested_time?: unknown
    }> }>(reservationsBody).submissions[0]
    const reservationSubmissionId = reservationSubmission?.id
    expect(reservationSubmissionId).toEqual(expect.any(String))
    expect(reservationSubmission?.location_id).toEqual(expect.any(String))
    expect(reservationSubmission?.location_title).toEqual(expect.any(String))
    expect(reservationSubmission?.guests).toBe('2')
    expect(reservationSubmission?.date).toBe('2030-01-15')
    expect(reservationSubmission?.time).toBe('19:00')
    expect(reservationSubmission?.party_size).toBeUndefined()
    expect(reservationSubmission?.requested_date).toBeUndefined()
    expect(reservationSubmission?.requested_time).toBeUndefined()

    const tools = await mcpRequest(request, baseURL!, {
      method: 'tools/list',
      siteId,
    })
    expect(tools.status()).toBe(200)
    const toolsBody = await tools.json() as { result: { tools: Array<{ name: string }> } }
    const toolNames = toolsBody.result.tools.map(tool => tool.name)
    expect(toolNames).toContain('get_contact_inquiries')
    expect(toolNames).toContain('get_reservation_inquiries')
    expect(toolNames).not.toContain('update_contact_submission')
    expect(toolNames).not.toContain('update_reservation_submission')
  })

  test('owner can use location, reviews, and QA lifecycle tools', async ({ request, baseURL }) => {
    test.setTimeout(90_000)
    await loginAs(request, baseURL!, MCP_GROWTH_USER_ID)
    const siteId = MCP_GROWTH_SITE_ID

    const locationId = await createScratchLocation(request, baseURL!, siteId)

    const locationRead = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_location',
      args: { site_id: siteId, location_id: locationId },
    })
    expect(locationRead.status()).toBe(200)

    const locationUpdate = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'update_location',
      args: { site_id: siteId, location_id: locationId, phone: '+1 555 555 0111', city: 'Ao Nang' },
    })
    expect(locationUpdate.status()).toBe(200)

    const reviewsList = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'list_location_reviews',
      args: { site_id: siteId, location_id: locationId },
    })
    expect(reviewsList.status()).toBe(200)

    const qaCreate = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'create_location_qa',
      args: { site_id: siteId, location_id: locationId, question: 'Do you have vegan options?', answer: 'Yes', is_owner_answer: true },
    })
    expect(qaCreate.status()).toBe(200)
    const qaCreateBody = await qaCreate.json()
    const qaId = mcpData<{ id?: string }>(qaCreateBody).id
    expect(qaId).toEqual(expect.any(String))

    const qaUpdate = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'update_location_qa',
      args: { site_id: siteId, location_id: locationId, qa_id: qaId, answer: 'Yes, clearly marked vegan options.' },
    })
    expect(qaUpdate.status()).toBe(200)

    const qaList = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'list_location_qa',
      args: { site_id: siteId, location_id: locationId },
    })
    expect(qaList.status()).toBe(200)

    const qaCreateSecond = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'create_location_qa',
      args: { site_id: siteId, location_id: locationId, question: 'Are pets allowed?', answer: 'Yes, on the patio.', is_owner_answer: true },
    })
    expect(qaCreateSecond.status()).toBe(200)
    const qaCreateSecondBody = await qaCreateSecond.json()
    const qaIdSecond = mcpData<{ id?: string }>(qaCreateSecondBody).id
    expect(qaIdSecond).toEqual(expect.any(String))

    const qaReorder = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'reorder_location_qa',
      args: {
        site_id: siteId,
        location_id: locationId,
        updates: [
          { id: qaId, sort_order: 2 },
          { id: qaIdSecond, sort_order: 1 },
        ],
      },
    })
    expect(qaReorder.status()).toBe(200)

    const qaDelete = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'delete_location_qa',
      args: { site_id: siteId, location_id: locationId, qa_id: qaId },
    })
    expect(qaDelete.status()).toBe(200)

    const qaDeleteSecond = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'delete_location_qa',
      args: { site_id: siteId, location_id: locationId, qa_id: qaIdSecond },
    })
    expect(qaDeleteSecond.status()).toBe(200)

    const deleteLocationRes = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'delete_location',
      args: { site_id: siteId, location_id: locationId },
    })
    expect(deleteLocationRes.status()).toBe(200)
  })

  test('owner can manage site-level Q&A and provenance-aware reviews', async ({ request, baseURL }) => {
    test.setTimeout(90_000)
    await loginAs(request, baseURL!, MCP_GROWTH_USER_ID)
    const siteId = MCP_GROWTH_SITE_ID
    const qaIds: string[] = []
    let reviewId = ''
    try {
      for (const question of [`MCP site question A ${Date.now()}`, `MCP site question B ${Date.now()}`]) {
        const response = await mcpRequest(request, baseURL!, {
          method: 'tools/call',
          toolName: 'create_site_qa',
          args: { site_id: siteId, question, answer: 'Site-wide answer.' },
        })
        expect(response.status()).toBe(200)
        const id = mcpData<{ id?: string }>(await response.json()).id
        expect(id).toEqual(expect.any(String))
        qaIds.push(id!)
      }

      const reorder = await mcpRequest(request, baseURL!, {
        method: 'tools/call',
        toolName: 'reorder_site_qa',
        args: { site_id: siteId, updates: [{ id: qaIds[0], sort_order: 2 }, { id: qaIds[1], sort_order: 1 }] },
      })
      expect(reorder.status()).toBe(200)

      const qaList = await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName: 'list_site_qa', args: { site_id: siteId },
      })
      expect(qaList.status()).toBe(200)

      const reviewCreate = await mcpRequest(request, baseURL!, {
        method: 'tools/call',
        toolName: 'create_owner_entered_site_review',
        args: {
          site_id: siteId,
          author_name: 'MCP reviewer',
          rating: 5,
          content: 'The service was clear, responsive, and useful.',
          collection_method: 'email',
          original_reference: 'MCP regression fixture',
          publication_authorized: true,
          status: 'approved',
        },
      })
      expect(reviewCreate.status()).toBe(200)
      const reviewData = mcpData<{ id?: string; verified?: boolean }>(await reviewCreate.json())
      reviewId = reviewData.id ?? ''
      expect(reviewId).toEqual(expect.any(String))
      expect(reviewData.verified).toBe(false)

      const reviewList = await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName: 'list_site_reviews', args: { site_id: siteId },
      })
      expect(reviewList.status()).toBe(200)

      const reviewUpdate = await mcpRequest(request, baseURL!, {
        method: 'tools/call',
        toolName: 'update_owner_entered_site_review',
        args: { site_id: siteId, review_id: reviewId, rating: 4 },
      })
      expect(reviewUpdate.status()).toBe(200)
    } finally {
      for (const qaId of qaIds) {
        await mcpRequest(request, baseURL!, {
          method: 'tools/call', toolName: 'delete_site_qa', args: { site_id: siteId, qa_id: qaId },
        })
      }
      if (reviewId) {
        await mcpRequest(request, baseURL!, {
          method: 'tools/call', toolName: 'delete_owner_entered_site_review', args: { site_id: siteId, review_id: reviewId },
        })
      }
    }
  })

  test('owner can use menus, posts, media, and experiences workflow tools', async ({ request, baseURL }) => {
    // 31 sequential real API round-trips (menus, items, posts, media, experiences,
    // cleanup) — has repeatedly landed right at a 180s budget on its final
    // delete_location cleanup call under normal (non-degraded) preview latency,
    // with every prior assertion passing. Not a hang: each individual step is fast,
    // there are just a lot of them.
    test.setTimeout(300_000)
    await loginAs(request, baseURL!, MCP_MANAGED_USER_ID)
    const siteId = MCP_MANAGED_SITE_ID
    const locationId = await createScratchLocation(request, baseURL!, siteId)

    const menu = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'create_menu',
      args: { site_id: siteId, name: `MCP Menu ${Date.now()}` },
    })
    expect(menu.status()).toBe(200)
    const menuBody = await menu.json()
    const menuId = mcpData<{ id?: string; menu?: { id: string } }>(menuBody).id ?? mcpData<{ id?: string; menu?: { id: string } }>(menuBody).menu?.id
    expect(menuId).toEqual(expect.any(String))

    const menuItem = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'create_menu_item',
      args: { site_id: siteId, menu_id: menuId, section: 'Mains', name: 'MCP Curry', price_amount: '12.50' },
    })
    expect(menuItem.status()).toBe(200)
    const menuItemBody = await menuItem.json()
    const menuItemId = mcpData<{ id?: string; item?: { id: string } }>(menuItemBody).id ?? mcpData<{ id?: string; item?: { id: string } }>(menuItemBody).item?.id
    expect(menuItemId).toEqual(expect.any(String))

    const secondMenuItem = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'create_menu_item',
      args: { site_id: siteId, menu_id: menuId, section: 'Mains', name: 'MCP Noodles', price_amount: '11.25', sort_order: 2 },
    })
    expect(secondMenuItem.status()).toBe(200)
    const secondMenuItemBody = await secondMenuItem.json()
    const menuItemIdSecond = mcpData<{ id?: string; item?: { id: string } }>(secondMenuItemBody).id ?? mcpData<{ id?: string; item?: { id: string } }>(secondMenuItemBody).item?.id
    expect(menuItemIdSecond).toEqual(expect.any(String))

    const dessertMenuItem = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'create_menu_item',
      args: { site_id: siteId, menu_id: menuId, section: 'Desserts', name: 'MCP Mango Sticky Rice', price_amount: '8.00' },
    })
    expect(dessertMenuItem.status()).toBe(200)

    const menuRead = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_menu',
      args: { site_id: siteId, menu_id: menuId },
    })
    expect(menuRead.status()).toBe(200)
    const menuReadBody = await menuRead.json()
    expect(mcpData<{ menu: { items: Array<{ name: string }> } }>(menuReadBody).menu.items.some(item => item.name === 'MCP Curry')).toBe(true)

    const menusList = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'list_menus',
      args: { site_id: siteId },
    })
    expect(menusList.status()).toBe(200)

    const menuUpdate = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'update_menu',
      args: { site_id: siteId, menu_id: menuId, description: 'Updated through MCP', status: 'published' },
    })
    expect(menuUpdate.status()).toBe(200)

    const menuItemUpdate = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'update_menu_item',
      args: { site_id: siteId, menu_item_id: menuItemId, name: 'MCP Green Curry', price_amount: '13.00' },
    })
    expect(menuItemUpdate.status()).toBe(200)

    const renameSection = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'rename_menu_section',
      args: { site_id: siteId, menu_id: menuId, old_name: 'Mains', new_name: 'Entrees' },
    })
    expect(renameSection.status()).toBe(200)

    const reorderMenu = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'reorder_menu_items',
      args: {
        site_id: siteId,
        menu_id: menuId,
        updates: [
          { id: menuItemId, sort_order: 2 },
          { id: menuItemIdSecond, sort_order: 1 },
        ],
      },
    })
    expect(reorderMenu.status()).toBe(200)

    const deleteDessertSection = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'delete_menu_section',
      args: { site_id: siteId, menu_id: menuId, section_name: 'Desserts' },
    })
    expect(deleteDessertSection.status()).toBe(200)

    const deleteMenuItemRes = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'delete_menu_item',
      args: { site_id: siteId, menu_item_id: menuItemIdSecond },
    })
    expect(deleteMenuItemRes.status()).toBe(200)

    const post = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'create_post',
      args: { site_id: siteId, title: 'MCP Post', body: 'Created through MCP' },
    })
    expect(post.status()).toBe(200)
    const postBody = await post.json()
    const postId = mcpData<{ id?: string; post?: { id: string } }>(postBody).id ?? mcpData<{ id?: string; post?: { id: string } }>(postBody).post?.id
    expect(postId).toEqual(expect.any(String))

    const publishedPost = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'publish_post',
      args: { site_id: siteId, post_id: postId, channels: ['site'] },
    })
    expect(publishedPost.status()).toBe(200)

    const postUpdate = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'update_post',
      args: { site_id: siteId, post_id: postId, title: 'MCP Post Updated', body: 'Updated through MCP' },
    })
    expect(postUpdate.status()).toBe(200)

    const postsList = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'list_posts',
      args: { site_id: siteId },
    })
    expect(postsList.status()).toBe(200)

    const postRead = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_post',
      args: { site_id: siteId, post_id: postId },
    })
    expect(postRead.status()).toBe(200)

    const postDeleteCandidate = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'create_post',
      args: { site_id: siteId, title: 'Delete Me', body: 'Temporary post' },
    })
    expect(postDeleteCandidate.status()).toBe(200)
    const postDeleteCandidateBody = await postDeleteCandidate.json()
    const postDeleteId = mcpData<{ id?: string; post?: { id: string } }>(postDeleteCandidateBody).id ?? mcpData<{ id?: string; post?: { id: string } }>(postDeleteCandidateBody).post?.id
    expect(postDeleteId).toEqual(expect.any(String))

    const postDelete = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'delete_post',
      args: { site_id: siteId, post_id: postDeleteId },
    })
    expect(postDelete.status()).toBe(200)

    const mediaList = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_site_media_assets',
      args: { site_id: siteId },
    })
    expect(mediaList.status()).toBe(200)

    const experience = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'create_experience',
      args: { site_id: siteId, title: 'MCP Kayak Tour', body: 'Half-day tour', status: 'active', time_slots: ['14:00'], max_capacity: 6 },
    })
    expect(experience.status()).toBe(200)
    const experienceBody = await experience.json()
    const experienceId = mcpData<{ id?: string; experience?: { id: string } }>(experienceBody).id ?? mcpData<{ id?: string; experience?: { id: string } }>(experienceBody).experience?.id
    expect(experienceId).toEqual(expect.any(String))

    const listedExperiences = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'list_experiences',
      args: { site_id: siteId },
    })
    expect(listedExperiences.status()).toBe(200)
    const experiencesBody = await listedExperiences.json()
    expect(mcpData<{ experiences: Array<{ id: string }> }>(experiencesBody).experiences.some(item => item.id === experienceId)).toBe(true)

    const experienceRead = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_experience',
      args: { site_id: siteId, experience_id: experienceId },
    })
    expect(experienceRead.status()).toBe(200)

    const experienceUpdate = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'update_experience',
      args: { site_id: siteId, experience_id: experienceId, tagline: 'Updated through MCP', available_note: 'Call ahead to confirm.' },
    })
    expect(experienceUpdate.status()).toBe(200)

    const invalidExperience = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'create_experience',
      args: { site_id: siteId, title: 'Invalid MCP Experience', status: 'draft' },
    })
    expect(invalidExperience.status()).toBe(400)

    const experienceReadBody = await experienceRead.json()
    const experienceSlug = mcpData<{ experience: { slug: string } }>(experienceReadBody).experience.slug
    expect(experienceSlug).toEqual(expect.any(String))

    const futureDate = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const booking = await request.post(`${baseURL}/api/public/sites/${siteId}/experiences/${experienceSlug}/book`, {
      data: {
        guest_name: 'MCP Experience Guest',
        guest_email: `mcp-exp-${Date.now()}@example.test`,
        party_size: 2,
        booking_date: futureDate,
        time_slot: '14:00',
        notes: 'Created via public booking flow for MCP coverage',
      },
    })
    expect(booking.status()).toBe(201)
    const bookingBody = await booking.json() as { booking_id: string }
    const bookingId = bookingBody.booking_id
    expect(bookingId).toEqual(expect.any(String))

    const bookingsList = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'list_experience_bookings',
      args: { site_id: siteId, experience_id: experienceId },
    })
    expect(bookingsList.status()).toBe(200)
    const bookingsBody = await bookingsList.json()
    const listedBooking = mcpData<{ bookings: Array<{ id: string; location_id: string | null; location_title: string | null }> }>(bookingsBody)
      .bookings.find(item => item.id === bookingId)
    expect(listedBooking?.location_id).toEqual(expect.any(String))
    expect(listedBooking?.location_title).toEqual(expect.any(String))

    const bookingUpdate = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'update_experience_booking',
      args: { site_id: siteId, experience_id: experienceId, booking_id: bookingId, status: 'confirmed' },
    })
    expect(bookingUpdate.status()).toBe(200)

    const deleteExperienceCandidate = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'create_experience',
      args: { site_id: siteId, title: 'Delete MCP Experience', body: 'Temporary experience', status: 'inactive' },
    })
    expect(deleteExperienceCandidate.status()).toBe(200)
    const deleteExperienceCandidateBody = await deleteExperienceCandidate.json()
    const deleteExperienceId = mcpData<{ id?: string; experience?: { id: string } }>(deleteExperienceCandidateBody).id ?? mcpData<{ id?: string; experience?: { id: string } }>(deleteExperienceCandidateBody).experience?.id
    expect(deleteExperienceId).toEqual(expect.any(String))

    const deleteExperienceRes = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'delete_experience',
      args: { site_id: siteId, experience_id: deleteExperienceId },
    })
    expect(deleteExperienceRes.status()).toBe(200)

    const deleteMenuRes = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'delete_menu',
      args: { site_id: siteId, menu_id: menuId },
    })
    expect(deleteMenuRes.status()).toBe(200)

    const deleteLocationRes = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'delete_location',
      args: { site_id: siteId, location_id: locationId },
    })
    expect(deleteLocationRes.status()).toBe(200)
  })

  test('site-scoped tool visibility follows current roles and wrong-site calls fail', async ({ request, baseURL }) => {
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

    const wrongSiteTools = await mcpRequest(request, baseURL!, {
      method: 'tools/list',
      siteId: `site-missing-${Date.now()}`,
    })
    expect(wrongSiteTools.status()).toBe(200)
    const wrongSiteToolsBody = await wrongSiteTools.json() as { result: { tools: Array<{ name: string }> } }
    expect(wrongSiteToolsBody.result.tools).toEqual([])

    const wrongSite = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_site',
      args: { site_id: `site-missing-${Date.now()}` },
    })
    expect(wrongSite.status()).toBe(404)
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
    expect(inventoryCall.status()).toBe(404)

    const startJobCall = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'start_translation_job',
      args: { site_id: siteId, locale: 'th' },
    })
    expect(startJobCall.status()).toBe(404)

    const locationId = await ensureLocation(request, baseURL!, siteId)
    const gbConnectionCall = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_google_business_connection',
      args: { site_id: siteId, location_id: locationId },
    })
    expect(gbConnectionCall.status()).toBe(404)
  })

  test('cross-tenant isolation — owner of site B cannot read or mutate site A through MCP', async ({ request, baseURL }) => {
    await loginAsFreshMcpUser(request, baseURL!)
    const siteA = await ensureSite(request, baseURL!)

    await loginAsFreshMcpUser(request, baseURL!)
    await ensureSite(request, baseURL!)

    const crossRead = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_site',
      args: { site_id: siteA },
    })
    expect(crossRead.status()).toBe(404)

    const crossMutate = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'update_site_settings',
      args: { site_id: siteA, brand_description: 'cross-tenant injection attempt' },
    })
    expect(crossMutate.status()).toBe(404)
  })

  // Positive control for the isolation test above — proves the 404s there come
  // from cross-tenant isolation and not from the caller's own session/site
  // being broken.
  test('owner can still read their own site through MCP after a cross-tenant isolation check', async ({ request, baseURL }) => {
    await loginAsFreshMcpUser(request, baseURL!)
    const siteB = await ensureSite(request, baseURL!)

    const ownSiteRead = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_site',
      args: { site_id: siteB },
    })
    expect(ownSiteRead.status()).toBe(200)
  })

  test('review reply stays owner/admin only through MCP', async ({ request, baseURL }) => {
    await loginAsFreshMcpUser(request, baseURL!)
    const siteId = await ensureSite(request, baseURL!)
    const organizationId = await getSiteOrg(request, baseURL!, siteId)

    const ownerReply = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'reply_to_review',
      args: { site_id: siteId, review_id: 'missing-review-id', reply: `MCP owner reply ${Date.now()}` },
    })
    expect(ownerReply.status()).toBe(404)

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
    expect(editorReply.status()).toBe(403)
  })
})
