import { spawnSync } from 'node:child_process'

const selectedSpecs = (process.env.E2E_SELECTED_SPECS || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean)

for (const spec of selectedSpecs) {
  if (!/^tests\/e2e\/[a-z0-9-]+\.spec\.ts$/.test(spec)) {
    throw new Error(`Refusing invalid selected E2E spec: ${spec}`)
  }
}

const selectionScope = process.env.E2E_SELECTION_SCOPE || 'affected'
if (!['core', 'affected', 'full'].includes(selectionScope)) {
  throw new Error(`Refusing invalid E2E selection scope: ${selectionScope}`)
}
if (selectionScope === 'full' && selectedSpecs.length === 0) {
  throw new Error('Full E2E selection cannot be empty')
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const tenantPublicSpecs = [
  'tests/e2e/tenant-rendering.spec.ts',
  'tests/e2e/tenant-client-navigation.spec.ts'
]
const specs = [...new Set([...tenantPublicSpecs, ...selectedSpecs])]

if (specs.length > 0) {
  run('yarn', [
    'playwright',
    'test',
    ...specs,
    '--project=chromium'
  ])
}
