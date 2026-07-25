import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'
import { MCP_FREE_USER_ID, MCP_MANAGED_USER_ID } from './helpers/plan-fixtures'
import { MCP_VERSION, MCP_MANAGED_SITE_ID, mcpRequest, mcpData } from './helpers/mcp'

// Split out of mcp.spec.ts (content/publishing tool tests) — see
// helpers/mcp.ts for why. This group covers post publishing, tenant blog
// tools, and the stateless discovery/list/error protocol flow.

test.describe('stateless MCP server', () => {
  // Split out of one test doing ~15-18 sequential MCP round trips sharing a
  // single 90s budget (invalid-post validation, the create/publish/
  // idempotency/public-API chain, and event/offer type validation are three
  // largely independent scenarios) — was intermittently exceeding even that
  // 90s budget under preview-deploy load, most recently confirmed on an
  // unrelated staging push (run 30061194138) that predates this split.
  // Splitting gives each scenario its own budget instead of raising the
  // shared one further.

  test('invalid event and offer posts are rejected with validation errors', async ({ request, baseURL }) => {
    await loginAs(request, baseURL!, MCP_MANAGED_USER_ID)
    const siteId = MCP_MANAGED_SITE_ID

    const invalidEvent = await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'create_post',
      args: { site_id: siteId, title: 'Invalid event', body: 'Missing its start.', post_type: 'event' },
    })
    expect(invalidEvent.status()).toBe(200)
    const invalidEventBody = await invalidEvent.json()
    expect(invalidEventBody.result?.isError).toBe(true)
    expect(invalidEventBody.result?.content?.[0]?.text).toContain('event_start')

    const invalidOffer = await mcpRequest(request, baseURL!, {
      method: 'tools/call', toolName: 'create_post',
      args: { site_id: siteId, title: 'Invalid offer', body: 'Missing terms.', post_type: 'offer' },
    })
    expect(invalidOffer.status()).toBe(200)
    const invalidOfferBody = await invalidOffer.json()
    expect(invalidOfferBody.result?.isError).toBe(true)
    expect(invalidOfferBody.result?.content?.[0]?.text).toMatch(/offer_coupon|offer_terms/)
  })

  test('a post publishes immediately, stays idempotent on repeat, and matches the public API', async ({ request, baseURL }) => {
    test.setTimeout(60_000)
    await loginAs(request, baseURL!, MCP_MANAGED_USER_ID)
    const siteId = MCP_MANAGED_SITE_ID
    let createdPostId: string | undefined

    try {
      const mediaResponse = await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName: 'get_site_media_assets', args: { site_id: siteId, kind: 'image' },
      })
      expect(mediaResponse.status()).toBe(200)
      const mediaAssets = mcpData<{ assets: Array<{ id?: string, asset_id?: string, status?: string }> }>(await mediaResponse.json()).assets
      const imageAsset = mediaAssets.find(asset => asset.status === 'active' && (asset.id ?? asset.asset_id))
      expect(imageAsset).toBeTruthy()
      const imageAssetId = imageAsset!.id ?? imageAsset!.asset_id!

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
      createdPostId = created.id

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
    } finally {
      if (createdPostId) {
        const cleanup = await mcpRequest(request, baseURL!, { method: 'tools/call', toolName: 'delete_post', args: { site_id: siteId, post_id: createdPostId } })
        if (cleanup.status() !== 200 || (await cleanup.json()).result?.isError) {
          console.error(`Failed to clean up post ${createdPostId} on ${siteId}: status ${cleanup.status()}`)
        }
      }
    }
  })

  // Comparable round-trip count to the publish/idempotency test above (4
  // creates/reads plus 2 deletes), which needed an explicit 60s budget under
  // preview-deploy load — this test was missed with the default 30s when the
  // file was split and timed out the same way (run 30084182210).
  test('event and offer post types store their type-specific fields', async ({ request, baseURL }) => {
    test.setTimeout(60_000)
    await loginAs(request, baseURL!, MCP_MANAGED_USER_ID)
    const siteId = MCP_MANAGED_SITE_ID
    const now = Date.now()
    const createdPostIds: string[] = []

    try {
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
        const cleanup = await mcpRequest(request, baseURL!, { method: 'tools/call', toolName: 'delete_post', args: { site_id: siteId, post_id: postId } })
        if (cleanup.status() !== 200 || (await cleanup.json()).result?.isError) {
          console.error(`Failed to clean up post ${postId} on ${siteId}: status ${cleanup.status()}`)
        }
      }
    }
  })

  test('tenant blog tools write the same canonical block document as the dashboard', async ({ request, baseURL }) => {
    test.setTimeout(120_000)
    await loginAs(request, baseURL!, MCP_FREE_USER_ID)
    const siteId = 'site-mcp-free'
    let postId = ''
    try {
      const legacy = await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName: 'create_blog_post',
        args: { site_id: siteId, title: 'Legacy MCP body', body: 'Rejected' },
      })
      expect(legacy.status()).toBe(200)
      const legacyBody = await legacy.json()
      expect(legacyBody.result?.isError).toBe(true)
      expect(legacyBody.result?.content?.[0]?.text).toContain('body')

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
      const created = mcpData<{ post: { id: string; document_updated_at: string; content_blocks: Array<{ type: string }> } }>(createBody).post
      postId = created.id
      expect(created.document_updated_at).toEqual(expect.any(String))
      expect(created.content_blocks.map(block => block.type)).toEqual(['heading', 'markdown'])

      const get = await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName: 'get_blog_post',
        args: { site_id: siteId, post_id: postId },
      })
      expect(get.status()).toBe(200)
      const readPost = mcpData<{ post: Record<string, unknown> & { document_updated_at: string; content_blocks: Array<{ type: string }> } }>(await get.json()).post
      expect(readPost.document_updated_at).toEqual(created.document_updated_at)
      expect(readPost.content_blocks.map(block => block.type)).toEqual(['heading', 'markdown'])
      expect(readPost).not.toHaveProperty('body')
      expect(readPost).not.toHaveProperty('components')
      expect(readPost).not.toHaveProperty('content_document')

      const update = await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName: 'replace_blog_content',
        args: {
          site_id: siteId,
          post_id: postId,
          expected_document_updated_at: readPost.document_updated_at,
          content_blocks: [
            { type: 'heading', level: 2, data: { text: 'Edited through MCP' } },
            { type: 'markdown', data: { markdown: 'Still one shared **document**.', editor_mode: 'rich' } },
            { type: 'faq', data: { items: [{ question: 'Shared?', answer: 'Yes.' }] } },
          ],
        },
      })
      expect(update.status()).toBe(200)
      const updatedPost = mcpData<{ post: { document_updated_at: string; content_blocks: Array<{ type: string }> } }>(await update.json()).post
      expect(updatedPost.document_updated_at).toEqual(expect.any(String))
      expect(updatedPost.document_updated_at).not.toBe(readPost.document_updated_at)

      const dashboardRead = await request.get(`${baseURL}/api/editor/sites/${siteId}/blog/${postId}`)
      expect(dashboardRead.status()).toBe(200)
      const dashboardBody = await dashboardRead.json() as { post: { content_document: { blocks: Array<{ type: string; data: Record<string, unknown> }> } } }
      expect(dashboardBody.post.content_document.blocks.map(block => block.type)).toEqual(['heading', 'markdown', 'faq'])
      expect(dashboardBody.post.content_document.blocks[0]?.data.text).toBe('Edited through MCP')

      const publish = await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName: 'publish_blog_post',
        args: { site_id: siteId, post_id: postId },
      })
      expect(publish.status()).toBe(200)
      const published = mcpData<{ post: { status: string; public_url: string | null; content_blocks: Array<{ type: string; data: Record<string, unknown> }> } }>(await publish.json()).post
      expect(published.status).toBe('published')
      expect(published.public_url).toEqual(expect.any(String))
      expect(published.content_blocks[0]?.data.text).toBe('Edited through MCP')

      // Regression for the 2026-07-22 incident: update_blog_post sent `body`
      // instead of `content_blocks` and reported success without persisting
      // anything, because content_blocks being absent looked like a
      // legitimate no-content-change partial update.
      const malformedUpdate = await mcpRequest(request, baseURL!, {
        method: 'tools/call', toolName: 'update_blog_post',
        args: {
          site_id: siteId,
          post_id: postId,
          expected_document_updated_at: readPost.document_updated_at,
          body: 'This should never be persisted.',
        },
      })
      expect(malformedUpdate.status()).toBe(200)
      const malformedUpdateBody = await malformedUpdate.json()
      expect(malformedUpdateBody.result?.isError).toBe(true)
      expect(malformedUpdateBody.result?.content?.[0]?.text).toContain('body')

      const dashboardReadAfterRejectedUpdate = await request.get(`${baseURL}/api/editor/sites/${siteId}/blog/${postId}`)
      expect(dashboardReadAfterRejectedUpdate.status()).toBe(200)
      const dashboardBodyAfterRejectedUpdate = await dashboardReadAfterRejectedUpdate.json() as typeof dashboardBody
      expect(dashboardBodyAfterRejectedUpdate.post.content_document.blocks.map(block => block.type)).toEqual(['heading', 'markdown', 'faq'])
      expect(dashboardBodyAfterRejectedUpdate.post.content_document.blocks[0]?.data.text).toBe('Edited through MCP')
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
    expect(invalid.status()).toBe(200)
    const invalidBody = await invalid.json() as { id: string; error: { code: number; message: string } }
    expect(invalidBody.id).toBe('bad-method')
    expect(invalidBody.error.code).toBe(-32601)
    expect(invalidBody.error.message).toContain('Unsupported MCP method')
  })

})
