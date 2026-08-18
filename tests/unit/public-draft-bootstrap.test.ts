import assert from 'node:assert/strict'
import test from 'node:test'

import { buildDraftShellPayload } from '../../server/utils/public-draft-bootstrap.ts'
import { buildOnboardingDraftPayload } from '../../server/utils/onboarding-drafts.ts'
import { isRecord } from '../../utils/api-clients.ts'
import { isPublicShellPayload } from '../../utils/public-resource-contracts.ts'

Object.assign(globalThis, { isRecord })

test('manual onboarding draft shell satisfies the public shell contract without uploaded media', () => {
  const draft = buildOnboardingDraftPayload({
    name: 'Onboard Test Cafe',
    vertical: 'restaurant',
    place: null,
    details: {
      name: 'Onboard Test Cafe',
      city: 'Ao Nang',
      address: '123 Moo 5, Ao Nang, Krabi',
      phone: '+14233586761',
      websiteUrl: null,
      openingHours: null,
      notificationPhone: null,
      timezone: 'UTC',
      currency: 'THB',
      isPrimary: true,
    },
  })

  const shell = buildDraftShellPayload(draft)

  assert.equal(shell.site.logo_url, null)
  assert.equal(shell.config.logo_url, '')
  assert.equal(shell.config.og_image_url, '')
  assert.equal(shell.config.hero_image_url, '')
  assert.ok(Object.values(shell.config).every(value => typeof value === 'string'))
  assert.equal(isPublicShellPayload(shell), true)
})
