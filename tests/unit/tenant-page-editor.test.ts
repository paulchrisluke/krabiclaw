import assert from 'node:assert/strict'
import test from 'node:test'
import { TENANT_PAGE_BLOCK_REGISTRY, createTenantPageBlock, type TenantPageBlock } from '../../utils/tenant-page-blocks.ts'
import { createTenantPageEditorData, tenantPageBlockSummary, validateTenantPageBlock } from '../../utils/tenant-page-editor.ts'

function block(type: TenantPageBlock['type'], data: Record<string, unknown>): TenantPageBlock {
  return createTenantPageBlock(type, data)
}

test('every registered tenant block has typed editor metadata and usable defaults', () => {
  for (const definition of Object.values(TENANT_PAGE_BLOCK_REGISTRY)) {
    assert.equal(definition.editor, 'typed-fields')
    const created = block(definition.type, createTenantPageEditorData(definition.type))
    assert.equal(created.type, definition.type)
    assert.equal(typeof created.data, 'object')
  }
})

test('typed editor validation reports incomplete fields before save', () => {
  const errors = validateTenantPageBlock(block('hero', { cta_label: 'Contact us' }))
  assert.ok(errors.includes('Hero CTA label and URL must be provided together.'))

  const complete = block('hero', { title: 'Welcome', cta_label: 'Contact us', cta_url: '/contact' })
  assert.deepEqual(validateTenantPageBlock(complete), [])
})

test('typed editor validation handles repeatable fields without JSON parsing', () => {
  const errors = validateTenantPageBlock(block('faq', { items: [{ title: '', description: '' }] }))
  assert.ok(errors.includes('FAQ item 1 needs a question.'))
  assert.ok(errors.includes('FAQ item 1 needs an answer.'))

  const complete = block('faq', { items: [{ title: 'Where?', description: 'Here.' }] })
  assert.deepEqual(validateTenantPageBlock(complete), [])
})

test('published page Q&A skips manual FAQ item validation', () => {
  const blockWithConfiguredSource = block('faq', { source: 'page_qa', items: [{ title: '', description: '' }] })
  assert.deepEqual(validateTenantPageBlock(blockWithConfiguredSource), [])
})

test('block summaries give collapsed cards useful context', () => {
  assert.equal(tenantPageBlockSummary(block('heading', { text: 'About our studio' })), 'About our studio')
  assert.equal(tenantPageBlockSummary(block('divider', {})), 'Divider')
})
