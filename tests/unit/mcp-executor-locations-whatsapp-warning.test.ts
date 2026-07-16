import test from 'node:test'
import assert from 'node:assert/strict'

import { whatsAppSyncWarning } from '../../server/utils/mcp-executor/locations.ts'

// CodeRabbit follow-up on PR #295: create_location/update_location's MCP
// tool handlers used to discard syncLocationWhatsAppAccess's { ok: false }
// result and report a clean success even when WhatsApp provisioning or
// scope recalculation failed. whatsAppSyncWarning is the extracted, directly
// testable core of turning that result into the `warning` field surfaced on
// the tool's structured response (mirroring the existing hero image/video
// warning convention in the same file).

test('whatsAppSyncWarning: returns undefined when sync succeeded', () => {
  assert.equal(whatsAppSyncWarning({ ok: true }), undefined)
})

test('whatsAppSyncWarning: surfaces the provisioning error when sync failed', () => {
  const warning = whatsAppSyncWarning({ ok: false, provisioningError: 'boom' })
  assert.ok(warning)
  assert.match(warning!, /boom/)
  assert.match(warning!, /location was saved/i)
})

test('whatsAppSyncWarning: surfaces the scope-recalc error when provisioning succeeded but recalculation failed', () => {
  const warning = whatsAppSyncWarning({ ok: false, scopeRecalcError: 'recalc failed' })
  assert.ok(warning)
  assert.match(warning!, /recalc failed/)
})

test('whatsAppSyncWarning: falls back to a generic message when no error detail is present', () => {
  const warning = whatsAppSyncWarning({ ok: false })
  assert.ok(warning)
  assert.match(warning!, /unknown error/)
})
