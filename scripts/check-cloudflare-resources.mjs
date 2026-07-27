#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const REQUIRED_QUEUES = [
  'krabiclaw-guest-delivery',
  'krabiclaw-guest-delivery-dlq',
  'krabiclaw-guest-delivery-preview',
  'krabiclaw-guest-delivery-preview-dlq',
  'krabiclaw-guest-delivery-staging',
  'krabiclaw-guest-delivery-staging-dlq',
]

const REQUIRED_DO_CLASSES = [
  'GuestThreadCommandObject',
  'GuestInboxHubObject',
]

const REQUIRED_CONFIGS = [
  { label: 'production', prefix: '' },
  { label: 'preview', prefix: 'env.preview.' },
  { label: 'staging', prefix: 'env.staging.' },
]

const createMissing = process.argv.includes('--create')
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

async function cloudflare(endpoint, options = {}) {
  const token = process.env.CLOUDFLARE_API_TOKEN
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID
  if (!token || !accountId) {
    throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required')
  }

  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body.success === false) {
    throw new Error(body.errors?.[0]?.message || `HTTP ${response.status}`)
  }
  return body
}

async function listQueues() {
  if (!process.env.CLOUDFLARE_API_TOKEN || !(process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID)) {
    const { stdout } = await execFileAsync('wrangler', ['queues', 'list'])
    return REQUIRED_QUEUES.filter(queueName => stdout.includes(queueName)).map(queueName => ({ queue_name: queueName }))
  }

  const queues = []
  for (let page = 1; ; page += 1) {
    const body = await cloudflare(`/queues?page=${page}`)
    queues.push(...(body.result || []))
    if (!body.result_info?.total_pages || page >= body.result_info.total_pages) break
  }
  return queues
}

async function ensureQueue(queueName, existingNames) {
  if (existingNames.has(queueName)) {
    pass(`Queue exists: ${queueName}`)
    return
  }

  if (!createMissing) {
    fail(`Queue missing: ${queueName}`, 'run yarn cloudflare:resources --create')
    return
  }

  if (!process.env.CLOUDFLARE_API_TOKEN || !(process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID)) {
    await execFileAsync('wrangler', ['queues', 'create', queueName])
  }
  else {
    await cloudflare('/queues', {
      method: 'POST',
      body: JSON.stringify({ queue_name: queueName }),
    })
  }
  existingNames.add(queueName)
  pass(`Queue created: ${queueName}`)
}

async function main() {
  const wranglerToml = await readFile(path.resolve(import.meta.dirname, '..', 'wrangler.toml'), 'utf8')

  console.log('\nChecking Durable Object config...')
  for (const config of REQUIRED_CONFIGS) {
    for (const className of REQUIRED_DO_CLASSES) {
      const bindingSection = `${config.prefix}durable_objects.bindings`
      const migrationSection = `${config.prefix}migrations`
      if (hasInSection(wranglerToml, bindingSection, `class_name = "${className}"`)) {
        pass(`${config.label} DO binding: ${className}`)
      }
      else {
        fail(`${config.label} DO binding missing`, className)
      }

      if (hasInSection(wranglerToml, migrationSection, className)) {
        pass(`${config.label} DO migration: ${className}`)
      }
      else {
        fail(`${config.label} DO migration missing`, className)
      }
    }
  }

  console.log('\nChecking Cloudflare Queues...')
  const queues = await listQueues()
  const existingNames = new Set(queues.map(queue => queue.queue_name || queue.name).filter(Boolean))
  for (const queueName of REQUIRED_QUEUES) await ensureQueue(queueName, existingNames)

  if (failed) {
    console.error('\nCloudflare resource check failed.\n')
    process.exit(1)
  }

  console.log('\nCloudflare resource check passed.\n')
}

await main().catch((error) => {
  console.error(`Cloudflare resource check failed: ${error.message}`)
  process.exit(1)
})
