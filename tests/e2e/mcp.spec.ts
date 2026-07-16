import { expect, test, type APIRequestContext } from '@playwright/test'
import { devLoginHeaders } from './test-env'
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
    method: 'server/discover' | 'tools/list' | 'tools/call' | 'bad/method'
    id?: string | number
    siteId?: string
    toolName?: string
    args?: Record<string, unknown>
    extraHeaders?: Record<string, string>
  },
) {
  const payload = {
    jsonrpc: '2.0',
    id: options.id ?? `${options.method}-${Date.now()}`,
    method: options.method,
    params: options.method === 'tools/call'
      ? { name: options.toolName, arguments: options.args ?? {} }
      : options.siteId ? { site_id: options.siteId } : {},
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
    test.setTimeout(180_000)
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
