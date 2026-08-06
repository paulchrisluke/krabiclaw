import { expect, test, type Page } from '@playwright/test'
import {
  blawbyBaseURL,
  blawbyExtraHeaders,
  potteryHouseBaseURL,
  potteryHouseExtraHeaders,
  collectPageErrors,
  expectHealthyPage,
  setupTenantHeaders,
} from './helpers'
import { kikuzukiTestBaseUrl, kikuzukiTestExtraHeaders } from './test-env'

type PublicArchetype = {
  id: string
  name: string
  baseURL: string
  headers: Record<string, string>
  stylesheet: string
  routeStylesheet: string
  route: string
  expectedText: string
  shellSelector: string
  shellStyle: 'saya' | 'blawby'
}

const archetypes: PublicArchetype[] = [
  {
    id: 'pottery-house',
    name: 'Saya experience',
    baseURL: potteryHouseBaseURL,
    headers: potteryHouseExtraHeaders,
    stylesheet: 'saya-home.css',
    routeStylesheet: 'saya.css',
    route: '/experiences',
    expectedText: 'Clay, calm, and a place to return to.',
    shellSelector: '.tenant-layout',
    shellStyle: 'saya',
  },
  {
    id: 'kikuzuki',
    name: 'Saya restaurant',
    baseURL: kikuzukiTestBaseUrl(),
    headers: kikuzukiTestExtraHeaders(),
    stylesheet: 'saya-home.css',
    routeStylesheet: 'saya.css',
    route: '/locations',
    expectedText: 'Kikuzuki',
    shellSelector: '.tenant-layout',
    shellStyle: 'saya',
  },
  {
    id: 'ncls',
    name: 'Blawby professional service',
    baseURL: blawbyBaseURL,
    headers: blawbyExtraHeaders,
    stylesheet: 'blawby-home.css',
    routeStylesheet: 'blawby.css',
    route: '/services',
    expectedText: 'North Carolina Legal Services',
    shellSelector: '.blawby-shell',
    shellStyle: 'blawby',
  },
]

const requestedArchetype = process.env.PUBLIC_RENDERING_ARCHETYPE
const selectedArchetypes = requestedArchetype
  ? archetypes.filter(archetype => archetype.id === requestedArchetype)
  : archetypes

if (requestedArchetype && selectedArchetypes.length === 0) {
  throw new Error(`Unknown PUBLIC_RENDERING_ARCHETYPE: ${requestedArchetype}`)
}

function collectPublicRenderingErrors(page: Page, baseURL: string) {
  const errors = collectPageErrors(page)
  const origin = new URL(baseURL).origin

  page.on('response', (response) => {
    const url = new URL(response.url())
    if (url.origin !== origin || response.status() < 400) return
    errors.push(`First-party response failed: ${response.status()} ${response.request().method()} ${response.url()}`)
  })

  return errors
}

async function assertRenderedPublicShell(
  page: Page,
  archetype: PublicArchetype,
  errors: string[],
) {
  await expect(page.locator(archetype.shellSelector)).toBeVisible()
  await expect(page.locator(`link[rel="stylesheet"][href*="${archetype.stylesheet}"]`)).toHaveCount(1)
  await expect(page.locator('body')).toContainText(archetype.expectedText)

  const stylesheetLoaded = await page.locator(`link[rel="stylesheet"][href*="${archetype.stylesheet}"]`).evaluate((element) => {
    const sheet = (element as HTMLLinkElement).sheet
    if (!sheet) return false
    try {
      return sheet.cssRules.length > 0
    } catch {
      return false
    }
  })

  const styleState = await page.locator(archetype.shellSelector).evaluate((element, shellStyle) => {
    const style = getComputedStyle(element)
    return {
      display: style.display,
      minHeight: style.minHeight,
      backgroundColor: style.backgroundColor,
      shellStyle,
    }
  }, archetype.shellStyle)

  expect(stylesheetLoaded).toBe(true)
  if (archetype.shellStyle === 'saya') {
    expect(styleState.display).toBe('flex')
  } else {
    expect(styleState.minHeight).not.toBe('0px')
  }
  expect(styleState.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')

  await expectHealthyPage(page, errors)
}

async function assertRenderedRoute(
  page: Page,
  archetype: PublicArchetype,
  errors: string[],
) {
  await expect(page.locator(`link[rel="stylesheet"][href*="${archetype.routeStylesheet}"]`)).toHaveCount(1)
  await expect(page.locator('main')).toBeVisible()
  await expectHealthyPage(page, errors)
}

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
]

for (const archetype of selectedArchetypes) {
  for (const viewport of viewports) {
    test(`${archetype.name} public rendering sentinel at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await setupTenantHeaders(page, archetype.baseURL, archetype.headers)
      const errors = collectPublicRenderingErrors(page, archetype.baseURL)

      const homeResponse = await page.goto(`${archetype.baseURL}/`, { waitUntil: 'load' })
      expect(homeResponse?.status()).toBeLessThan(400)
      await assertRenderedPublicShell(page, archetype, errors)

      await page.waitForTimeout(750)
      await assertRenderedPublicShell(page, archetype, errors)

      const routeResponse = await page.goto(`${archetype.baseURL}${archetype.route}`, { waitUntil: 'load' })
      expect(routeResponse?.status()).toBeLessThan(400)
      await assertRenderedRoute(page, archetype, errors)
    })
  }
}
