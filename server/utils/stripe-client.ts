import Stripe from 'stripe'

export const STRIPE_API_VERSION = '2026-04-22.dahlia' as const
export const STRIPE_REQUEST_TIMEOUT_MS = 10_000

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: 0,
    timeout: STRIPE_REQUEST_TIMEOUT_MS,
  })
}
