import assert from 'node:assert/strict'
import test from 'node:test'

import {
  parseResourceTeamGeneration,
  RESOURCE_TEAM_GENERATION_CONFIG_KEY,
  serializeResourceTeamGeneration,
  SITE_TRANSFER_POLICY,
} from '../../shared/site-transfer-policy.ts'

test('site transfer policy is disjoint and exhaustive by declared category', () => {
  const tables = Object.values(SITE_TRANSFER_POLICY).flat()
  assert.equal(tables.length, 60)
  assert.equal(new Set(tables).size, tables.length)
})
test('resource team generation has one strict shared JSON contract', () => {
  const raw = serializeResourceTeamGeneration({ transfer_id: 'transfer-1', generation: '7' })
  assert.equal(raw, '{"transfer_id":"transfer-1","generation":"7"}')
  assert.deepEqual(parseResourceTeamGeneration(raw), { transfer_id: 'transfer-1', generation: '7' })
  assert.throws(() => parseResourceTeamGeneration('{"transfer_id":"x","generation":"7","extra":true}'), new RegExp(RESOURCE_TEAM_GENERATION_CONFIG_KEY))
  assert.throws(() => serializeResourceTeamGeneration({ transfer_id: ' ', generation: '7' }), new RegExp(RESOURCE_TEAM_GENERATION_CONFIG_KEY))
  assert.throws(() => serializeResourceTeamGeneration({ transfer_id: 'x', generation: 'a'.repeat(257) }), new RegExp(RESOURCE_TEAM_GENERATION_CONFIG_KEY))
})
