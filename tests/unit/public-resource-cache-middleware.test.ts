import assert from 'node:assert/strict'
import test from 'node:test'
import { H3 } from 'nitro/h3'

import invalidatePublicResources from '../../server/middleware/zz-public-resource-cache-invalidate.ts'

test('dashboard mutation reports cache invalidation failure through HTTP', async () => {
  const app = new H3()
  app.use(invalidatePublicResources)
  app.patch('/api/editor/organizations/:organizationId/settings', () => ({ saved: true }))

  const response = await app.request('/api/editor/organizations/org/settings', { method: 'PATCH' })
  assert.equal(response.status, 500)
  assert.notDeepEqual(await response.json(), { saved: true })
})

test('dashboard mutation with no resolved organization cannot report success', async () => {
  const app = new H3()
  app.use(invalidatePublicResources)
  app.patch('/api/editor/organizations/settings', () => ({ saved: true }))

  const response = await app.request('/api/editor/organizations/settings', { method: 'PATCH' })
  assert.equal(response.status, 500)
})
