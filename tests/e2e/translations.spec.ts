import { expect, test } from '@playwright/test'

test.describe('site translations', () => {
  test('owner can draft and publish a locale translation without breaking public content reads', async ({ request, baseURL }) => {
    const login = await request.get(`${baseURL}/api/dev/login`)
    expect(login.status()).toBeLessThan(400)

    const sitesResponse = await request.get(`${baseURL}/api/sites`)
    expect(sitesResponse.status()).toBe(200)
    const sitesBody = await sitesResponse.json()
    const siteId = sitesBody.sites.find((site: { status: string; onboarding_status: string }) =>
      site.status === 'active' && site.onboarding_status === 'active'
    )?.id
    expect(siteId).toEqual(expect.any(String))

    const sourceTitle = `Translation test ${Date.now()}`
    const draftContent = await request.post(`${baseURL}/api/editor/sites/${siteId}/content/draft`, {
      data: {
        page: 'home',
        changes: {
          'hero.title': sourceTitle,
          'hero.subtitle': 'Owner-visible source copy for translation tests',
        }
      }
    })
    expect(draftContent.status()).toBe(200)

    const publishContent = await request.post(`${baseURL}/api/editor/sites/${siteId}/content/publish`, {
      data: { page: 'home' }
    })
    expect(publishContent.status()).toBe(200)

    const locale = await request.post(`${baseURL}/api/editor/sites/${siteId}/locales`, {
      data: {
        locale: 'th',
        label: 'Thai',
        status: 'draft',
        fallback_enabled: true,
      }
    })
    expect([200, 201]).toContain(locale.status())

    const inventory = await request.get(`${baseURL}/api/editor/sites/${siteId}/translations/inventory?locale=th&scope=content&includePublished=true`)
    expect(inventory.status()).toBe(200)
    const inventoryBody = await inventory.json()
    expect(inventoryBody.estimate.total_items).toBeGreaterThan(0)
    const item = inventoryBody.items.find((candidate: { source_fields: Record<string, string> }) =>
      Object.values(candidate.source_fields).some(value => value.includes(sourceTitle))
    )
    expect(item).toBeTruthy()

    const translatedFields = Object.fromEntries(
      Object.entries(item.source_fields as Record<string, string>).map(([key, value]) => [key, `[TH] ${value}`])
    )

    const draft = await request.patch(`${baseURL}/api/editor/sites/${siteId}/translations/review`, {
      data: {
        locale: 'th',
        scope: 'content',
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        field: item.field,
        fields: translatedFields,
      }
    })
    expect(draft.status()).toBe(200)
    const draftBody = await draft.json()
    expect(draftBody.item.status).toBe('draft')

    const publish = await request.post(`${baseURL}/api/editor/sites/${siteId}/translations/publish`, {
      data: { locale: 'th', scope: 'content' }
    })
    expect(publish.status()).toBe(200)
    const publishBody = await publish.json()
    expect(publishBody.result.published_items).toBeGreaterThan(0)

    const publicContent = await request.get(`${baseURL}/api/public/sites/${siteId}/content/home?locale=th`)
    expect(publicContent.status()).toBe(200)
    const publicContentBody = await publicContent.json()
    expect(publicContentBody.locale).toBe('th')
    const hero = publicContentBody.content.find((entry: { field: string }) => entry.field === 'hero')
    expect(hero).toBeDefined()
    expect(hero.hero_title).toContain('[TH]')

    const changedSource = await request.post(`${baseURL}/api/editor/sites/${siteId}/content/draft`, {
      data: {
        page: 'home',
        changes: {
          'hero.title': `${sourceTitle} updated`,
        }
      }
    })
    expect(changedSource.status()).toBe(200)

    const publishChangedSource = await request.post(`${baseURL}/api/editor/sites/${siteId}/content/publish`, {
      data: { page: 'home' }
    })
    expect(publishChangedSource.status()).toBe(200)

    const staleInventory = await request.get(`${baseURL}/api/editor/sites/${siteId}/translations/inventory?locale=th&scope=content&includePublished=true`)
    expect(staleInventory.status()).toBe(200)
    const staleBody = await staleInventory.json()
    const staleItem = staleBody.items.find((candidate: { entity_type: string; entity_id: string; field: string }) =>
      candidate.entity_type === item.entity_type
      && candidate.entity_id === item.entity_id
      && candidate.field === item.field
    )
    expect(staleItem).toBeDefined()
    expect(staleItem.translation_status).toBe('stale')
  })

  test('demo site exposes Thai public menu content', async ({ request, baseURL }) => {
    const publicMenu = await request.get(`${baseURL}/api/public/sites/site-demo/menus?locale=th`)
    expect(publicMenu.status()).toBe(200)
    const publicMenuBody = await publicMenu.json()
    expect(publicMenuBody.locale).toBe('th')
    expect(publicMenuBody.menu?.name).toBe('เมนู')
    expect(publicMenuBody.menu?.items.some((item: { name: string }) => item.name === 'มาร์เกริตา')).toBe(true)
  })
})
