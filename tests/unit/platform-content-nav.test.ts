import test from 'node:test'
import assert from 'node:assert/strict'

import {
  docNavSectionFor,
  navSectionOrderFor,
  navTitleFor,
  PLATFORM_DOC_NAV_SECTION_LABELS,
} from '../../utils/platform-content-nav.ts'

test('docNavSectionFor keeps category fallback separate from URL taxonomy', () => {
  assert.equal(docNavSectionFor('Menu Management', null), 'Editing Your Site')
  assert.equal(docNavSectionFor('Theme Customization', ''), 'Editing Your Site')
  assert.equal(docNavSectionFor('SEO & Marketing', null), 'Business Operations')
  assert.equal(docNavSectionFor('Integrations', 'Partner Setup'), 'Partner Setup')
  assert.equal(docNavSectionFor(null, null), 'More')
})

test('nav helpers prefer explicit editorial metadata', () => {
  assert.deepEqual(PLATFORM_DOC_NAV_SECTION_LABELS, [
    'Getting Started',
    'Editing Your Site',
    'Business Operations',
    'Integrations',
    'Advanced',
  ])
  assert.equal(navSectionOrderFor('Integrations'), 40)
  assert.equal(navSectionOrderFor('Whatever', 15), 15)
  assert.equal(navSectionOrderFor('Whatever'), 9000)
  assert.equal(navTitleFor('Long Formal Title', 'Short Title'), 'Short Title')
  assert.equal(navTitleFor('Long Formal Title', '   '), 'Long Formal Title')
})
