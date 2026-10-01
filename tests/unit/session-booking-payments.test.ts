import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computed, effectScope, ref, toValue, watch } from 'vue'
import type { SessionBookingContext } from '../../composables/useSessionBooking'

test('booking retries preserve uncertain payment identity and rotate changed or expired requests', async (t) => {
  const bodies: Record<string, unknown>[] = []
  const destinations: string[] = []
  let expired = false
  t.mock.method(globalThis, 'fetch', async (_input, options) => {
    bodies.push(JSON.parse(String(options?.body)))
    return new Response(JSON.stringify(expired ? { data: { code: 'checkout_expired' } } : { message: 'Provider outcome is uncertain' }), {
      status: expired ? 409 : 503, headers: { 'content-type': 'application/json' },
    })
  })
  const globals = { computed, ref, toValue, watch,
    useI18n: () => ({ locale: ref('en'), t: (key: string) => key }),
    useOrganizationConversionTracking: () => ({ trackCheckoutStart() {}, mirrorSubmission() {}, pageEventId: async () => 'test-page' }),
    navigateTo: async (url: string) => { destinations.push(url) },
  }
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  Object.assign(globalThis, globals)
  const scope = effectScope()
  t.after(() => {
    scope.stop()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  })
  const { useSessionBooking } = await import('../../composables/useSessionBooking')
  const context = ref({
    organizationId: 'merchant', organizationName: 'Merchant', currency: 'USD', location: null,
    product: { id: 'product', slug: 'product', name: 'Offering', variants: [{ id: 'variant', active: true }] },
    sessions: [
      { id: 'session-one', starts_at: '2027-01-01T10:00:00Z', ends_at: '2027-01-01T11:00:00Z', timezone: 'UTC', remaining: 10, is_full: false },
      { id: 'session-two', starts_at: '2027-01-01T12:00:00Z', ends_at: '2027-01-01T13:00:00Z', timezone: 'UTC', remaining: 10, is_full: false },
    ],
  } as SessionBookingContext)
  const controller = scope.run(() => useSessionBooking(context))!
  controller.timeSelection.value = { day: '2027-01-01', time: '10:00' }
  const contact = { name: 'Buyer', email: 'buyer@example.com', phone: '', notes: '' }
  await controller.submitBooking(contact)
  await controller.submitBooking(contact)
  assert.equal(bodies[0]!.idempotency_key, bodies[1]!.idempotency_key, 'uncertain provider outcome retries the same payment')
  const changed = { ...contact, email: 'other@example.com' }
  await controller.submitBooking(changed)
  assert.notEqual(bodies[1]!.idempotency_key, bodies[2]!.idempotency_key)
  controller.timeSelection.value = { day: '2027-01-01', time: '12:00' }
  await controller.submitBooking(changed)
  assert.notEqual(bodies[2]!.idempotency_key, bodies[3]!.idempotency_key)
  assert.equal(bodies[3]!.session_id, 'session-two')
  controller.selectedVariantId.value = 'other-variant'
  await controller.submitBooking(changed)
  assert.notEqual(bodies[3]!.idempotency_key, bodies[4]!.idempotency_key)
  controller.partySize.value = 2
  await controller.submitBooking(changed)
  assert.notEqual(bodies[4]!.idempotency_key, bodies[5]!.idempotency_key)
  expired = true
  await controller.submitBooking(changed)
  assert.equal(bodies[5]!.idempotency_key, bodies[6]!.idempotency_key)
  expired = false
  await controller.submitBooking(changed)
  assert.notEqual(bodies[6]!.idempotency_key, bodies[7]!.idempotency_key, 'expired checkout starts a new hold')
  context.value.showPartySize = false
  controller.partySize.value = 9
  await controller.submitBooking(changed)
  assert.equal(bodies[8]!.party_size, 1, 'online consultation retains foundation single-operator contract')
  controller.partySize.value = 5
  await controller.submitBooking(changed)
  assert.equal(bodies[8]!.idempotency_key, bodies[9]!.idempotency_key)
  assert.deepEqual(destinations, [], 'failed financial handoffs never navigate')
})
