#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const CONFIGS = [
  { label: 'production', prefix: '' },
  { label: 'preview', prefix: 'env.preview.' },
  { label: 'staging', prefix: 'env.staging.' },
]

let failed = false

function pass(label) {
  console.log(`  ok ${label}`)
}

function fail(label, detail) {
  console.error(`  fail ${label}${detail ? `: ${detail}` : ''}`)
  failed = true
}

function sections(source, name) {
  const pattern = new RegExp(`\\[\\[?${name.replaceAll('.', '\\.')}\\]?\\]`, 'g')
  const ranges = []
  for (const match of source.matchAll(pattern)) {
    const start = match.index ?? 0
    const rest = source.slice(start + 1)
    const next = rest.search(/\n\[+[\w.]+/)
    ranges.push(next === -1 ? source.slice(start) : source.slice(start, start + 1 + next))
  }
  return ranges
}

// A TOML key is only declared if a whole line assigns it. Substring matching
// reads a commented-out or longer key as the real thing.
function declares(source, name, key, value) {
  const literal = value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
  const assignment = new RegExp(String.raw`^[ \t]*${key}[ \t]*=[ \t]*${literal}[ \t]*(?:#.*)?$`, 'm')
  return sections(source, name).some(section => assignment.test(section))
}

const wranglerToml = await readFile(path.resolve(import.meta.dirname, '..', 'wrangler.toml'), 'utf8')

console.log('\nChecking Durable Object config...')
for (const config of CONFIGS) {
  const bindingSection = `${config.prefix}durable_objects.bindings`
  const migrationSection = `${config.prefix}migrations`

  if (declares(wranglerToml, bindingSection, 'class_name', '"GuestInboxHubObject"')) {
    pass(`${config.label} hub binding`)
  }
  else {
    fail(`${config.label} hub binding missing`)
  }

  if (declares(wranglerToml, migrationSection, 'new_sqlite_classes', '["GuestThreadCommandObject", "GuestInboxHubObject"]')) {
    pass(`${config.label} historical migration`)
  }
  else {
    fail(`${config.label} historical migration changed`)
  }

  if (declares(wranglerToml, migrationSection, 'deleted_classes', '["GuestThreadCommandObject"]')) {
    pass(`${config.label} command namespace lifecycle`)
  }
  else {
    fail(`${config.label} command namespace lifecycle`, 'every environment deletes the retired command namespace')
  }
}

if (failed) {
  console.error('\nCloudflare resource check failed.\n')
  process.exit(1)
}

console.log('\nCloudflare resource check passed.\n')
