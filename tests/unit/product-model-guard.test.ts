import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import {
  collectProductModelViolations,
  findProductModelViolations,
} from '../../scripts/check-product-model-guard.mjs'

test('product-model guard rejects misleading signup-wallet copy only in active roots', () => {
  const root = mkdtempSync(join(tmpdir(), 'krabiclaw-product-model-'))
  try {
    mkdirSync(join(root, 'server', 'utils'), { recursive: true })
    mkdirSync(join(root, 'docs', 'adr'), { recursive: true })
    mkdirSync(join(root, 'tests', 'unit'), { recursive: true })
    writeFileSync(join(root, 'server', 'utils', 'active.ts'), 'const copy = "500 AI credits to start"\n')
    writeFileSync(join(root, 'docs', 'adr', 'historical.md'), '500 AI credits to start\n')
    writeFileSync(join(root, 'tests', 'unit', 'fixture.ts'), 'Starter AI credits on signup\n')

    const violations = collectProductModelViolations(root)
    assert.equal(violations.length, 1)
    assert.match(violations[0] ?? '', /server\/utils\/active\.ts/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('product-model guard accepts explicit shared UTC-week organization copy', () => {
  assert.deepEqual(
    findProductModelViolations(
      'server/utils/billing-plans.ts',
      '500 shared organization AI credits per UTC week',
    ),
    [],
  )
  assert.deepEqual(
    findProductModelViolations(
      'utils/template-registry.ts',
      '500 shared organization AI credits per UTC week on Starter',
    ),
    [],
  )
})

test('product-model guard scans locale copy and keeps retired upsell files deleted', () => {
  const root = mkdtempSync(join(tmpdir(), 'krabiclaw-product-copy-'))
  try {
    mkdirSync(join(root, 'i18n', 'locales'), { recursive: true })
    mkdirSync(join(root, 'utils'), { recursive: true })
    mkdirSync(join(root, 'composables'), { recursive: true })
    writeFileSync(join(root, 'i18n', 'locales', 'en.json'), '{"description":"Included in Managed"}\n')
    writeFileSync(join(root, 'utils', 'template-registry.ts'), 'const locations = "1 free / unlimited Growth"\n')
    writeFileSync(join(root, 'composables', 'useUpgradeModal.ts'), 'export const enabled = false\n')

    const violations = collectProductModelViolations(root)
    assert.equal(violations.some(violation => violation.includes('i18n/locales/en.json')), true)
    assert.equal(violations.some(violation => violation.includes('utils/template-registry.ts')), true)
    assert.equal(violations.some(violation => violation.includes('composables/useUpgradeModal.ts')), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
