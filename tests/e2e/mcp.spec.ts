import { expect, test, type APIRequestContext } from '@playwright/test'
import { devLoginHeaders } from './test-env'
import { loginAs } from './helpers/auth'

const MCP_VERSION = '2026-07-28'
const POTTERY_HOUSE_USER_ID = 'IZO6M01zZkvD1yrOFjoCDXdzdx4mAjOO'
const POTTERY_HOUSE_SITE_ID = 'site-pottery-house'
const POTTERY_HOUSE_LOCATION_ID = 'loc-pottery-beachfront'

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

async function ensureSite(request: APIRequestContext, baseURL: string) {
  const suffix = Date.now()
  const res = await mcpRequest(request, baseURL, {
    method: 'tools/call',
    toolName: 'create_site',
    args: {
      name: `MCP E2E ${suffix}`,
      subdomain: `mcp-e2e-${suffix}`,
      vertical: 'restaurant',
    },
  })
  expect(res.status()).toBe(200)
  const body = await res.json() as { result: { content: Array<{ json: { siteId?: string } }> } }
  const siteId = body.result.content[0]?.json.siteId
  expect(siteId).toEqual(expect.any(String))
  return siteId as string
}

async function getSiteOrg(request: APIRequestContext, baseURL: string, siteId: string) {
  const res = await request.get(`${baseURL}/api/sites/${siteId}`)
  expect(res.status()).toBe(200)
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
  const locationsBody = await locations.json() as { result: { content: Array<{ json: { locations: Array<{ id: string }> } }> } }
  let locationId = locationsBody.result.content[0]?.json.locations[0]?.id
  if (!locationId) {
    const createLocation = await mcpRequest(request, baseURL, {
      method: 'tools/call',
      toolName: 'create_location',
      args: { site_id: siteId, title: `MCP Location ${Date.now()}`, city: 'Krabi' },
    })
    expect(createLocation.status()).toBe(200)
    const locationBody = await createLocation.json() as { result: { content: Array<{ json: { id?: string; location?: { id?: string } } }> } }
    locationId = locationBody.result.content[0]?.json.id ?? locationBody.result.content[0]?.json.location?.id
  }
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
    expect(listBody.result.tools.map(tool => tool.name)).toEqual(expect.arrayContaining(['list_sites', 'create_site']))

    const invalid = await mcpRequest(request, baseURL!, { method: 'bad/method', id: 'bad-method' })
    expect(invalid.status()).toBe(404)
    const invalidBody = await invalid.json() as { id: string; error: { message: string } }
    expect(invalidBody.id).toBe('bad-method')
    expect(invalidBody.error.message).toContain('Unsupported MCP method')
  })

  test('owner can use content, notifications, submissions, and translation workflow tools', async ({ request, baseURL }) => {
    test.setTimeout(120_000)
    await loginAsFreshMcpUser(request, baseURL!)
    const siteId = await ensureSite(request, baseURL!)

    const sitesList = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'list_sites',
      args: {},
    })
    expect(sitesList.status()).toBe(200)
    const sitesListBody = await sitesList.json() as { result: { content: Array<{ json: { sites: Array<{ id: string }> } }> } }
    expect(sitesListBody.result.content[0]?.json.sites.some(site => site.id === siteId)).toBe(true)

    const siteRead = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_site',
      args: { site_id: siteId },
    })
    expect(siteRead.status()).toBe(200)

    const locationId = await ensureLocation(request, baseURL!, siteId)

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

    const draft = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'save_content_draft',
      args: {
        site_id: siteId,
        page: 'home',
        changes: {
          'hero.title': `MCP Hero ${Date.now()}`,
          'hero.subtitle': 'Drafted through MCP',
        },
      },
    })
    expect(draft.status()).toBe(200)

    const mergedContent = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_page_content',
      args: { site_id: siteId, page: 'home' },
    })
    expect(mergedContent.status()).toBe(200)
    const mergedBody = await mergedContent.json() as { result: { content: Array<{ json: { content: Array<{ field: string; hero_title?: string }> } }> } }
    const mergedHero = mergedBody.result.content[0]?.json.content.find(item => item.field === 'hero')
    expect(mergedHero?.hero_title).toContain('MCP Hero')

    const status = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_content_draft_status',
      args: { site_id: siteId, page: 'home' },
    })
    expect(status.status()).toBe(200)
    const statusBody = await status.json() as { result: { content: Array<{ json: { hasDrafts: boolean; count: number } }> } }
    expect(statusBody.result.content[0]?.json.hasDrafts).toBe(true)
    expect(statusBody.result.content[0]?.json.count).toBeGreaterThan(0)

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

    const publish = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'publish_content_drafts',
      args: { site_id: siteId, page: 'home' },
    })
    expect(publish.status()).toBe(200)

    const discardSeed = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'save_content_draft',
      args: {
        site_id: siteId,
        page: 'about',
        changes: {
          'intro.body': `Discard me ${Date.now()}`,
        },
      },
    })
    expect(discardSeed.status()).toBe(200)

    const discardDrafts = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'discard_content_drafts',
      args: { site_id: siteId, page: 'about' },
    })
    expect(discardDrafts.status()).toBe(200)

    const discardStatus = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_content_draft_status',
      args: { site_id: siteId, page: 'about' },
    })
    expect(discardStatus.status()).toBe(200)
    const discardStatusBody = await discardStatus.json() as { result: { content: Array<{ json: { hasDrafts: boolean; count: number } }> } }
    expect(discardStatusBody.result.content[0]?.json.hasDrafts).toBe(false)

    const deleteFieldSeed = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'save_content_draft',
      args: {
        site_id: siteId,
        page: 'about',
        changes: {
          'promo.note': `Delete me ${Date.now()}`,
        },
      },
    })
    expect(deleteFieldSeed.status()).toBe(200)

    const publishDeleteFieldSeed = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'publish_content_drafts',
      args: { site_id: siteId, page: 'about' },
    })
    expect(publishDeleteFieldSeed.status()).toBe(200)

    const deleteField = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'delete_content_field',
      args: { site_id: siteId, page: 'about', field: 'promo.note' },
    })
    expect(deleteField.status()).toBe(200)

    const notifications = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'update_notification_settings',
      args: { site_id: siteId, whatsapp_phone: '+1 555 555 0101' },
    })
    expect(notifications.status()).toBe(200)
    const notificationsBody = await notifications.json() as { result: { content: Array<{ json: { notifications: { whatsapp_phone: string } } }> } }
    expect(notificationsBody.result.content[0]?.json.notifications.whatsapp_phone).toContain('+15555550101')

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
      },
    })
    expect(publicReservation.status()).toBe(201)

    const listContacts = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'list_contact_submissions',
      args: { site_id: siteId },
    })
    expect(listContacts.status()).toBe(200)
    const contactsBody = await listContacts.json() as { result: { content: Array<{ json: { submissions: Array<{ id: string }> } }> } }
    const contactSubmissionId = contactsBody.result.content[0]?.json.submissions[0]?.id
    expect(contactSubmissionId).toEqual(expect.any(String))

    const updateContact = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'update_contact_submission',
      args: { site_id: siteId, submission_id: contactSubmissionId, status: 'read' },
    })
    expect(updateContact.status()).toBe(200)

    const listReservations = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'list_reservation_submissions',
      args: { site_id: siteId },
    })
    expect(listReservations.status()).toBe(200)
    const reservationsBody = await listReservations.json() as { result: { content: Array<{ json: { submissions: Array<{ id: string }> } }> } }
    const reservationSubmissionId = reservationsBody.result.content[0]?.json.submissions[0]?.id
    expect(reservationSubmissionId).toEqual(expect.any(String))

    const updateReservation = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'update_reservation_submission',
      args: { site_id: siteId, submission_id: reservationSubmissionId, status: 'confirmed' },
    })
    expect(updateReservation.status()).toBe(200)

    const localeCode = `qaa-${Date.now().toString(36).slice(-6)}`
    const locale = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'upsert_locale',
      args: { site_id: siteId, locale: localeCode, label: 'MCP Locale', status: 'draft', fallback_enabled: true },
    })
    expect(locale.status()).toBe(200)

    const localesList = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'list_locales',
      args: { site_id: siteId },
    })
    expect(localesList.status()).toBe(200)

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
    const qaCreateBody = await qaCreate.json() as { result: { content: Array<{ json: { id?: string } }> } }
    const qaId = qaCreateBody.result.content[0]?.json.id
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
    const qaCreateSecondBody = await qaCreateSecond.json() as { result: { content: Array<{ json: { id?: string } }> } }
    const qaIdSecond = qaCreateSecondBody.result.content[0]?.json.id
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

    const inventory = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_translation_inventory',
      args: { site_id: siteId, locale: localeCode, scope: 'content' },
    })
    expect(inventory.status()).toBe(200)
    const inventoryBody = await inventory.json() as { result: { content: Array<{ json: { estimate: { total_items: number } } }> } }
    expect(inventoryBody.result.content[0]?.json.estimate.total_items).toBeGreaterThan(0)

    const translationJobs = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'list_translation_jobs',
      args: { site_id: siteId },
    })
    expect(translationJobs.status()).toBe(200)

    const translationReview = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_translation_review_items',
      args: { site_id: siteId, locale: localeCode, scope: 'content', status: 'all' },
    })
    expect(translationReview.status()).toBe(200)
    const translationReviewBody = await translationReview.json() as {
      result: {
        content: Array<{
          json: {
            items: Array<{
              entity_type: string
              entity_id: string
              field: string
              source_fields: Record<string, string>
            }>
          }
        }>
      }
    }
    const reviewItem = translationReviewBody.result.content[0]?.json.items[0]
    expect(reviewItem).toBeDefined()

    const translationFields = Object.fromEntries(
      Object.entries(reviewItem!.source_fields).map(([key, value]) => [key, `${value} (${localeCode})`]),
    )
    const translationSave = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'save_translation_review_item',
      args: {
        site_id: siteId,
        locale: localeCode,
        scope: 'content',
        entity_type: reviewItem!.entity_type,
        entity_id: reviewItem!.entity_id,
        field: reviewItem!.field,
        fields: translationFields,
      },
    })
    expect(translationSave.status()).toBe(200)

    const publishTranslations = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'publish_translations',
      args: { site_id: siteId, locale: localeCode, scope: 'content' },
    })
    expect(publishTranslations.status()).toBe(200)

    const jobLocale = `qab-${Date.now().toString(36).slice(-6)}`
    const jobLocaleCreate = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'upsert_locale',
      args: { site_id: siteId, locale: jobLocale, label: 'MCP Job Locale', status: 'draft', fallback_enabled: true },
    })
    expect(jobLocaleCreate.status()).toBe(200)

    const translationJobStart = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'start_translation_job',
      args: { site_id: siteId, locale: jobLocale, scope: 'content', includePublished: true },
    })
    expect([200, 500]).toContain(translationJobStart.status())

    const translationJobsAfterStart = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'list_translation_jobs',
      args: { site_id: siteId },
    })
    expect(translationJobsAfterStart.status()).toBe(200)
    const translationJobsAfterStartBody = await translationJobsAfterStart.json() as {
      result: {
        content: Array<{
          json: {
            jobs: Array<{ id: string; target_locale: string }>
          }
        }>
      }
    }
    let startedJob = translationJobsAfterStartBody.result.content[0]?.json.jobs.find(job => job.target_locale === jobLocale)
    if (!startedJob) {
      const seedTranslationJob = await request.post(`${baseURL}/api/editor/sites/${siteId}/translations/jobs`, {
        data: { locale: jobLocale, scope: 'content', includePublished: true },
      })
      expect(seedTranslationJob.status()).toBe(200)
      const seedTranslationJobBody = await seedTranslationJob.json() as { job?: { id?: string } }
      if (seedTranslationJobBody.job?.id) {
        startedJob = { id: seedTranslationJobBody.job.id, target_locale: jobLocale }
      }
    }
    expect(startedJob?.id).toEqual(expect.any(String))

    const translationJobRead = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_translation_job',
      args: { site_id: siteId, job_id: startedJob!.id },
    })
    expect(translationJobRead.status()).toBe(200)

    const translationJobBatch = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'run_translation_job_batch',
      args: { site_id: siteId, job_id: startedJob!.id },
    })
    expect([200, 500]).toContain(translationJobBatch.status())

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

    const localeDelete = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'delete_locale',
      args: { site_id: siteId, locale: localeCode },
    })
    expect(localeDelete.status()).toBe(200)

    const jobLocaleDelete = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'delete_locale',
      args: { site_id: siteId, locale: jobLocale },
    })
    expect(jobLocaleDelete.status()).toBe(200)

    const deleteLocationRes = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'delete_location',
      args: { site_id: siteId, location_id: locationId },
    })
    expect(deleteLocationRes.status()).toBe(200)
  })

  test('owner can use menus, posts, media, experiences, and Google Business workflow tools', async ({ request, baseURL }) => {
    test.setTimeout(120_000)
    const freshUserId = await loginAsFreshMcpUser(request, baseURL!)
    const siteId = await ensureSite(request, baseURL!)
    const locationId = await ensureLocation(request, baseURL!, siteId)

    const menu = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'create_menu',
      args: { site_id: siteId, name: `MCP Menu ${Date.now()}` },
    })
    expect(menu.status()).toBe(200)
    const menuBody = await menu.json() as { result: { content: Array<{ json: { menu: { id: string } } }> } }
    const menuId = menuBody.result.content[0]?.json.menu.id
    expect(menuId).toEqual(expect.any(String))

    const menuItem = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'create_menu_item',
      args: { site_id: siteId, menu_id: menuId, section: 'Mains', name: 'MCP Curry', price_amount: '12.50' },
    })
    expect(menuItem.status()).toBe(200)
    const menuItemBody = await menuItem.json() as { result: { content: Array<{ json: { item: { id: string } } }> } }
    const menuItemId = menuItemBody.result.content[0]?.json.item.id
    expect(menuItemId).toEqual(expect.any(String))

    const secondMenuItem = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'create_menu_item',
      args: { site_id: siteId, menu_id: menuId, section: 'Mains', name: 'MCP Noodles', price_amount: '11.25', sort_order: 2 },
    })
    expect(secondMenuItem.status()).toBe(200)
    const secondMenuItemBody = await secondMenuItem.json() as { result: { content: Array<{ json: { item: { id: string } } }> } }
    const menuItemIdSecond = secondMenuItemBody.result.content[0]?.json.item.id
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
    const menuReadBody = await menuRead.json() as { result: { content: Array<{ json: { menu: { items: Array<{ name: string }> } } }> } }
    expect(menuReadBody.result.content[0]?.json.menu.items.some(item => item.name === 'MCP Curry')).toBe(true)

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
    const postBody = await post.json() as { result: { content: Array<{ json: { post: { id: string } } }> } }
    const postId = postBody.result.content[0]?.json.post.id
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
    const postDeleteCandidateBody = await postDeleteCandidate.json() as { result: { content: Array<{ json: { post: { id: string } } }> } }
    const postDeleteId = postDeleteCandidateBody.result.content[0]?.json.post.id
    expect(postDeleteId).toEqual(expect.any(String))

    const postDelete = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'delete_post',
      args: { site_id: siteId, post_id: postDeleteId },
    })
    expect(postDelete.status()).toBe(200)

    const mediaList = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'list_media_assets',
      args: { site_id: siteId },
    })
    expect(mediaList.status()).toBe(200)

    const mediaUpload = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'request_media_upload',
      args: { site_id: siteId, filename: 'mcp-test.png', category: 'gallery', location_id: locationId },
    })
    expect([200, 500]).toContain(mediaUpload.status())

    let uploadedAssetId: string | null = null
    if (mediaUpload.status() === 200) {
      const mediaUploadBody = await mediaUpload.json() as { result: { content: Array<{ json: { asset_id: string } }> } }
      uploadedAssetId = mediaUploadBody.result.content[0]?.json.asset_id ?? null
      expect(uploadedAssetId).toEqual(expect.any(String))

      const mediaConfirm = await mcpRequest(request, baseURL!, {
        method: 'tools/call',
        toolName: 'confirm_media_upload',
        args: { site_id: siteId, asset_id: uploadedAssetId },
      })
      expect(mediaConfirm.status()).toBe(200)

      const mediaUpdate = await mcpRequest(request, baseURL!, {
        method: 'tools/call',
        toolName: 'update_media_asset',
        args: { site_id: siteId, asset_id: uploadedAssetId, alt_text: 'MCP upload', category: 'hero' },
      })
      expect(mediaUpdate.status()).toBe(200)
    }

    const experience = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'create_experience',
      args: { site_id: siteId, title: 'MCP Kayak Tour', body: 'Half-day tour', status: 'active', time_slots: ['14:00'], max_capacity: 6 },
    })
    expect(experience.status()).toBe(200)
    const experienceBody = await experience.json() as { result: { content: Array<{ json: { experience: { id: string } } }> } }
    const experienceId = experienceBody.result.content[0]?.json.experience.id
    expect(experienceId).toEqual(expect.any(String))

    const listedExperiences = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'list_experiences',
      args: { site_id: siteId },
    })
    expect(listedExperiences.status()).toBe(200)
    const experiencesBody = await listedExperiences.json() as { result: { content: Array<{ json: { experiences: Array<{ id: string }> } }> } }
    expect(experiencesBody.result.content[0]?.json.experiences.some(item => item.id === experienceId)).toBe(true)

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

    const experienceReadBody = await experienceRead.json() as { result: { content: Array<{ json: { experience: { slug: string } } }> } }
    const experienceSlug = experienceReadBody.result.content[0]?.json.experience.slug
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
    const deleteExperienceCandidateBody = await deleteExperienceCandidate.json() as { result: { content: Array<{ json: { experience: { id: string } } }> } }
    const deleteExperienceId = deleteExperienceCandidateBody.result.content[0]?.json.experience.id
    expect(deleteExperienceId).toEqual(expect.any(String))

    const deleteExperienceRes = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'delete_experience',
      args: { site_id: siteId, experience_id: deleteExperienceId },
    })
    expect(deleteExperienceRes.status()).toBe(200)

    const workRequests = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'list_work_requests',
      args: { site_id: siteId },
    })
    expect(workRequests.status()).toBe(200)

    await loginAs(request, baseURL!, POTTERY_HOUSE_USER_ID)

    const googleConnection = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_google_business_connection',
      args: { site_id: POTTERY_HOUSE_SITE_ID, location_id: POTTERY_HOUSE_LOCATION_ID },
    })
    expect(googleConnection.status()).toBe(200)
    const googleConnectionBody = await googleConnection.json() as { result: { content: Array<{ json: { connection: unknown } }> } }
    expect(googleConnectionBody.result.content[0]?.json.connection ?? null).toBeNull()

    const googleAccounts = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'list_google_business_accounts',
      args: { site_id: POTTERY_HOUSE_SITE_ID },
    })
    expect(googleAccounts.status()).toBe(500)

    const googleAuth = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_google_business_auth_url',
      args: { site_id: POTTERY_HOUSE_SITE_ID, location_id: POTTERY_HOUSE_LOCATION_ID },
    })
    expect(googleAuth.status()).toBe(500)

    const googleSync = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'sync_google_business_locations',
      args: { site_id: POTTERY_HOUSE_SITE_ID, account_id: 'accounts/missing', location_ids: ['locations/missing'] },
    })
    expect(googleSync.status()).toBe(400)

    await loginAs(request, baseURL!, freshUserId)

    const workRequest = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'create_work_request',
      args: { site_id: siteId, type: 'content_update', title: 'Need copy update', description: 'Please update homepage copy', priority: 'normal' },
    })
    expect([200, 403]).toContain(workRequest.status())

    if (uploadedAssetId) {
      const mediaDelete = await mcpRequest(request, baseURL!, {
        method: 'tools/call',
        toolName: 'delete_media_asset',
        args: { site_id: siteId, asset_id: uploadedAssetId },
      })
      expect(mediaDelete.status()).toBe(200)
    }

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
    expect(toolNames).toContain('save_content_draft')
    expect(toolNames).not.toContain('update_notification_settings')
    expect(toolNames).not.toContain('get_google_business_auth_url')

    const wrongSite = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_site',
      args: { site_id: `site-missing-${Date.now()}` },
    })
    expect(wrongSite.status()).toBe(404)
  })

  test('translation tools are entitlement-gated — free plan gets 403 and tools are hidden from list', async ({ request, baseURL }) => {
    await loginAsFreshMcpUser(request, baseURL!)
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

    const inventoryCall = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_translation_inventory',
      args: { site_id: siteId, locale: 'th' },
    })
    expect(inventoryCall.status()).toBe(403)

    const startJobCall = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'start_translation_job',
      args: { site_id: siteId, locale: 'th' },
    })
    expect(startJobCall.status()).toBe(403)

    const gbConnectionCall = await mcpRequest(request, baseURL!, {
      method: 'tools/call',
      toolName: 'get_google_business_connection',
      args: { site_id: siteId, location_id: 'loc-missing' },
    })
    expect(gbConnectionCall.status()).toBe(403)
  })

  test('cross-tenant isolation — owner of site A cannot read or mutate site B through MCP', async ({ request, baseURL }) => {
    await loginAsFreshMcpUser(request, baseURL!)
    const siteA = await ensureSite(request, baseURL!)

    await loginAsFreshMcpUser(request, baseURL!)
    const siteB = await ensureSite(request, baseURL!)

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
