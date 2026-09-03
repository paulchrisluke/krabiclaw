import { expect, test, type Page } from '@playwright/test'
import { loginAs } from './helpers/auth'

const siteBase = '/dashboard/kikuzuki-krabi-thailand/sites/kikuzuki-krabi-thailand'
const pagesBase = `${siteBase}/pages`

interface PageRecord {
  id: string
  page_id: string
  locale: string
  path: string
  title: string
  summary: string | null
  seo_title: string | null
  seo_description: string | null
  canonical_url: string | null
  robots: string | null
  page_type: string
  recipe: string | null
  sort_order: number
  blocks: Array<Record<string, unknown>>
  document: { updated_at: string }
}

async function openSeededPage(page: Page): Promise<{ editorPath: string, apiPagePath: string }> {
  await page.goto(pagesBase)
  const link = page.locator(`a[href^="${pagesBase}/"]`).filter({ hasText: /About|Home/ }).first()
  await expect(link).toBeVisible()
  const detailResponse = page.waitForResponse(response => response.request().method() === 'GET' && /\/api\/editor\/sites\/[^/]+\/pages\/[^/]+$/.test(new URL(response.url()).pathname))
  await link.click()
  await expect(page).toHaveURL(new RegExp(`${pagesBase}/[^/?]+$`))
  return { editorPath: new URL(page.url()).pathname, apiPagePath: new URL((await detailResponse).url()).pathname }
}

function pagePatchBody(page: PageRecord, blocks = page.blocks) {
  return {
    id: page.id,
    pageId: page.page_id,
    locale: page.locale,
    path: page.path,
    title: page.title,
    summary: page.summary,
    seoTitle: page.seo_title,
    seoDescription: page.seo_description,
    canonicalUrl: page.canonical_url,
    robots: page.robots,
    pageType: page.page_type,
    recipe: page.recipe,
    sortOrder: page.sort_order,
    blocks,
    expectedDocumentUpdatedAt: page.document.updated_at,
  }
}

test.describe('authenticated Page Editor', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await loginAs(page.context().request, baseURL!, 'user-e2e-kikuzuki-owner')
  })

  test('saves through the focused editor and restores the route hierarchy', async ({ page }) => {
    const writes: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'PATCH' && /\/api\/editor\/sites\/[^/]+\/pages\/[^/]+$/.test(new URL(request.url()).pathname)) writes.push(request.url())
    })

    const { editorPath, apiPagePath } = await openSeededPage(page)
    await expect(page.getByRole('heading', { name: 'Page editor', exact: true })).toHaveCount(1)
    await expect(page.getByRole('button', { name: /Open Hero/ }).first()).toBeVisible()

    const detailsCard = page.getByRole('button', { name: /Page details/ }).first()
    await detailsCard.click()
    await expect(page).toHaveURL(/\?section=details$/)

    const titleField = page.getByRole('button', { name: /^Title/ }).first()
    const originalTitle = await titleField.locator('span').nth(1).innerText()
    if (!originalTitle.trim()) throw new Error('Seeded Page Editor title is missing.')
    await titleField.click()
    await expect(page).toHaveURL(/section=details&field=title$/)
    const titleInput = page.getByRole('textbox', { name: 'Page title' })
    const dialog = page.locator('[data-slot="content"]', { has: titleInput })
    await expect(titleInput).toBeFocused()
    await titleInput.fill('Discarded Page Editor Value')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    await expect(titleField).toBeFocused()
    expect(writes).toHaveLength(0)
    await expect(titleField).toContainText(originalTitle)

    const savedTitle = `${originalTitle} Editor Verification`
    await titleField.click()
    await titleInput.fill(savedTitle)
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect.poll(() => writes.length).toBe(1)
    await expect(titleField).toContainText(savedTitle)

    await page.reload()
    await expect(page.getByRole('button', { name: /^Title/ }).first()).toContainText(savedTitle)

    const restoredField = page.getByRole('button', { name: /^Title/ }).first()
    await restoredField.click()
    await page.getByRole('textbox', { name: 'Page title' }).fill(originalTitle)
    const restoreResponse = page.waitForResponse((response) => {
      return response.request().method() === 'PATCH' && new URL(response.url()).pathname === apiPagePath
    })
    await page.locator('[data-slot="content"]', { has: page.getByRole('textbox', { name: 'Page title' }) }).getByRole('button', { name: 'Save', exact: true }).click()
    expect((await restoreResponse).ok()).toBe(true)
    await expect(page.locator('[data-slot="content"]', { has: page.getByRole('textbox', { name: 'Page title' }) })).toBeHidden()
    await expect(restoredField).toContainText(originalTitle)
    await expect.poll(() => writes.length).toBe(2)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(editorPath)
    await expect(page.getByRole('heading', { name: 'Page editor', exact: true })).toHaveCount(1)
    await expect(page.getByRole('button', { name: /^Title/ })).toHaveCount(0)
    await page.getByRole('button', { name: /Page details/ }).click()
    await expect(page).toHaveURL(/\?section=details$/)
    const mobileTitleField = page.getByRole('button', { name: /^Title/ })
    await expect(mobileTitleField).toBeVisible()
    await mobileTitleField.click()
    await expect(page).toHaveURL(/section=details&field=title$/)
    await expect(page.getByRole('textbox', { name: 'Page title' })).toBeFocused()
    await page.locator('[data-slot="content"]', { has: page.getByRole('textbox', { name: 'Page title' }) }).getByRole('button', { name: 'Cancel' }).click()
    await expect(page).toHaveURL(/\?section=details$/)
    await expect(mobileTitleField).toBeFocused()

    const metrics = await page.evaluate(() => ({
      noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      pageTitles: [...document.querySelectorAll('h1, h2')].filter(element => {
        return element.getClientRects().length > 0 && element.textContent?.trim() === 'Page details'
      }).length,
    }))
    expect(metrics.noHorizontalOverflow).toBe(true)
    expect(metrics.pageTitles).toBe(1)

    await page.getByRole('button', { name: 'Back to page outline' }).click()
    await expect(page).toHaveURL(new RegExp(`${editorPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
    const heroSections = page.getByRole('button', { name: 'Open Hero', exact: true })
    await expect(heroSections).toHaveCount(1)
    const originalHeroCount = await heroSections.count()
    await page.getByRole('button', { name: 'Duplicate Hero' }).focus()
    await page.keyboard.press('Enter')
    await expect(heroSections).toHaveCount(originalHeroCount + 1)

    const duplicatedHero = page.getByRole('article').filter({ has: page.getByRole('button', { name: 'Open Hero', exact: true }) }).nth(1)
    await duplicatedHero.getByRole('button', { name: 'Delete Hero' }).focus()
    await page.keyboard.press('Enter')
    await expect(heroSections).toHaveCount(originalHeroCount)

    await page.getByRole('button', { name: 'Move Hero down' }).focus()
    await page.keyboard.press('Enter')
    const firstBlock = page.getByRole('article').filter({ has: page.getByLabel('Section actions') }).first()
    await expect(firstBlock.getByRole('button', { name: /^Open / })).toHaveAccessibleName('Open Call to action')
    await page.getByRole('button', { name: 'Move Hero up' }).focus()
    await page.keyboard.press('Enter')
    await expect(firstBlock.getByRole('button', { name: /^Open / })).toHaveAccessibleName('Open Hero')

    const richTextSections = page.getByRole('button', { name: 'Open Rich text', exact: true })
    const originalRichTextCount = await richTextSections.count()
    await page.getByRole('button', { name: 'Add section' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Rich text', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Back to page outline' }).click()
    await expect(richTextSections).toHaveCount(originalRichTextCount + 1)
    await page.getByRole('article').filter({ has: richTextSections }).last().getByRole('button', { name: 'Delete Rich text' }).focus()
    await page.keyboard.press('Enter')
    await expect(richTextSections).toHaveCount(originalRichTextCount)
    expect(writes).toHaveLength(2)

    await page.goto(`${pagesBase}/new`)
    await expect(page.getByRole('heading', { name: 'Page editor', exact: true })).toHaveCount(1)
    await expect(page.getByRole('button', { name: /Page details/ })).toBeVisible()
  })

  test('defers persisted gallery changes until Save and uses placement operations', async ({ page }) => {
    test.setTimeout(120_000)
    const { apiPagePath } = await openSeededPage(page)
    const initialResponse = await page.context().request.get(apiPagePath)
    expect(initialResponse.ok()).toBe(true)
    let initialPage = (await initialResponse.json() as { page: PageRecord }).page
    const cleanBlocks = initialPage.blocks.filter((block) => {
      const data = block.data
      return !(typeof data === 'object' && data !== null && 'caption' in data && data.caption === 'Gallery persistence verification')
    })
    if (cleanBlocks.length !== initialPage.blocks.length) {
      const cleanResponse = await page.context().request.patch(apiPagePath, { data: pagePatchBody(initialPage, cleanBlocks) })
      expect(cleanResponse.ok()).toBe(true)
      initialPage = (await cleanResponse.json() as { page: PageRecord }).page
    }
    const mediaResponse = await page.context().request.get(apiPagePath.replace(/\/pages\/[^/]+$/, '/media?kind=image&limit=2'))
    expect(mediaResponse.ok()).toBe(true)
    const assets = (await mediaResponse.json() as { media: Array<{ id: string }> }).media
    expect(assets.length).toBeGreaterThanOrEqual(2)

    const galleryId = crypto.randomUUID()
    const gallery = {
      id: galleryId,
      type: 'gallery',
      position: initialPage.blocks.length,
      data: { caption: 'Gallery persistence verification' },
      media: assets.slice(0, 2).map((asset, sort_order) => ({ asset_id: asset.id, slot: 'gallery', sort_order })),
    }
    const setupResponse = await page.context().request.patch(apiPagePath, { data: pagePatchBody(initialPage, [...initialPage.blocks, gallery]) })
    expect(setupResponse.ok()).toBe(true)

    try {
      const placementWrites: string[] = []
      page.on('request', (request) => {
        if (request.method() === 'POST' && new URL(request.url()).pathname.includes('/media/placements/')) placementWrites.push(request.url())
      })
      await page.reload()
      const gallerySection = page.getByRole('article').filter({ hasText: 'Gallery persistence verification' })
      await gallerySection.getByRole('button', { name: 'Open Gallery', exact: true }).click()
      await page.getByRole('button', { name: /^Content/ }).click()
      await page.getByRole('button', { name: 'Remove gallery image' }).first().click()
      await page.locator('[data-slot="content"]', { has: page.getByRole('button', { name: 'Remove gallery image' }) }).getByRole('button', { name: 'Cancel' }).click()
      expect(placementWrites).toHaveLength(0)

      await page.getByRole('button', { name: /^Content/ }).click()
      await page.getByRole('button', { name: 'Remove gallery image' }).first().click()
      const pageSaved = page.waitForResponse(response => response.request().method() === 'PATCH' && new URL(response.url()).pathname === apiPagePath)
      const mediaRemoved = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/media/placements/remove'))
      await page.locator('[data-slot="content"]', { has: page.getByRole('button', { name: 'Remove gallery image' }) }).getByRole('button', { name: 'Save', exact: true }).click()
      expect((await pageSaved).ok()).toBe(true)
      expect((await mediaRemoved).ok()).toBe(true)
      await expect.poll(() => placementWrites.length).toBe(1)

      await page.reload()
      await gallerySection.getByRole('button', { name: 'Open Gallery', exact: true }).click()
      await page.getByRole('button', { name: /^Content/ }).click()
      await expect(page.getByRole('button', { name: 'Remove gallery image' })).toHaveCount(1)
    } finally {
      const currentResponse = await page.context().request.get(apiPagePath)
      const currentPage = (await currentResponse.json() as { page: PageRecord }).page
      const cleanupResponse = await page.context().request.patch(apiPagePath, { data: pagePatchBody(currentPage, initialPage.blocks) })
      expect(cleanupResponse.ok()).toBe(true)
    }
  })
})
