import test from 'node:test'
import assert from 'node:assert/strict'

import { VALID_VERTICALS } from '../../server/utils/site-creation.ts'
import { resolvePublicTemplate } from '../../utils/template-registry.ts'

test('VALID_VERTICALS includes professional_service alongside restaurant and experience', () => {
  assert.deepEqual(VALID_VERTICALS, ['restaurant', 'experience', 'professional_service'])
})

test('every VALID_VERTICALS entry resolves to a template via the shared registry (no dead-end vertical)', () => {
  for (const vertical of VALID_VERTICALS) {
    const template = resolvePublicTemplate({ vertical })
    assert.ok(template, `expected a template for vertical "${vertical}"`)
  }

  const restaurantTemplate = resolvePublicTemplate({ vertical: 'restaurant' })
  const experienceTemplate = resolvePublicTemplate({ vertical: 'experience' })
  const professionalServiceTemplate = resolvePublicTemplate({ vertical: 'professional_service' })

  assert.equal(restaurantTemplate.themeId, 'saya-theme-v1')
  assert.equal(experienceTemplate.themeId, 'saya-theme-v1')
  assert.equal(professionalServiceTemplate.themeId, 'blawby-theme-v1')
})
