#!/usr/bin/env -S node --experimental-strip-types
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { register } from 'node:module'

register('../tests/unit/support/alias-hooks.mjs', import.meta.url)

const root = path.resolve(new URL('..', import.meta.url).pathname)
const write = process.argv.includes('--write')
const snapshotsDir = path.join(root, 'server/utils/mcp-catalog-snapshots')

const [
  { canonicalCatalogSnapshot, catalogFingerprint },
  { MCP_PUBLIC_TOOLS, MCP_TOOLS },
  { PLATFORM_PUBLIC_MCP_TOOLS, PLATFORM_MCP_TOOLS },
  { MCP_RELEASED_TOOLS },
] = await Promise.all([
  import('../server/utils/mcp-catalog.ts'),
  import('../server/utils/mcp-tools/index.ts'),
  import('../server/utils/platform-mcp-tools.ts'),
  import('../server/utils/mcp-released-tools.ts'),
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
  const publicNames = new Set(config.publicTools.map(tool => tool.name))
  const dispatchNames = new Set(config.dispatchTools.map(tool => tool.name))
  const manifest = MCP_RELEASED_TOOLS.filter(entry => entry.surface === config.surface)
  const manifestByName = new Map(manifest.map(entry => [entry.name, entry]))

  for (const tool of config.publicTools) {
    const entry = manifestByName.get(tool.name)
    if (!entry) failures.push(`${config.surface}: public tool ${tool.name} has no released-tool manifest entry`)
    else if (entry.status !== 'current') failures.push(`${config.surface}: public tool ${tool.name} is manifest status ${entry.status}, expected current`)
  }

  for (const entry of manifest) {
    if (entry.status === 'current' && !publicNames.has(entry.name)) {
      failures.push(`${config.surface}: current released tool ${entry.name} is absent from public discovery`)
    }
    if (entry.status === 'current' && !dispatchNames.has(entry.name)) {
      failures.push(`${config.surface}: current released tool ${entry.name} is absent from internal dispatch`)
    }
    if (entry.status === 'deprecated') {
      if (!dispatchNames.has(entry.name)) failures.push(`${config.surface}: deprecated released tool ${entry.name} is absent from internal dispatch`)
      if (publicNames.has(entry.name)) failures.push(`${config.surface}: deprecated released tool ${entry.name} must stay hidden from tools/list`)
      if (!entry.replacementTools.length) failures.push(`${config.surface}: deprecated tool ${entry.name} must declare replacementTools`)
      if (!entry.compatibilityHandler) failures.push(`${config.surface}: deprecated tool ${entry.name} must declare compatibilityHandler`)
    }
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
      failures.push(`${config.surface}: missing catalog snapshot ${path.relative(root, config.snapshotFile)} (run yarn mcp:compat --write)`)
    } else if (json(existing) !== json(generated)) {
      failures.push(`${config.surface}: catalog snapshot drifted (run yarn mcp:compat --write and review the committed diff)`)
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
    console.error('MCP tool compatibility check failed:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }
  process.exit(0)
}

if (failures.length) {
  console.error('MCP tool compatibility check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('MCP tool compatibility check passed.')
