import assert from 'node:assert/strict'
import test from 'node:test'
import { serializeJsonLd } from '../../utils/json-ld.ts'

test('serializeJsonLd preserves JSON while escaping script-breaking characters', () => {
  const serialized = serializeJsonLd({
    title: '</script><script>alert("x")</script>',
    detail: 'A & B > C\u2028next\u2029line',
  })

  assert.equal(serialized.includes('</script>'), false)
  assert.equal(serialized.includes('&'), false)
  assert.equal(serialized.includes('>'), false)
  assert.equal(serialized.includes('\u2028'), false)
  assert.equal(serialized.includes('\u2029'), false)
  assert.deepEqual(JSON.parse(serialized), {
    title: '</script><script>alert("x")</script>',
    detail: 'A & B > C\u2028next\u2029line',
  })
})
