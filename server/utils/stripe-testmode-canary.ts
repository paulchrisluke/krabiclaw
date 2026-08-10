const TEST_STRIPE_SECRET_KEY = /^(?:sk|rk)_test_[A-Za-z0-9]+$/

export function isStripeTestSecretKey(value: string | undefined): boolean {
  return TEST_STRIPE_SECRET_KEY.test(value?.trim() ?? '')
}

/**
 * The billing-state route must remain provider-free for ordinary E2E reads.
 * Only the explicit canary request may ask it to call Better Auth's
 * subscription API, and that request must carry a test-mode Stripe key.
 */
export function shouldReadStripeTestCanaryBillingState(input: {
  requested: boolean
  canaryHeader: string | undefined
  secretKey: string | undefined
}): boolean {
  return input.requested
    && input.canaryHeader === '1'
    && isStripeTestSecretKey(input.secretKey)
}
