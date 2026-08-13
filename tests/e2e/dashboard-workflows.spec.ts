import { expect, test } from '@playwright/test'
import { ensureSite } from './helpers/ensure-site'
import { loginAs } from './helpers/auth'
import { dashboardOrgHeaders } from './test-env'

test.describe('dashboard workflow smoke', () => {
  test('public contact submission writes a server-owned site event', async ({ request, baseURL }) => {
    test.setTimeout(60_000)

    // A dedicated credentialed user rather than the shared demo owner:
    // /api/dashboard/context only auto-selects a site when the org has exactly
    // one, and the default user's org can end up with
    // zero or several sites depending on what else ran earlier in the suite.
    // Creating our own site keeps this deterministic.
    await loginAs(request, baseURL!, 'user-e2e-dashboard-contact')

    const contextRes = await request.get(`${baseURL}/api/dashboard/context`)
    expect(contextRes.status()).toBe(200)
    const context = await contextRes.json()
    // This blank credential fixture has no organization yet (signup no longer
    // auto-creates one — see server/utils/dashboard-context.ts), so the org
    // slug isn't known until after ensureSite creates one via POST /api/sites.
    const siteId = await ensureSite(request, baseURL!, context.site?.id ?? null)

    const contextAfterSiteRes = await request.get(`${baseURL}/api/dashboard/context`)
    expect(contextAfterSiteRes.status()).toBe(200)
    const contextAfterSite = await contextAfterSiteRes.json()
    const orgHeaders = dashboardOrgHeaders(contextAfterSite.organization.slug)

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

    const eventsRes = await request.get(`${baseURL}/api/dashboard/events?limit=50`, { headers: orgHeaders })
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
    await loginAs(request, baseURL!)

    const contextRes = await request.get(`${baseURL}/api/dashboard/context`)
    expect(contextRes.status()).toBe(200)
    const context = await contextRes.json()
    const orgHeaders = dashboardOrgHeaders(context.organization.slug)

    const title = `E2E Work Request ${Date.now()}`
    const postRes = await request.post(`${baseURL}/api/dashboard/work-requests`, {
      headers: orgHeaders,
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

    const listRes = await request.get(`${baseURL}/api/dashboard/work-requests`, { headers: orgHeaders })
    expect(listRes.status()).toBe(200)
    const listBody = await listRes.json()
    expect(Array.isArray(listBody.requests)).toBe(true)
    expect(listBody.requests.some((row: { title: string }) => row.title === title)).toBe(true)
  })
})
