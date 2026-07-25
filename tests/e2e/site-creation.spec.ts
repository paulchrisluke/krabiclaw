import { expect, test } from '@playwright/test'
import { devLoginHeaders, devLoginUrl } from './test-env'

test.describe('site creation contracts', () => {
  test('site creation requires an explicit vertical', async ({ request, baseURL }) => {
    const suffix = Date.now()
    const ownerLogin = await request.get(devLoginUrl(baseURL!, `e2e-site-creation-vertical-${suffix}`), {
      headers: devLoginHeaders(),
      maxRedirects: 0,
    })
    expect(ownerLogin.status()).toBe(302)
    const missingVerticalRes = await request.post(`${baseURL}/api/sites`, {
      data: {
        name: `Missing Vertical ${suffix}`,
        subdomain: `missing-vertical-${suffix}`,
      },
    })
    expect(missingVerticalRes.status()).toBe(400)
    expect(await missingVerticalRes.json()).toEqual({
      error: 'vertical is required and must be one of: restaurant, experience, professional_service',
    })

    const invalidVerticalRes = await request.post(`${baseURL}/api/sites`, {
      data: {
        name: `Invalid Vertical ${suffix}`,
        subdomain: `invalid-vertical-${suffix}`,
        vertical: 'invalid',
      },
    })
    expect(invalidVerticalRes.status()).toBe(400)
    expect(await invalidVerticalRes.json()).toEqual({
      error: 'vertical is required and must be one of: restaurant, experience, professional_service',
    })
  })

  test('an authenticated user can create multiple site workspaces', async ({ request, baseURL }) => {
    const suffix = Date.now()
    const ownerLogin = await request.get(devLoginUrl(baseURL!, `e2e-site-creation-multi-${suffix}`), {
      headers: devLoginHeaders(),
      maxRedirects: 0,
    })
    expect(ownerLogin.status()).toBe(302)
    const firstRes = await request.post(`${baseURL}/api/sites`, {
      data: {
        name: `Multi Site One ${suffix}`,
        subdomain: `multi-site-one-${suffix}`,
        vertical: 'restaurant',
      },
    })
    expect(firstRes.status()).toBe(200)
    const first = await firstRes.json() as { siteId: string; organizationId: string; subdomain: string }

    const secondRes = await request.post(`${baseURL}/api/sites`, {
      data: {
        name: `Multi Site Two ${suffix}`,
        subdomain: `multi-site-two-${suffix}`,
        vertical: 'experience',
      },
    })
    expect(secondRes.status()).toBe(200)
    const second = await secondRes.json() as { siteId: string; organizationId: string; subdomain: string }

    expect(first.siteId).toEqual(expect.any(String))
    expect(second.siteId).toEqual(expect.any(String))
    expect(second.siteId).not.toBe(first.siteId)
    expect(second.organizationId).toBe(first.organizationId)
    expect(second.subdomain).toBe(`multi-site-two-${suffix}`)
  })

  test('professional_service onboarding resolves the Blawby theme through the template registry, not the Saya default', async ({ request, baseURL }) => {
    const suffix = Date.now()
    const ownerLogin = await request.get(devLoginUrl(baseURL!, `e2e-professional-service-${suffix}`), {
      headers: devLoginHeaders(),
      maxRedirects: 0,
    })
    expect(ownerLogin.status()).toBe(302)

    const createRes = await request.post(`${baseURL}/api/sites`, {
      data: {
        name: `Professional Service Firm ${suffix}`,
        subdomain: `e2e-professional-service-${suffix}`,
        vertical: 'professional_service',
      },
    })
    expect(createRes.status()).toBe(200)
    const created = await createRes.json() as { siteId: string }

    const siteRes = await request.get(`${baseURL}/api/sites/${created.siteId}`)
    expect(siteRes.status()).toBe(200)
    const site = await siteRes.json() as { theme_id: string; vertical: string }
    expect(site.theme_id).toBe('blawby-theme-v1')
    // sites.vertical is stored as 'service' (see sites_vertical_check in server/db/schema.ts) —
    // 'professional_service' is the app-level/copy-registry alias, bridged by
    // toStoredVertical() in server/utils/site-creation.ts.
    expect(site.vertical).toBe('service')
  })

  test('restaurant and experience onboarding still resolve the Saya theme', async ({ request, baseURL }) => {
    const suffix = Date.now()
    const ownerLogin = await request.get(devLoginUrl(baseURL!, `e2e-saya-theme-${suffix}`), {
      headers: devLoginHeaders(),
      maxRedirects: 0,
    })
    expect(ownerLogin.status()).toBe(302)

    const createRes = await request.post(`${baseURL}/api/sites`, {
      data: {
        name: `Saya Theme Site ${suffix}`,
        subdomain: `e2e-saya-theme-${suffix}`,
        vertical: 'experience',
      },
    })
    expect(createRes.status()).toBe(200)
    const created = await createRes.json() as { siteId: string }

    const siteRes = await request.get(`${baseURL}/api/sites/${created.siteId}`)
    expect(siteRes.status()).toBe(200)
    const site = await siteRes.json() as { theme_id: string; vertical: string }
    expect(site.theme_id).toBe('saya-theme-v1')
    expect(site.vertical).toBe('experience')
  })
})
