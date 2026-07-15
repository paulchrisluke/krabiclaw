import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildOnboardingChecklistItems,
  buildOnboardingStarterPrompt,
  getQuickActionPrompts,
  type OnboardingChecklistResponse,
} from '../../composables/useOnboardingPrompts.ts'

function checklist(overrides: Partial<OnboardingChecklistResponse> = {}): OnboardingChecklistResponse {
  return {
    success: true,
    vertical: 'professional_service',
    brandName: 'Acme Legal Group',
    city: 'Raleigh',
    items: {
      business_info: true,
      hero_image: true,
      menu_or_experiences: false,
      story: true,
      post: true,
    },
    ...overrides,
  }
}

test('professional_service checklist replaces "Menu added" with a services task using consultation/contact language', () => {
  const items = buildOnboardingChecklistItems(checklist())
  const offeringItem = items.find(item => item.key === 'menu_or_experiences')
  assert.equal(offeringItem?.label, 'Services added')
  assert.match(offeringItem!.prompt, /services|clients/i)
  assert.ok(!/menu|dish|dining/i.test(offeringItem!.prompt))
})

test('restaurant/experience checklist labels remain unchanged', () => {
  const restaurantItems = buildOnboardingChecklistItems(checklist({ vertical: 'restaurant' }))
  assert.equal(restaurantItems.find(item => item.key === 'menu_or_experiences')?.label, 'Menu added')

  const experienceItems = buildOnboardingChecklistItems(checklist({ vertical: 'experience' }))
  assert.equal(experienceItems.find(item => item.key === 'menu_or_experiences')?.label, 'Experiences listed')
})

test('starter prompt says "professional-service site", not "restaurant site", for professional_service', () => {
  const prompt = buildOnboardingStarterPrompt(checklist({
    items: { business_info: true, hero_image: true, menu_or_experiences: false, story: true, post: true },
  }))
  assert.match(prompt, /professional-service site/)
  assert.ok(!/restaurant site/.test(prompt))
})

test('starter prompt "all done" branch also uses professional-service wording', () => {
  const prompt = buildOnboardingStarterPrompt(checklist({
    items: { business_info: true, hero_image: true, menu_or_experiences: true, story: true, post: true },
  }))
  assert.match(prompt, /professional-service site/)
})

test('quick actions for professional_service use consultation/services language, not dining/menu language', () => {
  const prompts = getQuickActionPrompts('professional_service')
  assert.ok(prompts.some(p => /services/i.test(p)))
  assert.ok(prompts.some(p => /consultation/i.test(p)))
  assert.ok(!prompts.some(p => /menu|booking/i.test(p) && !/consultation/i.test(p)))
})

test('quick actions for restaurant/experience remain unchanged', () => {
  const restaurantPrompts = getQuickActionPrompts('restaurant')
  assert.ok(restaurantPrompts.some(p => /menu/i.test(p)))

  const experiencePrompts = getQuickActionPrompts('experience')
  assert.ok(experiencePrompts.some(p => /experiences/i.test(p)))
})
