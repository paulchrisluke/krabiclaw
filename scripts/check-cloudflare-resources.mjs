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

function hasInSection(source, name, text) {
  return sections(source, name).some(section => section.includes(text))
}

const wranglerToml = await readFile(path.resolve(import.meta.dirname, '..', 'wrangler.toml'), 'utf8')

console.log('\nChecking Durable Object config...')
for (const config of CONFIGS) {
  const bindingSection = `${config.prefix}durable_objects.bindings`
  const migrationSection = `${config.prefix}migrations`

  if (hasInSection(wranglerToml, bindingSection, 'class_name = "GuestInboxHubObject"')) {
    pass(`${config.label} hub binding`)
  }
  else {
    fail(`${config.label} hub binding missing`)
  }

  if (hasInSection(wranglerToml, migrationSection, 'new_sqlite_classes = ["GuestThreadCommandObject", "GuestInboxHubObject"]')) {
    pass(`${config.label} historical migration`)
  }
  else {
    fail(`${config.label} historical migration changed`)
  }

  const deletesCommand = hasInSection(wranglerToml, migrationSection, 'deleted_classes = ["GuestThreadCommandObject"]')
  if (deletesCommand === (config.label !== 'production')) {
    pass(`${config.label} command namespace lifecycle`)
  }
  else {
    fail(`${config.label} command namespace lifecycle`, 'retain production for rollback; preserve preview/staging deletion history')
  }
}

if (wranglerToml.includes('name = "GUEST_THREAD_COMMANDS"')) fail('obsolete command binding remains')
if (wranglerToml.includes('GUEST_DELIVERY_QUEUE') || wranglerToml.includes('[[queues.')) fail('obsolete guest delivery Queue config remains')

if (failed) {
  console.error('\nCloudflare resource check failed.\n')
  process.exit(1)
}

console.log('\nCloudflare resource check passed.\n')
