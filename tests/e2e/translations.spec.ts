import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'

const POTTERY_HOUSE_SITE_ID = 'site-pottery-house'
const POTTERY_HOUSE_USER_ID = 'user-pottery-house'

test.describe('restaurant translations', () => {
  test('owner can draft and publish a locale translation without breaking public content reads', async ({ request, baseURL }) => {
    await loginAs(request, baseURL!, POTTERY_HOUSE_USER_ID)

    const siteId = POTTERY_HOUSE_SITE_ID

    const localeCode = `qaa-${Date.now().toString(36).slice(-8)}`
    const normalizedLocaleCode = localeCode.replace(/-([a-z0-9]+)$/i, (_, region: string) => `-${region.toUpperCase()}`)
    const sourceTitle = `Translation test ${Date.now()}`
    const editorBase = `${baseURL}/api/editor/sites/${siteId}`

    const pagesResponse = await request.get(`${editorBase}/pages`)
    expect(pagesResponse.status()).toBe(200)
    const home = ((await pagesResponse.json()) as { pages: Array<{ id: string; path: string }> }).pages.find(page => page.path === '/')
    expect(home).toBeTruthy()
    const detailResponse = await request.get(`${editorBase}/pages/${home!.id}`)
    const detail = await detailResponse.json() as { page: { title: string; blocks: Array<{ type: string; data: Record<string, unknown> }>; document: { updated_at: string } } }
    const translationBlockId = `translation-e2e-${Date.now()}`
    const sourceBlocks = [
      ...detail.page.blocks,
      { id: translationBlockId, type: 'markdown', position: detail.page.blocks.length, data: { markdown: sourceTitle } },
    ]
    const saveContent = await request.patch(`${editorBase}/pages/${home!.id}`, {
      data: { blocks: sourceBlocks, expectedDocumentUpdatedAt: detail.page.document.updated_at },
    })
    expect(saveContent.status()).toBe(200)
    const savedContent = await saveContent.json()
    const sourcePublish = await request.post(`${editorBase}/pages/${home!.id}/publish`, {
      data: { expectedDocumentUpdatedAt: savedContent.page.document.updated_at },
    })
    expect(sourcePublish.status()).toBe(200)

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

    const reviewItem = async (candidate: typeof item) => {
      const translatedFields = Object.fromEntries(
        Object.entries(candidate.source_fields as Record<string, string>).map(([key, value]) => [
          key,
          candidate.field === 'metadata.canonicalUrl' ? value : `[TH] ${value}`,
        ])
      )
      const draft = await request.patch(`${editorBase}/translations/review`, {
        data: {
          locale: localeCode,
          scope: 'content',
          entity_type: candidate.entity_type,
          entity_id: candidate.entity_id,
          field: candidate.field,
          fields: translatedFields,
        }
      })
      const draftBody = await draft.json()
      expect(draft.status(), `${candidate.field}: ${JSON.stringify(draftBody)}`).toBe(200)
      expect(draftBody.item.status).toBe('draft')
    }

    await reviewItem(item)

    const incompletePublish = await request.post(`${editorBase}/translations/publish`, {
      data: { locale: localeCode, scope: 'content' }
    })
    expect(incompletePublish.status()).toBe(400)

    for (const candidate of inventoryBody.items) {
      if (candidate.entity_type === item.entity_type && candidate.entity_id === item.entity_id && candidate.field === item.field) continue
      await reviewItem(candidate)
    }

    const publish = await request.post(`${editorBase}/translations/publish`, {
      data: { locale: localeCode, scope: 'content' }
    })
    expect(publish.status()).toBe(200)
    const publishBody = await publish.json()
    expect(publishBody.result.published_items).toBeGreaterThan(0)

    const publicContent = await request.get(`${baseURL}/api/public/sites/${siteId}/pages?path=%2F&locale=${localeCode}`)
    const publicContentRaw = await publicContent.text()
    expect(publicContent.status(), publicContentRaw).toBe(200)
    const publicContentBody = JSON.parse(publicContentRaw)
    expect(publicContentBody.page.locale).toBe(normalizedLocaleCode)
    const translatedBlock = publicContentBody.page.blocks.find((entry: { type: string; data: Record<string, unknown> }) =>
      entry.type === 'markdown' && typeof entry.data.markdown === 'string' && entry.data.markdown.includes('[TH]')
    )
    expect(translatedBlock).toBeDefined()
    expect(translatedBlock.data.markdown).toContain('[TH]')

    const changedDetailResponse = await request.get(`${editorBase}/pages/${home!.id}`)
    const changedDetail = await changedDetailResponse.json() as { page: { blocks: Array<{ type: string; data: Record<string, unknown> }>; document: { updated_at: string } } }
    const changedBlocks = changedDetail.page.blocks.map(block => block.id === translationBlockId
      ? { ...block, data: { ...block.data, markdown: `${sourceTitle} updated` } }
      : block)
    const changedSource = await request.patch(`${editorBase}/pages/${home!.id}`, {
      data: { blocks: changedBlocks, expectedDocumentUpdatedAt: changedDetail.page.document.updated_at },
    })
    expect(changedSource.status()).toBe(200)
    const changedSourceBody = await changedSource.json()
    const republishSource = await request.post(`${editorBase}/pages/${home!.id}/publish`, {
      data: { expectedDocumentUpdatedAt: changedSourceBody.page.document.updated_at },
    })
    expect(republishSource.status()).toBe(200)

    const staleInventory = await request.get(`${editorBase}/translations/inventory?locale=${localeCode}&scope=content&includePublished=true`)
    expect(staleInventory.status()).toBe(200)
    const staleBody = await staleInventory.json()
    const staleItem = staleBody.items.find((candidate: { entity_type: string; entity_id: string; field: string }) =>
      candidate.entity_type === item.entity_type
      && candidate.entity_id === item.entity_id
      && candidate.field === translationBlockId
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
