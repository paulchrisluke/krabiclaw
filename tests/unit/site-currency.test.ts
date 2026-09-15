import assert from 'node:assert/strict'
import test from 'node:test'
import { currencyForCountry, isCurrencyCode, SUPPORTED_CURRENCIES } from '../../shared/currencies.ts'
import { ONBOARDING_STEPS, type OnboardingFlowState } from '../../composables/useOnboardingFlow.ts'

const step = (id: string) => {
  const found = ONBOARDING_STEPS.find(entry => entry.id === id)
  assert.ok(found, `the flow has no '${id}' step`)
  return found
}

// The wizard's answers as a fresh flow holds them, with only the fields these
// assertions read. The flow's own emptyState is not exported; what matters here
// is that no step treats an unanswered country or currency as an answer.
const answers = (over: Partial<OnboardingFlowState['details']> = {}) => ({
  details: {
    name: 'Cozy Cafe', city: 'Krabi', streetAddress: '123 Main Street', addressLine2: '',
    region: 'Krabi', postalCode: '', country: '', phone: '', currency: null, ...over,
  },
} as OnboardingFlowState)

test('a country proposes the currency its businesses price in', () => {
  assert.equal(currencyForCountry('TH'), 'THB')
  assert.equal(currencyForCountry('US'), 'USD')
  assert.equal(currencyForCountry('FR'), 'EUR')
  assert.equal(currencyForCountry('DE'), 'EUR')
  assert.equal(currencyForCountry('JP'), 'JPY')
  // Case and surrounding space come from form input, not from a normalized store.
  assert.equal(currencyForCountry(' th '), 'THB')
  assert.equal(currencyForCountry('th'), 'THB')
})

test('a country with no supported currency proposes nothing rather than USD', () => {
  // Mexico, Brazil and the UAE are real countries this platform cannot price in
  // yet. Answering USD for them is the bug, not the fallback.
  for (const country of ['MX', 'BR', 'AE', 'ZA', 'NG']) {
    assert.equal(currencyForCountry(country), null, `${country} must not propose a currency`)
  }
  assert.equal(currencyForCountry(''), null)
  assert.equal(currencyForCountry(null), null)
  assert.equal(currencyForCountry(undefined), null)
  assert.equal(currencyForCountry('not a country'), null)
})

test('every proposed currency is one the platform supports', () => {
  for (const country of ['TH', 'US', 'GB', 'JP', 'AU', 'CA', 'SG', 'HK', 'MY', 'ID', 'PH', 'VN', 'IN', 'IE', 'PT']) {
    const currency = currencyForCountry(country)
    assert.ok(currency && isCurrencyCode(currency), `${country} proposed an unsupported ${currency}`)
    assert.ok((SUPPORTED_CURRENCIES as readonly string[]).includes(currency))
  }
})

// The reported bug: a Krabi restaurant reached the end of onboarding priced in
// USD. The country field was never touched, so the flow's own default stood in
// for an answer and the currency followed it.
test('the location step is not complete until the country is answered', () => {
  const location = step('location')
  assert.equal(location.complete(answers({ country: '' })), false)
  assert.equal(location.complete(answers({ country: 'TH' })), true)
  // Street and city still matter; country is an addition, not a replacement.
  assert.equal(location.complete(answers({ country: 'TH', city: '' })), false)
  assert.equal(location.complete(answers({ country: 'TH', streetAddress: '' })), false)
})

test('the currency step is not complete until the currency is answered', () => {
  const currency = step('currency')
  assert.equal(currency.complete(answers({ currency: null })), false)
  assert.equal(currency.complete(answers({ currency: 'THB' })), true)
  // It is not optional, so the flow cannot be walked past it without an answer.
  assert.notEqual(currency.optional, true)
  assert.notEqual(currency.intro, true)
})

test('the currency step is asked before anything is priced', () => {
  const order = ONBOARDING_STEPS.map(entry => entry.id)
  assert.ok(order.indexOf('currency') > order.indexOf('location'), 'the country must be answered first')
  assert.ok(order.indexOf('currency') < order.indexOf('products'), 'prices must not be entered first')
  assert.ok(order.indexOf('currency') < order.indexOf('review'))
})

test('adding a location to an existing site does not ask for a currency', () => {
  // That site already has one, and a location does not carry its own.
  assert.equal(step('currency').flows.includes('add-location'), false)
})
