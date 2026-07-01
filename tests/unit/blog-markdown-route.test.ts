import test from 'node:test'
import assert from 'node:assert/strict'
import { createRouter } from 'radix3'

test('blog markdown route does not intercept platform blog HTML pages', () => {
  const router = createRouter()
  router.insert('/blog-md/:category/:slug', { name: 'markdown' })
  router.insert('/**', { name: 'renderer' })

  assert.equal(router.lookup('/blog/marketing/debug-slug')?.name, 'renderer')
  assert.equal(router.lookup('/blog-md/marketing/debug-slug.md')?.name, 'markdown')
})
