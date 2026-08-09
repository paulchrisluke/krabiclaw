export const STRIPE_API_VERSION = '2026-04-22.dahlia' as const
// Stripe lets webhook destinations pin the event-rendering schema separately
// from the outbound client API version. Keep this endpoint contract explicit;
// changing the client version must not silently upgrade inbound webhook events.
export const STRIPE_WEBHOOK_API_VERSION = '2025-11-17.clover' as const
export const STRIPE_REQUEST_TIMEOUT_MS = 10_000 as const
export const STRIPE_WEBHOOK_PATH = '/api/billing/webhook' as const
