import { expect, test, type Page, type Route } from '@playwright/test'
import { loginAs } from './helpers/auth'

const productsPath = '/dashboard/kikuzuki-krabi-thailand/sites/kikuzuki-krabi-thailand/locations/kikuzuki-japanese-robatayaki-izakaya/products'

interface ProductRecord {
  id: string
  name: string
  category: string
  sort_order: number
}

async function openCollection(page: Page): Promise<string> {
  const responsePromise = page.waitForResponse(isProductCollectionResponse)
  await page.goto(productsPath)
  const response = await responsePromise
  expect(response.ok()).toBe(true)
  await expect(page.getByRole('button', { name: 'Add Dish' })).toBeVisible()
  return new URL(response.url()).pathname
}

function isProductCollectionResponse(response: { request(): { method(): string }, url(): string }): boolean {
  return response.request().method() === 'GET' && /\/api\/editor\/sites\/[^/]+\/locations\/[^/]+\/products$/.test(new URL(response.url()).pathname)
}

function card(page: Page, name: string) {
  return page.getByRole('button', { name: new RegExp(`^Open ${escapeRegex(name)},`) })
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function fillCreateField(page: Page, field: 'Name' | 'Section' | 'Price (THB)', value: string) {
  await page.getByRole('button', { name: `Edit ${field}` }).click()
  const input = page.getByRole('textbox', { name: field })
  await expect(input).toBeFocused()
  await input.fill(value)
  const sheet = page.locator('[data-slot="content"]', { has: input })
  await sheet.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(sheet).toBeHidden()
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
}

test.describe('authenticated Product Editor', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    test.setTimeout(120_000)
    await loginAs(page.context().request, baseURL!, 'user-e2e-kikuzuki-owner')
  })

  test('creates, edits, cancels, reloads, and reaches a late item on mobile', async ({ page }) => {
    const apiPath = await openCollection(page)
    const name = `Product Editor ${Date.now()}`
    let productId = ''
    const productWrites: string[] = []
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname
      if (request.method() === 'PATCH' && /\/products\/[^/]+$/.test(path)) productWrites.push(path)
    })

    await page.getByRole('button', { name: 'Add Dish' }).click()
    await expect(page).toHaveURL(/\?product=new$/)
    await fillCreateField(page, 'Name', name)
    await fillCreateField(page, 'Section', 'Product verification')
    await fillCreateField(page, 'Price (THB)', '123.45')

    const createResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === apiPath)
    await page.getByRole('button', { name: 'Create Dish' }).click()
    const created = await createResponse
    expect(created.ok()).toBe(true)
    productId = ((await created.json()) as { product: ProductRecord }).product.id
    await expect(page).toHaveURL(new RegExp(`product=${escapeRegex(productId)}$`))
    await expect(page.getByRole('button', { name: 'Edit Price (THB)' })).toContainText(/123\.45/)

    try {
      const nameField = page.getByRole('button', { name: 'Edit Name' })
      await nameField.click()
      const nameInput = page.getByRole('textbox', { name: 'Name' })
      const nameSheet = page.locator('[data-slot="content"]', { has: nameInput })
      await nameInput.fill('Discarded product name')
      await nameSheet.getByRole('button', { name: 'Cancel' }).click()
      await expect(nameSheet).toBeHidden()
      await expect(nameField).toBeFocused()
      expect(productWrites).toHaveLength(0)
      await expect(nameField).toContainText(name)

      await page.getByRole('button', { name: 'Edit Price (THB)' }).click()
      const priceInput = page.getByRole('textbox', { name: 'Price (THB)' })
      const priceSheet = page.locator('[data-slot="content"]', { has: priceInput })
      await priceInput.fill('12.345')
      await priceSheet.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(priceSheet.getByText('Check this field')).toBeVisible()
      expect(productWrites).toHaveLength(0)
      await priceSheet.getByRole('button', { name: 'Cancel' }).click()

      const patchFailure = async (route: Route) => {
        if (route.request().method() === 'PATCH') {
          await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Product verification save failure' }) })
        } else {
          await route.continue()
        }
      }
      await page.route(new RegExp(`/api/editor/sites/[^/]+/locations/[^/]+/products/${escapeRegex(productId)}(?:\\?|$)`), patchFailure)
      await page.getByRole('button', { name: 'Edit Description' }).click()
      const description = page.getByRole('textbox', { name: 'Description' })
      const descriptionSheet = page.locator('[data-slot="content"]', { has: description })
      await description.fill('Persisted through the focused Product Editor')
      await descriptionSheet.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(descriptionSheet.getByText('Could not save')).toBeVisible()
      await expect(description).toHaveValue('Persisted through the focused Product Editor')
      await page.unroute(new RegExp(`/api/editor/sites/[^/]+/locations/[^/]+/products/${escapeRegex(productId)}(?:\\?|$)`), patchFailure)

      const saveResponse = page.waitForResponse(response => response.request().method() === 'PATCH' && new URL(response.url()).pathname === `${apiPath}/${productId}`)
      await descriptionSheet.getByRole('button', { name: 'Save', exact: true }).click()
      expect((await saveResponse).ok()).toBe(true)
      await expect(descriptionSheet).toBeHidden()
      await expect(page.getByRole('button', { name: 'Edit Description' })).toContainText('Persisted through the focused Product Editor')

      await page.reload()
      await expect(page.getByRole('button', { name: 'Edit Description' })).toContainText('Persisted through the focused Product Editor')

      await page.setViewportSize({ width: 390, height: 844 })
      await openCollection(page)
      const mobileCard = card(page, name)
      await mobileCard.scrollIntoViewIfNeeded()
      await expectNoHorizontalOverflow(page)
      await mobileCard.click()
      await expect(page).toHaveURL(new RegExp(`product=${escapeRegex(productId)}$`))
      await expect(page.getByRole('button', { name: 'Edit Name' })).toBeVisible()
      const titleCount = await page.locator('h1, h2').filter({ hasText: name }).evaluateAll(elements => elements.filter(element => element.getClientRects().length > 0).length)
      expect(titleCount).toBe(1)
      await expectNoHorizontalOverflow(page)

      await page.getByRole('button', { name: 'Edit Name' }).click()
      await expect(page).toHaveURL(new RegExp(`product=${escapeRegex(productId)}&field=name$`))
      await expect(page.getByRole('textbox', { name: 'Name' })).toBeFocused()
      await expectNoHorizontalOverflow(page)
      await page.locator('[data-slot="content"]', { has: page.getByRole('textbox', { name: 'Name' }) }).getByRole('button', { name: 'Cancel' }).click()
      await expect(page).toHaveURL(new RegExp(`product=${escapeRegex(productId)}$`))
      await page.goBack()
      await expect(page).toHaveURL(new RegExp(`${escapeRegex(productsPath)}$`))
      await expect(mobileCard).toBeFocused()

      await mobileCard.click()
      const deleteButton = page.getByRole('button', { name: `Delete ${name}` })
      const deletes: string[] = []
      page.on('request', request => { if (request.method() === 'DELETE') deletes.push(request.url()) })
      await deleteButton.click()
      const deleteDialog = page.getByRole('dialog', { name: 'Delete dish' })
      await expect(deleteDialog).toContainText(name)
      await deleteDialog.getByRole('button', { name: 'Cancel' }).click()
      expect(deletes).toHaveLength(0)
      await expect(deleteButton).toBeFocused()
      await deleteButton.click()
      const deleteResponse = page.waitForResponse(response => response.request().method() === 'DELETE' && new URL(response.url()).pathname === `${apiPath}/${productId}`)
      await page.getByRole('dialog', { name: 'Delete dish' }).getByRole('button', { name: 'Delete', exact: true }).click()
      expect((await deleteResponse).ok()).toBe(true)
      productId = ''
      await expect(page).toHaveURL(new RegExp(`${escapeRegex(productsPath)}$`))
      await expect(card(page, name)).toHaveCount(0)
    } finally {
      if (productId) await page.context().request.delete(`${apiPath}/${productId}`)
    }
  })

  test('keeps loading, empty, and rejected reorder states distinct', async ({ page }) => {
    let releaseLoad: (() => void) | null = null
    const delayedLoad = new Promise<void>((resolve) => { releaseLoad = resolve })
    const loadRoute = async (route: Route) => {
      await delayedLoad
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Product verification load failure' }) })
    }
    await page.route(/\/api\/editor\/sites\/[^/]+\/locations\/[^/]+\/products(?:\?|$)/, loadRoute)
    const navigation = page.goto(productsPath)
    await expect(page.getByLabel('Loading products')).toBeVisible()
    releaseLoad?.()
    await navigation
    await expect(page.getByText('Menu could not be loaded')).toBeVisible()
    await expect(page.getByText('No menu yet')).toHaveCount(0)
    await page.unroute(/\/api\/editor\/sites\/[^/]+\/locations\/[^/]+\/products(?:\?|$)/, loadRoute)

    const emptyRoute = async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, products: [] }) })
    }
    await page.route(/\/api\/editor\/sites\/[^/]+\/locations\/[^/]+\/products(?:\?|$)/, emptyRoute)
    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByText('No menu yet')).toBeVisible()
    await page.unroute(/\/api\/editor\/sites\/[^/]+\/locations\/[^/]+\/products(?:\?|$)/, emptyRoute)

    const collectionResponse = page.waitForResponse(isProductCollectionResponse)
    await page.reload()
    expect((await collectionResponse).ok()).toBe(true)
    const firstMovable = page.getByRole('button', { name: /^Move .+ down$/ }).first()
    await expect(firstMovable).toBeEnabled()
    const originalCards = await page.getByRole('button', { name: /^Open / }).evaluateAll(buttons => buttons.slice(0, 4).map(button => button.getAttribute('aria-label')))
    const failedMove = async (route: Route) => {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Product verification reorder failure' }) })
    }
    await page.route(/\/api\/editor\/sites\/[^/]+\/locations\/[^/]+\/products\/(?:move|categories\/move)(?:\?|$)/, failedMove)
    await firstMovable.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText('Order could not be changed')).toBeVisible()
    await expect(firstMovable).toBeFocused()
    expect(await page.getByRole('button', { name: /^Open / }).evaluateAll(buttons => buttons.slice(0, 4).map(button => button.getAttribute('aria-label')))).toEqual(originalCards)
  })
})
