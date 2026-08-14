import { expect, test } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { loginAs } from './helpers/auth'
import { devLoginHeaders } from './test-env'

async function loginAsOwner(request: APIRequestContext, baseURL: string, userId: string) {
  await loginAs(request, baseURL, userId)
}

async function ensureSite(request: APIRequestContext, baseURL: string, siteId: string | null) {
  if (siteId) return siteId

  const suffix = Date.now()
  const createRes = await request.post(`${baseURL}/api/sites`, {
    data: {
      name: `E2E Settings ${suffix}`,
      subdomain: `e2e-settings-${suffix}`,
      vertical: 'restaurant',
    },
  })
  expect(createRes.status()).toBe(200)
  const createBody = await createRes.json() as {
    siteId?: string | null
  }
  const createdSiteId = createBody.siteId ?? null
  expect(createdSiteId).toEqual(expect.any(String))
  return createdSiteId
}

test.describe('site settings', () => {
  test('rename rollback preserves original brand and subdomain when provisioning fails', async ({ request, baseURL }) => {
    test.setTimeout(60_000)

    await loginAsOwner(request, baseURL!, 'user-e2e-site-settings')

    const contextRes = await request.get(`${baseURL}/api/dashboard/context`)
    expect(contextRes.status()).toBe(200)
    const context = await contextRes.json() as {
      site?: { id?: string | null }
    }
    const siteId = await ensureSite(request, baseURL!, context.site?.id ?? null)

    const beforeRes = await request.get(`${baseURL}/api/sites/${siteId}/settings`)
    expect(beforeRes.status()).toBe(200)
    const beforeBody = await beforeRes.json() as {
      settings: {
        brand_name: string
        subdomain: string
      }
    }

    const failedRenameRes = await request.patch(`${baseURL}/api/sites/${siteId}/settings`, {
      headers: {
        ...devLoginHeaders(),
        'x-e2e-force-subdomain-failure': 'true',
      },
      data: {
        brand_name: `${beforeBody.settings.brand_name} Rollback Probe ${Date.now()}`,
      },
    })
    expect(failedRenameRes.status()).toBe(400)
    expect(await failedRenameRes.json()).toEqual({
      error: 'Failed to register subdomain with Cloudflare. The rename was not applied.',
    })

    const afterRes = await request.get(`${baseURL}/api/sites/${siteId}/settings`)
    expect(afterRes.status()).toBe(200)
    const afterBody = await afterRes.json() as {
      settings: {
        brand_name: string
        subdomain: string
      }
    }

    expect(afterBody.settings.brand_name).toBe(beforeBody.settings.brand_name)
    expect(afterBody.settings.subdomain).toBe(beforeBody.settings.subdomain)
  })
})
