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
  assert.ok(
    source.indexOf('const unsupported = report.filter') < source.indexOf("if (args.includes('--apply'))"),
    'all unsupported recipients must be rejected before the apply pass starts',
  )
})
