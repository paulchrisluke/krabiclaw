import test from 'node:test'
import assert from 'node:assert/strict'

import { buildOnboardingDraftPayload } from '../../server/utils/onboarding-drafts.ts'

const baseDetails = {
  name: 'Acme Legal Group',
  city: 'Raleigh',
  address: '123 Main St',
  phone: '+19195550100',
  websiteUrl: null,
  openingHours: null,
  notificationPhone: '+19195550100',
  timezone: 'America/New_York',
  isPrimary: true,
}

// Restaurant/experience-specific words that must never leak into a
// professional-service draft — see the Pottery House Krabi regression case
// and this issue's "no food/dining/guest/class/workshop" requirement.
const BANNED_WORDS = [
  'menu', 'dish', 'kitchen', 'dine', 'dining', 'reservation', 'table',
  'class', 'workshop', 'studio', 'guest', 'booking a class', 'chef',
]

function collectStrings(payload: ReturnType<typeof buildOnboardingDraftPayload>): string[] {
  const strings: string[] = []
  for (const row of payload.preview.content) {
    if (row.content) strings.push(row.content)
    if (row.hero_subtitle) strings.push(row.hero_subtitle)
  }
  for (const post of payload.preview.posts) strings.push(post.body, post.title)
  for (const { question, answer } of payload.preview.qa) {
    strings.push(question, answer)
  }
  return strings
}

test('professional_service draft has no menu', () => {
  const payload = buildOnboardingDraftPayload({
    name: 'Acme Legal Group',
    vertical: 'professional_service',
    place: null,
    details: baseDetails,
  })
  assert.equal(payload.preview.menu, null)
  assert.equal(payload.preview.hasExperiences, false)
})

test('professional_service draft copy contains no restaurant/experience leakage', () => {
  const payload = buildOnboardingDraftPayload({
    name: 'Acme Legal Group',
    vertical: 'professional_service',
    place: null,
    details: baseDetails,
  })

  const haystack = collectStrings(payload).join(' \n ').toLowerCase()
  for (const banned of BANNED_WORDS) {
    assert.ok(!haystack.includes(banned), `expected professional_service draft copy to omit "${banned}", got: ${haystack}`)
  }
})

test('professional_service draft uses consultation/services placeholders, not invented legal claims', () => {
  const payload = buildOnboardingDraftPayload({
    name: 'Acme Legal Group',
    vertical: 'professional_service',
    place: null,
    details: baseDetails,
  })

  const aboutCta = payload.preview.content.find(row => row.page === 'about' && row.field === 'cta.title')
  assert.equal(aboutCta?.content, 'Talk with our team')

  const qaQuestions = payload.preview.qa.map(q => q.question)
  assert.ok(qaQuestions.some(q => /consultation/i.test(q)))
  assert.ok(qaQuestions.some(q => /services/i.test(q)))

  // No invented practice areas (e.g. "family law", "immigration") — only
  // clearly-editable generic placeholders.
  const haystack = collectStrings(payload).join(' \n ').toLowerCase()
  assert.ok(!haystack.includes('family law'))
  assert.ok(!haystack.includes('immigration'))
  assert.ok(!haystack.includes('north carolina legal services'))
})

test('restaurant and experience drafts are unchanged (still get a menu / experiences flag respectively)', () => {
  const restaurantPayload = buildOnboardingDraftPayload({
    name: 'Test Cafe',
    vertical: 'restaurant',
    place: null,
    details: baseDetails,
  })
  assert.ok(restaurantPayload.preview.menu, 'expected restaurant draft to include a sample menu')
  assert.equal(restaurantPayload.preview.hasExperiences, false)

  const experiencePayload = buildOnboardingDraftPayload({
    name: 'Test Studio',
    vertical: 'experience',
    place: null,
    details: baseDetails,
  })
  assert.equal(experiencePayload.preview.menu, null)
  assert.equal(experiencePayload.preview.hasExperiences, true)
})
