import { expect, test } from '@playwright/test'
import { ensureSite } from './helpers/ensure-site'
import { devLoginHeaders, devLoginUrl } from './test-env'

test.describe('dashboard workflow smoke', () => {
  test('public contact submission writes a server-owned site event', async ({ request, baseURL }) => {
    test.setTimeout(60_000)

    // A fresh dedicated user rather than the shared default dev-login user:
    // /api/dashboard/context only auto-selects a site when the org has exactly
    // one (see resolveSingleOrgSite), and the default user's org can end up with
    // zero or several sites depending on what else ran earlier in the suite.
    // Creating our own site keeps this deterministic.
    const suffix = Date.now()
    const login = await request.get(devLoginUrl(baseURL!, `e2e-dashboard-contact-event-${suffix}`), { headers: devLoginHeaders() })
    expect(login.status()).toBeLessThan(400)

    const contextRes = await request.get(`${baseURL}/api/dashboard/context`)
    expect(contextRes.status()).toBe(200)
    const context = await contextRes.json()
    const siteId = await ensureSite(request, baseURL!, context.site?.id ?? null)

    const subject = 'general'

    const contactRes = await request.post(`${baseURL}/api/public/sites/${siteId}/contact`, {
      data: {
        name: 'Playwright Analytics Contact',
        email: `analytics-contact-${Date.now()}@example.test`,
        subject,
        message: 'Analytics reset contact coverage from Playwright.',
      },
    })
    expect(contactRes.status()).toBe(201)

    const eventsRes = await request.get(`${baseURL}/api/dashboard/events?limit=50`)
    expect(eventsRes.status()).toBe(200)
    const eventsBody = await eventsRes.json() as {
      events: Array<{ event_type: string; entity_type: string | null; metadata: Record<string, unknown> | null }>
    }
    expect(
      eventsBody.events.some((entry) =>
        entry.event_type === 'contact.created'
        && entry.entity_type === 'contact_submission'
        && entry.metadata?.subject === subject
        && !('guest_email' in (entry.metadata ?? {}))
      ),
    ).toBe(true)
  })

  test('support work-request submission is enforced by plan entitlement', async ({ request, baseURL }) => {
    const login = await request.get(devLoginUrl(baseURL!), { headers: devLoginHeaders() })
    expect(login.status()).toBeLessThan(400)

    const title = `E2E Work Request ${Date.now()}`
    const postRes = await request.post(`${baseURL}/api/dashboard/work-requests`, {
      data: {
        type: 'content_update',
        title,
        description: 'Playwright managed-service workflow test',
        priority: 'normal',
      },
    })

    if (postRes.status() === 403) {
      const body = await postRes.json()
      const error = String(body.error || '')
      // MANAGED_SERVICE_ENABLED is off by default at launch, which now blocks
      // work-request submission before the per-plan entitlement check even runs.
      expect(
        error.includes('Work requests require') || error.includes('Managed service is not currently available'),
      ).toBe(true)
      return
    }

    expect(postRes.status()).toBe(201)
    const body = await postRes.json()
    expect(body.success).toBe(true)
    expect(body.id).toEqual(expect.any(String))

    const listRes = await request.get(`${baseURL}/api/dashboard/work-requests`)
    expect(listRes.status()).toBe(200)
    const listBody = await listRes.json()
    expect(Array.isArray(listBody.requests)).toBe(true)
    expect(listBody.requests.some((row: { title: string }) => row.title === title)).toBe(true)
  })
})
