import assert from 'node:assert/strict'
import test from 'node:test'

import { validateProfessionalServicePayload } from '../../server/utils/professional-services-editor.ts'

test('professional-services structured editor rejects tenant-page authoring', () => {
  assert.throws(
    () => validateProfessionalServicePayload({ tenantPages: [{ path: '/', blocks: [] }] }),
    /Pages manager/,
  )
})

test('professional-services structured editor accepts business data without page composition', () => {
  assert.doesNotThrow(() => validateProfessionalServicePayload({
    offerings: [{ id: 'offering-1', name: 'Counsel', slug: 'counsel' }],
    consultation: { mode: 'native_disabled' },
    themeTokens: {},
  }))
})
