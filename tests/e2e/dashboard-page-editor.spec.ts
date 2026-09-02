import { expect, test, type Page } from '@playwright/test'
import { loginAs } from './helpers/auth'

const siteBase = '/dashboard/kikuzuki-krabi-thailand/sites/kikuzuki-krabi-thailand'
const pagesBase = `${siteBase}/pages`

async function openSeededPage(page: Page): Promise<string> {
  await page.goto(pagesBase)
  const link = page.locator(`a[href^="${pagesBase}/"]`).filter({ hasText: /About|Home/ }).first()
  await expect(link).toBeVisible()
  await link.click()
  await expect(page).toHaveURL(new RegExp(`${pagesBase}/[^/?]+$`))
  return new URL(page.url()).pathname
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

    const editorPath = await openSeededPage(page)
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
    await page.locator('[data-slot="content"]', { has: page.getByRole('textbox', { name: 'Page title' }) }).getByRole('button', { name: 'Save', exact: true }).click()
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
    await expect(page.getByRole('article').first().getByRole('button', { name: /^Open / })).toHaveAccessibleName('Open Call to action')
    await page.getByRole('button', { name: 'Move Hero up' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('article').first().getByRole('button', { name: /^Open / })).toHaveAccessibleName('Open Hero')

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
})
