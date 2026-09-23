import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'
import { devLoginHeaders } from './test-env'

test('signed Stripe ingress accepts a signed event and rejects invalid signatures', async ({ request }) => {
  const eventId = `evt_e2e_${randomUUID().replaceAll('-', '')}`
  const payload = JSON.stringify({
    id: eventId, object: 'event', type: 'customer.created',
    created: Math.floor(Date.now() / 1000), livemode: false,
    data: { object: { id: `cus_e2e_${randomUUID()}`, object: 'customer' } },
  })
  const signatureResponse = await request.post('/api/dev/stripe-signature', {
    headers: devLoginHeaders(), data: { payload },
  })
  expect(signatureResponse.status(), await signatureResponse.text()).toBe(200)
  const { signature } = await signatureResponse.json()
  // Stripe's own delivery retries are the retry mechanism, so a redelivery is
  // simply accepted again; there is no application-owned webhook queue to read.
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await request.post('/api/auth/stripe/webhook', {
      headers: { 'content-type': 'application/json', 'stripe-signature': signature }, data: payload,
    })
    expect(response.status(), await response.text()).toBe(200)
  }
  const invalid = await request.post('/api/auth/stripe/webhook', {
    headers: { 'content-type': 'application/json', 'stripe-signature': `${signature}0` }, data: payload,
  })
  expect(invalid.status()).toBe(400)
})

test('compact signed email reply persists once and rejects a changed address', async ({ request, baseURL }) => {
  test.setTimeout(90_000)
  const fetchPhase = async (phase: string, path: string, options: Parameters<typeof request.fetch>[1]) => {
    const requestId = randomUUID()
    const startedAt = Date.now()
    const diagnostic = { phase, requestId, path }
    return test.step(phase, async () => {
      console.info('[e2e-provider-ingress]', JSON.stringify({ event: 'started', ...diagnostic, at: new Date(startedAt).toISOString() }))
      try {
        const response = await request.fetch(path, {
          ...options, timeout: 15_000, maxRetries: 0,
          headers: { ...options?.headers, 'x-request-id': requestId },
        })
        console.info('[e2e-provider-ingress]', JSON.stringify({
          event: 'finished', ...diagnostic, durationMs: Date.now() - startedAt,
          status: response.status(), rayId: response.headers()['cf-ray'] ?? null,
        }))
        return response
      } catch {
        console.error('[e2e-provider-ingress]', JSON.stringify({ event: 'transport_failed', ...diagnostic, durationMs: Date.now() - startedAt }))
        throw new Error(`Provider ingress request failed: ${phase}; requestId=${requestId}`)
      }
    })
  }
  const name = `E5 ${randomUUID().slice(0, 12)}`
  const submitted = await fetchPhase('create contact', '/api/public/contact', {
    method: 'POST',
    // The public routes resolve their tenant from the host, and this runs against
    // the platform's, so the tenant is named rather than inferred.
    headers: { 'x-preview-tenant': 'demo' },
    data: { name, email: 'paulchrisluke@gmail.com', message: 'Please confirm the continuity check.', subject: 'general' },
  })
  expect(submitted.status(), await submitted.text()).toBe(201)
  await test.step('authenticate owner and select organization', () => loginAs(request, baseURL!, 'user-e2e-demo-owner'), { timeout: 30_000 })
  // This asked for ?search=<name> and asserted the whole inbox held one thread.
  // The route never implemented search, so the filter was dropped and the
  // assertion held only while org-demo happened to contain exactly one thread.
  // The route refuses unknown parameters now, so asking for one is a 400.
  const rejected = await fetchPhase('reject unsupported filter', '/api/dashboard/organizations/org-demo/guest-threads', { params: { search: name } })
  expect(rejected.status(), await rejected.text()).toBe(400)

  const listed = await fetchPhase('find contact thread', '/api/dashboard/organizations/org-demo/guest-threads', {})
  expect(listed.status(), await listed.text()).toBe(200)
  const { threads } = await listed.json() as { threads: Array<{ id: string; guestName: string }> }
  const own = threads.filter(thread => thread.guestName === name)
  expect(own, `no guest thread named ${name} in org-demo's ${threads.length} threads`).toHaveLength(1)
  const detailUrl = `/api/dashboard/organizations/org-demo/guest-threads/${own[0]!.id}`
  const initialResponse = await fetchPhase('read initial entries', detailUrl, {})
  expect(initialResponse.status(), await initialResponse.text()).toBe(200)
  const { thread: initial } = await initialResponse.json()
  const data = {
    submissionType: 'contact', submissionId: initial.submissionId,
    body: `Signed guest reply ${randomUUID()}`, messageId: randomUUID(),
  }
  const received = await fetchPhase('receive signed reply', '/api/dev/inbound-email', { method: 'POST', headers: devLoginHeaders(), data })
  expect(received.status(), await received.text()).toBe(200)
  const { replyTo } = await received.json()
  expect(replyTo).toMatch(/^rc[0-9a-f]{56}@/)
  const duplicate = await fetchPhase('receive duplicate reply', '/api/dev/inbound-email', { method: 'POST', headers: devLoginHeaders(), data: { ...data, replyTo } })
  expect(duplicate.status(), await duplicate.text()).toBe(200)
  const [localPart, domain] = replyTo.split('@')
  for (const { phase, address } of [
    { phase: 'reject altered signature', address: `${localPart.slice(0, -1)}${localPart.endsWith('0') ? '1' : '0'}@${domain}` },
    { phase: 'reject wrong domain', address: `${localPart}@invalid.example` },
  ]) {
    const invalid = await fetchPhase(phase, '/api/dev/inbound-email', {
      method: 'POST',
      headers: devLoginHeaders(), data: { ...data, messageId: randomUUID(), replyTo: address },
    })
    expect(invalid.status()).toBeGreaterThanOrEqual(400)
  }
  const finalResponse = await fetchPhase('verify final entries', detailUrl, {})
  expect(finalResponse.status(), await finalResponse.text()).toBe(200)
  const { thread: final } = await finalResponse.json()
  expect(final.entries).toHaveLength(initial.entries.length + 1)
  expect(final.entries.at(-1)).toMatchObject({ body: data.body, channel: 'email', actorKind: 'guest' })
})
