import Stripe from 'stripe'
import {
  STRIPE_API_VERSION,
  STRIPE_REQUEST_TIMEOUT_MS,
} from '~/shared/stripe-contract'

export { STRIPE_API_VERSION, STRIPE_REQUEST_TIMEOUT_MS } from '~/shared/stripe-contract'

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: 0,
    timeout: STRIPE_REQUEST_TIMEOUT_MS,
  })
}
