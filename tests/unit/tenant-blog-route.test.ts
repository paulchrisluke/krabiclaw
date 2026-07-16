import assert from 'node:assert/strict'
import test from 'node:test'

import { isBlawbyBlogTemplate, tenantBlogPostPath } from '../../utils/tenant-blog-route.ts'

test('tenant blog paths follow the site template contract', () => {
  assert.equal(isBlawbyBlogTemplate({ theme: 'blawby', theme_id: 'blawby-theme-v1' }), true)
  assert.equal(tenantBlogPostPath({ theme: 'blawby' }, 'legal update'), '/article/legal%20update')
  assert.equal(tenantBlogPostPath({ theme_id: 'blawby-theme-v1' }, 'legal-update'), '/article/legal-update')
  assert.equal(tenantBlogPostPath({ theme: 'saya' }, 'new-menu'), '/blog/new-menu')
  assert.equal(tenantBlogPostPath(null, 'new-menu'), '/blog/new-menu')
})
