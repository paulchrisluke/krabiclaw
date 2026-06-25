// Server-to-server GA4 event delivery for billing lifecycle events that only
// the Stripe webhook can observe (payment success/failure, renewals, cancellations).
// Browser-side checkout_started/plan_viewed events stay in composables/useAnalytics.ts —
// this is only for events whose source of truth is the webhook, not a page load.
interface Ga4MeasurementEnv {
  GA4_MEASUREMENT_ID?: string
  GA4_API_SECRET?: string
}

interface Ga4Event {
  name: string
  params?: Record<string, string | number | boolean | undefined>
}

// GA4 Measurement Protocol requires a client_id to attribute the event to a
// session. Without one, Stripe-sourced events still land in GA4 (Realtime/
// Events reports) but won't join to the browsing session that started checkout.
export async function sendGa4Event(
  env: Ga4MeasurementEnv,
  clientId: string | null | undefined,
  event: Ga4Event,
): Promise<void> {
  const measurementId = env.GA4_MEASUREMENT_ID
  const apiSecret = env.GA4_API_SECRET
  if (!measurementId || !apiSecret) return

  const resolvedClientId = clientId || crypto.randomUUID()

  try {
    const response = await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`,
      {
        method: 'POST',
        body: JSON.stringify({
          client_id: resolvedClientId,
          events: [{ name: event.name, params: event.params ?? {} }],
        }),
      },
    )
    if (!response.ok) {
      console.error('ga4_measurement_protocol_failed', { status: response.status, event: event.name })
    }
  } catch (error) {
    console.error('ga4_measurement_protocol_error', { event: event.name, error: error instanceof Error ? error.message : String(error) })
  }
}
