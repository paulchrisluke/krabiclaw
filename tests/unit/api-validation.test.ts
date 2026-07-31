import assert from 'node:assert/strict'
import test from 'node:test'

import { validateApiArray, validateApiArrayItems, validateApiShape } from '../../utils/api-validation.ts'

test('validateApiShape checks required nested fields and primitive types', () => {
  const validate = validateApiShape({
    balance: 'number',
    profile: {
      name: 'string',
    },
  })

  assert.equal(validate({ balance: 10, profile: { name: 'Ada' } }), true)
  assert.equal(validate({ balance: '10', profile: { name: 'Ada' } }), false)
  assert.equal(validate({ balance: 10, profile: {} }), false)
})

test('validateApiShape supports nullable contract fields', () => {
  const validate = validateApiShape({
    card: 'nullable-object',
    renewal: 'nullable-string',
  })

  assert.equal(validate({ card: null, renewal: null }), true)
  assert.equal(validate({ card: [], renewal: null }), false)
})

test('validateApiShape validates every nested array item', () => {
  const validate = validateApiShape({
    rows: {
      arrayOf: {
        id: 'string',
        label: 'nullable-string',
      },
    },
  })

  assert.equal(validate({ rows: [{ id: 'one', label: null }] }), true)
  assert.equal(validate({ rows: [{ id: 'one', label: 3 }] }), false)
  assert.equal(validate({ rows: [{ label: null }] }), false)
})

test('validateApiArray rejects non-array responses', () => {
  const validate = validateApiArray<unknown>()
  assert.equal(validate([]), true)
  assert.equal(validate({}), false)
})

test('validateApiArrayItems validates every record in the response', () => {
  const validate = validateApiArrayItems({ id: 'string', active: 'boolean' })
  assert.equal(validate([{ id: 'one', active: true }]), true)
  assert.equal(validate([{ id: 'one' }]), false)
})
