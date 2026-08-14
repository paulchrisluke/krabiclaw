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

const REQUIRED_QUEUE_CONFIGS = [
  {
    label: 'production',
    prefix: '',
    binding: 'GUEST_DELIVERY_QUEUE',
    queue: 'krabiclaw-guest-delivery',
    deadLetterQueue: 'krabiclaw-guest-delivery-dlq',
  },
  {
    label: 'preview',
    prefix: 'env.preview.',
    binding: 'GUEST_DELIVERY_QUEUE',
    queue: 'krabiclaw-guest-delivery-preview',
    deadLetterQueue: 'krabiclaw-guest-delivery-preview-dlq',
  },
  {
    label: 'staging',
    prefix: 'env.staging.',
    binding: 'GUEST_DELIVERY_QUEUE',
    queue: 'krabiclaw-guest-delivery-staging',
    deadLetterQueue: 'krabiclaw-guest-delivery-staging-dlq',
  },
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

function sectionWith(source, name, text) {
  return sections(source, name).find(section => section.includes(text))
}

async function cloudflare(endpoint, options = {}) {
  const token = process.env.CLOUDFLARE_API_TOKEN
  const accountId = process.env.CF_ACCOUNT_ID
  if (!token || !accountId) {
    throw new Error('CLOUDFLARE_API_TOKEN and CF_ACCOUNT_ID are required')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
    const body = await response.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error(`Cloudflare API returned an invalid response for ${endpoint}`)
    }
    if (!response.ok || body.success === false) {
      throw new Error(body.errors?.[0]?.message || `HTTP ${response.status}`)
    }
    return body
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`Cloudflare API request timed out: ${endpoint}`)
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function listQueues() {
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CF_ACCOUNT_ID) {
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

  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CF_ACCOUNT_ID) {
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
  for (const config of REQUIRED_QUEUE_CONFIGS) {
    const producerSection = sectionWith(wranglerToml, `${config.prefix}queues.producers`, `binding = "${config.binding}"`)
    if (!producerSection) {
      fail(`${config.label} queue producer binding missing`, config.binding)
    }
    else if (producerSection.includes(`queue = "${config.queue}"`)) {
      pass(`${config.label} queue producer: ${config.binding} -> ${config.queue}`)
    }
    else {
      fail(`${config.label} queue producer target mismatch`, `${config.binding} must point to ${config.queue}`)
    }

    const consumerSection = sectionWith(wranglerToml, `${config.prefix}queues.consumers`, `queue = "${config.queue}"`)
    if (!consumerSection) {
      fail(`${config.label} queue consumer missing`, config.queue)
    }
    else if (consumerSection.includes(`dead_letter_queue = "${config.deadLetterQueue}"`)) {
      pass(`${config.label} queue DLQ: ${config.queue} -> ${config.deadLetterQueue}`)
    }
    else {
      fail(`${config.label} queue DLQ target mismatch`, `${config.queue} must use ${config.deadLetterQueue}`)
    }
  }

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
