#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const wranglerPath = resolve(root, 'wrangler.toml')
const lanes = JSON.parse(readFileSync(resolve(root, 'config/e2e-lanes.json'), 'utf8'))
const markerStart = '# BEGIN GENERATED E2E LANE ENVIRONMENTS'
const markerEnd = '# END GENERATED E2E LANE ENVIRONMENTS'

function tomlString(value) {
  return JSON.stringify(value)
}

function renderLane(lane) {
  for (const field of ['name', 'hostname', 'databaseName', 'databaseId', 'queueName', 'deadLetterQueueName', 'bucketName', 'kvNamespaceId', 'searchInstanceId']) {
    if (typeof lane[field] !== 'string' || !lane[field]) {
      throw new Error(`E2E lane ${lane.name ?? '<unknown>'} is missing required field ${field}`)
    }
  }
  const env = `env.${tomlString(lane.name)}`
  const vars = {
    CF_SAAS_CNAME_TARGET: 'customers.krabiclaw.com',
    BETTER_AUTH_URL: `https://${lane.hostname}`,
    NUXT_PUBLIC_PLATFORM_DOMAIN: `https://${lane.hostname}`,
    MEDIA_BASE_URL: `https://${lane.hostname}/__media`,
    NUXT_PUBLIC_FREE_SITE_DOMAIN: 'https://krabiclaw.com',
    NUXT_PUBLIC_APP_NAME: `KrabiClaw ${lane.name}`,
    NUXT_PUBLIC_SITE_URL: `https://${lane.hostname}`,
    NUXT_PUBLIC_HELP_URL: `https://${lane.hostname}/help`,
    NUXT_PUBLIC_WHATSAPP_NUMBER: '16197200000',
    AI_SEARCH_NAMESPACE: lane.searchInstanceId,
    AI_SEARCH_INSTANCE_ID: lane.searchInstanceId,
    GA4_MEASUREMENT_ID: '',
    EMAIL_DELIVERY_MODE: 'log_only',
    WHATSAPP_DELIVERY_MODE: 'log_only',
    DISCORD_DELIVERY_MODE: 'log_only',
    E2E_ALLOW_DEV_ROUTES: 'true',
  }

  return [
    `[${env}]`,
    'workers_dev = true',
    `routes = [{ pattern = ${tomlString(`${lane.hostname}/*`)}, zone_name = "krabiclaw.com" }, { pattern = ${tomlString(`*-${lane.name}.krabiclaw.com/*`)}, zone_name = "krabiclaw.com" }]`,
    '',
    `[${env}.triggers]`,
    'crons = []',
    '',
    `[${env}.vars]`,
    ...Object.entries(vars).map(([key, value]) => `${key} = ${tomlString(value)}`),
    '',
    `[[${env}.d1_databases]]`,
    'binding = "DB"',
    `database_name = ${tomlString(lane.databaseName)}`,
    `database_id = ${tomlString(lane.databaseId)}`,
    'migrations_dir = "migrations"',
    'remote = false',
    '',
    `[[${env}.durable_objects.bindings]]`,
    'name = "GUEST_THREAD_COMMANDS"',
    'class_name = "GuestThreadCommandObject"',
    '',
    `[[${env}.durable_objects.bindings]]`,
    'name = "GUEST_INBOX_HUBS"',
    'class_name = "GuestInboxHubObject"',
    '',
    `[[${env}.migrations]]`,
    'tag = "v1_guest_inbox_infra"',
    'new_sqlite_classes = ["GuestThreadCommandObject", "GuestInboxHubObject"]',
    '',
    `[[${env}.queues.producers]]`,
    'binding = "GUEST_DELIVERY_QUEUE"',
    `queue = ${tomlString(lane.queueName)}`,
    '',
    `[[${env}.queues.consumers]]`,
    `queue = ${tomlString(lane.queueName)}`,
    `dead_letter_queue = ${tomlString(lane.deadLetterQueueName)}`,
    'max_retries = 5',
    '',
    `[[${env}.r2_buckets]]`,
    'binding = "MEDIA_BUCKET"',
    `bucket_name = ${tomlString(lane.bucketName)}`,
    'remote = false',
    '',
    `[[${env}.kv_namespaces]]`,
    'binding = "SITE_CACHE"',
    `id = ${tomlString(lane.kvNamespaceId)}`,
    'remote = false',
    '',
    `[${env}.ai]`,
    'binding = "AI"',
    'remote = true',
    '',
    `[[${env}.ai_search_namespaces]]`,
    'binding = "AI_SEARCH"',
    `namespace = ${tomlString(lane.searchInstanceId)}`,
    'remote = true',
    '',
    `[${env}.observability]`,
    'enabled = false',
  ].join('\n')
}

function renderBlock() {
  return [
    markerStart,
    '# Generated from config/e2e-lanes.json; edit the canonical definition instead.',
    ...lanes.map(renderLane),
    markerEnd,
  ].join('\n')
}

const source = readFileSync(wranglerPath, 'utf8')
const start = source.indexOf(markerStart)
const end = source.indexOf(markerEnd)
if ((start === -1) !== (end === -1) || (start !== -1 && end < start)) {
  throw new Error('wrangler.toml has an invalid generated E2E lane marker pair')
}

const block = renderBlock()
const next = start === -1
  ? `${source.trimEnd()}\n\n${block}\n`
  : `${source.slice(0, start)}${block}${source.slice(end + markerEnd.length)}`

if (process.argv.includes('--check')) {
  if (next !== source) {
    console.error('wrangler.toml is out of date; run node scripts/generate-e2e-wrangler-config.mjs --write')
    process.exit(1)
  }
  console.log(`E2E Wrangler configuration is current for ${lanes.length} lanes.`)
} else if (process.argv.includes('--write')) {
  writeFileSync(wranglerPath, next)
  console.log(`Updated wrangler.toml for ${lanes.length} E2E lanes.`)
} else {
  process.stdout.write(block)
}
