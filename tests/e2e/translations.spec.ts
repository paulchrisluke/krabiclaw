import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'
import { ensureSite } from './helpers/ensure-site'
import { MCP_GROWTH_USER_ID } from './helpers/plan-fixtures'

test.describe('restaurant translations', () => {
  test('owner can draft and publish a locale translation without breaking public content reads', async ({ request, baseURL }) => {
    await loginAs(request, baseURL!, MCP_GROWTH_USER_ID)

    const contextResponse = await request.get(`${baseURL}/api/dashboard/context`)
    expect(contextResponse.status()).toBe(200)
    const contextBody = await contextResponse.json()
    const siteId = await ensureSite(request, baseURL!, contextBody.site?.id ?? null)

    const localeCode = `qaa-${Date.now().toString(36).slice(-8)}`
    const sourceTitle = `Translation test ${Date.now()}`
    const editorBase = `${baseURL}/api/editor/sites/${siteId}`

    const saveContent = await request.post(`${editorBase}/content/save`, {
      data: {
        page: 'home',
        changes: {
          'hero.title': sourceTitle,
          'hero.subtitle': 'Owner-visible source copy for translation tests',
        }
      }
    })
    expect(saveContent.status()).toBe(200)

    const locale = await request.post(`${editorBase}/locales`, {
      data: {
        locale: localeCode,
        label: 'Test Locale',
        status: 'published',
        fallback_enabled: true,
      }
    })
    expect([200, 201]).toContain(locale.status())

    const inventory = await request.get(`${editorBase}/translations/inventory?locale=${localeCode}&scope=content&includePublished=true`)
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

    const draft = await request.patch(`${editorBase}/translations/review`, {
      data: {
        locale: localeCode,
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

    const publish = await request.post(`${editorBase}/translations/publish`, {
      data: { locale: localeCode, scope: 'content' }
    })
    expect(publish.status()).toBe(200)
    const publishBody = await publish.json()
    expect(publishBody.result.published_items).toBeGreaterThan(0)

    const publicContent = await request.get(`${baseURL}/api/public/sites/${siteId}/content/home?locale=${localeCode}`)
    expect(publicContent.status()).toBe(200)
    const publicContentBody = await publicContent.json()
    expect(publicContentBody.locale).toBe(localeCode.toUpperCase().replace('QAA-', 'qaa-'))
    const hero = publicContentBody.content.find((entry: { field: string }) => entry.field === 'hero')
    expect(hero).toBeDefined()
    expect(hero.hero_title).toContain('[TH]')

    const changedSource = await request.post(`${editorBase}/content/save`, {
      data: {
        page: 'home',
        changes: {
          'hero.title': `${sourceTitle} updated`,
        }
      }
    })
    expect(changedSource.status()).toBe(200)

    const staleInventory = await request.get(`${editorBase}/translations/inventory?locale=${localeCode}&scope=content&includePublished=true`)
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
