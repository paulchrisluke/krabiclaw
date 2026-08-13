#!/usr/bin/env -S node --experimental-strip-types
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { register } from 'node:module'
import { fileURLToPath } from 'node:url'

register('../tests/unit/support/alias-hooks.mjs', import.meta.url)

const root = fileURLToPath(new URL('..', import.meta.url))
const write = process.argv.includes('--write')
const snapshotsDir = path.join(root, 'server/utils/mcp-catalog-snapshots')

const [
  { canonicalCatalogSnapshot, catalogFingerprint },
  { MCP_PUBLIC_TOOLS, MCP_TOOLS },
  { PLATFORM_PUBLIC_MCP_TOOLS, PLATFORM_MCP_TOOLS },
] = await Promise.all([
  import('../server/utils/mcp-catalog.ts'),
  import('../server/utils/mcp-tools/index.ts'),
  import('../server/utils/platform-mcp-tools.ts'),
])

const surfaces = [
  {
    surface: 'tenant',
    publicTools: MCP_PUBLIC_TOOLS,
    dispatchTools: MCP_TOOLS,
    snapshotFile: path.join(snapshotsDir, 'tenant.json'),
  },
  {
    surface: 'platform',
    publicTools: PLATFORM_PUBLIC_MCP_TOOLS,
    dispatchTools: PLATFORM_MCP_TOOLS,
    snapshotFile: path.join(snapshotsDir, 'platform.json'),
  },
]

const failures = []

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function readSnapshot(file) {
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, 'utf8'))
}

for (const config of surfaces) {
  const dispatchNames = new Set(config.dispatchTools.map(tool => tool.name))

  for (const tool of config.publicTools) {
    if (!dispatchNames.has(tool.name)) failures.push(`${config.surface}: public tool ${tool.name} is absent from dispatch`)
  }

  const generated = {
    surface: config.surface,
    fingerprint: catalogFingerprint(config.publicTools),
    tools: canonicalCatalogSnapshot(config.publicTools),
  }

  if (write) {
    mkdirSync(snapshotsDir, { recursive: true })
    writeFileSync(config.snapshotFile, json(generated))
  } else {
    const existing = readSnapshot(config.snapshotFile)
    if (!existing) {
      failures.push(`${config.surface}: missing catalog snapshot ${path.relative(root, config.snapshotFile)} (run yarn mcp:catalog:write)`)
    } else if (json(existing) !== json(generated)) {
      failures.push(`${config.surface}: catalog snapshot drifted (run yarn mcp:catalog:write and review the committed diff)`)
    }
  }

  const reversedFingerprint = catalogFingerprint([...config.publicTools].reverse())
  if (generated.fingerprint !== reversedFingerprint) {
    failures.push(`${config.surface}: catalog fingerprint is not deterministic across tool order`)
  }
}

if (write) {
  console.log(`Wrote MCP catalog snapshots to ${path.relative(root, snapshotsDir)}`)
  if (failures.length) {
    console.error('MCP tool catalog check failed:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }
  process.exit(0)
}

if (failures.length) {
  console.error('MCP tool catalog check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('MCP tool catalog check passed.')
