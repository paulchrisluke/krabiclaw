import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

import { buildReleaseRouteInventory } from '../../scripts/release-route-inventory.mjs'
import { collectPageErrors, expectHealthyPage, setupTenantHeaders } from './helpers'
import { testBaseUrl } from './test-env'

function isRedirectStatus(status: number) {
  return [301, 302, 303, 307, 308].includes(status)
}

function isAllowedRedirect(route: {
  allowRedirects: Array<{ status: number; origin: string; path: string }>
}, response: import('@playwright/test').Response) {
  const location = response.headers().location
  if (!location) return false
  const target = new URL(location, response.url())
  return route.allowRedirects.some(redirect =>
    redirect.status === response.status()
    && redirect.origin === target.origin
    && redirect.path === target.pathname
    && target.search === ''
    && target.hash === '',
  )
}

function expectedMediaType(resourceType: string, contentType: string) {
  if (resourceType === 'image') return /^image\//i.test(contentType)
  if (resourceType === 'media') return /^(?:video|audio)\//i.test(contentType)
  if (resourceType === 'font') {
    return /^(?:font\/(?:woff|woff2|ttf|otf)|application\/font-|application\/vnd\.ms-fontobject|application\/octet-stream)/i.test(contentType)
  }
  return true
}

function isMediaResource(resourceType: string) {
  return resourceType === 'image' || resourceType === 'media' || resourceType === 'font'
}

const FIRST_PARTY_MEDIA_HOSTS = new Set([
  'media.krabiclaw.com',
  'images.krabiclaw.com',
  'imagedelivery.net',
])

function isFirstPartyAsset(responseUrl: URL, surfaceBaseUrl: string) {
  return responseUrl.origin === new URL(surfaceBaseUrl).origin
    || FIRST_PARTY_MEDIA_HOSTS.has(responseUrl.hostname)
}

function assertPathWithoutQueryOrHash(path: string, label: string) {
  expect(path, `${label} must be an origin-relative path without query/hash`).toMatch(/^\/(?!.*[?#]).*$/)
}

const inventoryPath = process.env.RELEASE_ROUTE_INVENTORY_PATH
const inventory = inventoryPath
  ? JSON.parse(readFileSync(inventoryPath, 'utf8')) as ReturnType<typeof buildReleaseRouteInventory>
  : buildReleaseRouteInventory(testBaseUrl())

const surfaceTargets = inventory.surfaces.flatMap(surface => [
  surface,
  ...(surface.variants ?? []).map(variant => ({
    ...variant,
    name: `${surface.name}/${variant.name}`,
  })),
])

for (const surface of surfaceTargets) {
  test.describe(`${surface.name} immutable public release routes`, () => {
    for (const route of surface.routes) {
      test(`${route.path} resolves on the exact expected origin and path`, async ({ page }, testInfo) => {
        assertPathWithoutQueryOrHash(route.path, `${surface.name}:${route.path} request path`)
        assertPathWithoutQueryOrHash(route.expectedPath, `${surface.name}:${route.path} expected path`)
        for (const redirect of route.allowRedirects) {
          assertPathWithoutQueryOrHash(redirect.path, `${surface.name}:${route.path} redirect path`)
        }
        const viewport = page.viewportSize()
        if (!viewport) throw new Error(`${testInfo.project.name} must use a real configured viewport`)
        if (testInfo.project.name === 'public-surfaces-mobile') {
          expect(viewport.width).toBeLessThanOrEqual(500)
        } else {
          expect(viewport.width).toBeGreaterThanOrEqual(1000)
        }

        const errors = collectPageErrors(page)
        const requestFailures: string[] = []
        const mediaFailures: string[] = []
        const mediaEvidence: Array<{ url: string; resourceType: string; status: number; contentType: string }> = []
        const redirects: import('@playwright/test').Response[] = []
        const onResponse = (response: import('@playwright/test').Response) => {
          const responseUrl = new URL(response.url())
          if (
            response.request().isNavigationRequest()
            && response.request().frame() === page.mainFrame()
            && isRedirectStatus(response.status())
          ) redirects.push(response)
          if (!isFirstPartyAsset(responseUrl, surface.baseUrl)) return
          const status = response.status()
          if (status >= 400) requestFailures.push(`${response.request().method()} ${response.url()} (HTTP ${status})`)
          const resourceType = response.request().resourceType()
          if (!isMediaResource(resourceType)) return
          const contentType = response.headers()['content-type'] ?? ''
          mediaEvidence.push({ url: response.url(), resourceType, status, contentType })
          if (!response.ok() || !expectedMediaType(resourceType, contentType)) {
            mediaFailures.push(`${resourceType} ${response.url()} HTTP ${status} content-type=${contentType || '<missing>'}`)
          }
        }
        const onRequestFailed = (request: import('@playwright/test').Request) => {
          const requestUrl = new URL(request.url())
          if (!isFirstPartyAsset(requestUrl, surface.baseUrl)) return
          const errorText = request.failure()?.errorText ?? 'failed'
          if (request.resourceType() === 'media' && errorText === 'net::ERR_ABORTED') return
          requestFailures.push(`${request.method()} ${request.url()} (${errorText})`)
        }
        page.on('response', onResponse)
        page.on('requestfailed', onRequestFailed)

        try {
          await setupTenantHeaders(page, surface.baseUrl, surface.headers)
          const expectedUrl = new URL(route.path, `${surface.baseUrl}/`).toString()
          const response = await page.goto(expectedUrl, { waitUntil: 'load' })
          expect(response?.status()).toBe(200)
          const finalUrl = new URL(page.url())
          expect(finalUrl.origin, `${surface.name}:${route.path} final origin`).toBe(route.expectedOrigin)
          expect(finalUrl.pathname, `${surface.name}:${route.path} final path`).toBe(route.expectedPath)
          expect(finalUrl.search, `${surface.name}:${route.path} final query`).toBe('')
          expect(finalUrl.hash, `${surface.name}:${route.path} final fragment`).toBe('')
          for (const redirect of redirects) expect(isAllowedRedirect(route, redirect), `${surface.name}:${route.path} unexpected redirect`).toBe(true)
          if (route.allowRedirects.length === 0) expect(redirects, `${surface.name}:${route.path} must not redirect`).toHaveLength(0)
          await expect(page.locator(route.identity)).toBeVisible()
          await expect(page.locator('body')).toContainText(new RegExp(route.content, 'i'))
          const structure = await page.evaluate(async () => {
            const root = document.scrollingElement ?? document.documentElement
            const step = Math.max(window.innerHeight - 64, 256)
            let y = 0
            while (y <= Math.max(root.scrollHeight, document.body?.scrollHeight ?? 0)) {
              window.scrollTo(0, y)
              await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)))
              y += step
            }
            window.scrollTo(0, 0)
            const scrollHeight = Math.max(root.scrollHeight, document.body?.scrollHeight ?? 0)
            const sections = [...document.querySelectorAll('main section, main article, [role="main"] section, [role="main"] article')]
            const blankSections = sections.filter(section => {
              const text = (section.textContent ?? '').replace(/\s+/g, '').trim()
              return !text && !section.querySelector('img,video,svg,canvas,iframe,hr')
            }).length
            return {
              scrollHeight,
              mainCount: document.querySelectorAll('main, [role="main"]').length,
              blankSections,
              bodyTextLength: (document.body?.innerText ?? '').trim().length,
            }
          })
          await page.waitForTimeout(150)
          expect(structure.mainCount, `${surface.name}:${route.path} must render a main region`).toBeGreaterThan(0)
          expect(structure.bodyTextLength, `${surface.name}:${route.path} must render visible page copy`).toBeGreaterThan(0)
          expect(structure.blankSections, `${surface.name}:${route.path} has blank sections`).toBe(0)
          await expectHealthyPage(page, errors)
          expect(requestFailures).toEqual([])
          expect(mediaFailures, `${surface.name}:${route.path} first-party media failures: ${mediaEvidence.map(item => item.url).join(', ')}`).toEqual([])
        } finally {
          page.off('response', onResponse)
          page.off('requestfailed', onRequestFailed)
        }
      })
    }
  })
}
