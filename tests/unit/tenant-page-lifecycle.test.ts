import test from 'node:test'
import assert from 'node:assert/strict'
import { tenantPageHasPublicationHistory } from '../../server/utils/tenant-pages.ts'

test('tenant page deletion capability detects every publication-history marker', () => {
  assert.equal(tenantPageHasPublicationHistory({ ever_published: false, status: 'draft' }), false)
  assert.equal(tenantPageHasPublicationHistory({ ever_published: 1, status: 'archived' }), true)
  assert.equal(tenantPageHasPublicationHistory({ status: 'published' }), true)
  assert.equal(tenantPageHasPublicationHistory({ published_revision_id: 'revision-1' }), true)
  assert.equal(tenantPageHasPublicationHistory({ document_published_revision_id: 'revision-1' }), true)
})
