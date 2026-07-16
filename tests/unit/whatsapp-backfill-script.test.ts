import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('WhatsApp membership backfill is dry-run capable and production guarded', async () => {
  const source = await readFile(new URL('../../scripts/backfill-whatsapp-members.mjs', import.meta.url), 'utf8')
  assert.match(source, /--dry-run/)
  assert.match(source, /--confirm-production/)
  assert.match(source, /site_config/)
  assert.match(source, /business_locations/)
  assert.match(source, /phone-\$\{digits\}@phone\.krabiclaw\.local/)
  assert.match(source, /INSERT OR IGNORE INTO invitation_access_scope/)
  assert.match(source, /INSERT OR IGNORE INTO member_access_scope/)
  const unsupportedIndex = source.indexOf('const unsupported = report.filter')
  const applyIndex = source.indexOf("if (args.includes('--apply'))")
  assert.notEqual(unsupportedIndex, -1, 'unsupported-recipient validation must exist')
  assert.notEqual(applyIndex, -1, 'the apply pass must exist')
  assert.ok(
    unsupportedIndex < applyIndex,
    'all unsupported recipients must be rejected before the apply pass starts',
  )
})
