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
