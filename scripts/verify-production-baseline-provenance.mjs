#!/usr/bin/env node

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const SOURCE_SHA_PATTERN = /^[0-9a-f]{40}$/

function requiredValue(argv, index, option) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`)
  return value
}

function parseArgs(argv) {
  const options = {
    deploymentFile: undefined,
    versionFile: undefined,
    apiUrl: undefined,
    expectedVersionId: undefined,
    workerName: 'krabiclaw',
    output: undefined,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index]
    if (option === '--deployment-file') {
      options.deploymentFile = resolve(requiredValue(argv, index, option)); index += 1
    } else if (option === '--version-file') {
      options.versionFile = resolve(requiredValue(argv, index, option)); index += 1
    } else if (option === '--api-url') {
      options.apiUrl = requiredValue(argv, index, option); index += 1
    } else if (option === '--expected-version-id') {
      options.expectedVersionId = requiredValue(argv, index, option); index += 1
    } else if (option === '--worker-name') {
      options.workerName = requiredValue(argv, index, option); index += 1
    } else if (option === '--output') {
      options.output = resolve(requiredValue(argv, index, option)); index += 1
    } else if (option === '--help' || option === '-h') {
      options.help = true
    } else {
      throw new Error(`Unknown option: ${option}`)
    }
  }
  if (options.help) return options
  for (const [key, value] of [['deploymentFile', options.deploymentFile], ['versionFile', options.versionFile], ['apiUrl', options.apiUrl], ['output', options.output]]) {
    if (!value) throw new Error(`--${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)} is required`)
  }
  if (options.expectedVersionId && !UUID_PATTERN.test(options.expectedVersionId)) throw new Error('--expected-version-id must be a canonical lowercase Worker version UUID')
  return options
}

function idOf(value) {
  return value?.version_id ?? value?.versionId ?? value?.id
}

function trafficOf(value) {
  return Number(value?.percentage ?? value?.traffic ?? NaN)
}

function deploymentRows(root) {
  const deployment = root?.latest_deployment ?? root
  const versions = Array.isArray(deployment?.versions) ? deployment.versions : []
  if (versions.length === 0) throw new Error('Production deployment status did not contain versions')
  const rows = versions.map(version => ({ id: idOf(version), traffic: trafficOf(version) }))
  if (rows.some(row => !UUID_PATTERN.test(String(row.id ?? '')) || !Number.isFinite(row.traffic) || row.traffic < 0 || row.traffic > 100)) {
    throw new Error('Production deployment status contains an unknown version or traffic value')
  }
  const total = rows.reduce((sum, row) => sum + row.traffic, 0)
  if (Math.abs(total - 100) > 0.001) throw new Error('Production deployment traffic does not total 100%')
  const active = rows.filter(row => row.traffic > 0)
  if (active.length !== 1 || active[0].traffic !== 100) throw new Error('Production traffic is split or ambiguous')
  return { rows, active: active[0] }
}

function findVersion(root, expectedId) {
  const queue = [root]
  while (queue.length) {
    const value = queue.shift()
    if (!value || typeof value !== 'object') continue
    if (Array.isArray(value)) {
      queue.push(...value)
      continue
    }
    if (idOf(value) === expectedId) return value
    queue.push(...Object.values(value))
  }
  return null
}

function versionTag(value) {
  return value?.tag
    ?? value?.worker_tag
    ?? value?.version_tag
    ?? value?.metadata?.tag
    ?? value?.annotations?.tag
    ?? value?.annotations?.['workers/tag']
}

export async function fetchApiDeployment(apiUrl) {
  let expectedUrl
  try {
    expectedUrl = new URL(apiUrl)
  } catch {
    throw new Error('/api/deployment URL is invalid')
  }
  if (!['http:', 'https:'].includes(expectedUrl.protocol) || expectedUrl.search || expectedUrl.hash) {
    throw new Error('/api/deployment URL must be an HTTP(S) path without query or fragment')
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(expectedUrl, { redirect: 'manual', signal: controller.signal, headers: { 'cache-control': 'no-cache', pragma: 'no-cache' } })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      throw new Error(`/api/deployment returned an unexpected redirect${location ? ` to ${location}` : ''}`)
    }
    const actualUrl = new URL(response.url)
    if (actualUrl.origin !== expectedUrl.origin || actualUrl.pathname !== expectedUrl.pathname || actualUrl.search !== '' || actualUrl.hash !== '') {
      throw new Error(`/api/deployment resolved to unexpected final URL ${actualUrl.toString()} (expected ${expectedUrl.toString()})`)
    }
    const body = await response.text()
    if (!response.ok) throw new Error(`/api/deployment returned HTTP ${response.status}`)
    try { return JSON.parse(body) } catch { throw new Error('/api/deployment returned malformed JSON') }
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('/api/deployment timed out')
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export async function verifyProductionBaselineProvenance(options) {
  const deployment = JSON.parse(await readFile(options.deploymentFile, 'utf8'))
  const version = JSON.parse(await readFile(options.versionFile, 'utf8'))
  const { rows, active } = deploymentRows(deployment)
  if (options.expectedVersionId && active.id !== options.expectedVersionId) {
    throw new Error(`Expected active production Worker ${options.expectedVersionId}, got ${active.id}`)
  }
  const selected = findVersion(version, active.id)
  if (!selected) throw new Error(`Worker version ${active.id} was not present in versions view output`)
  const tag = versionTag(selected)
  if (typeof tag !== 'string' || !SOURCE_SHA_PATTERN.test(tag)) throw new Error(`Worker version ${active.id} does not have a canonical 40-hex source tag`)

  const api = await fetchApiDeployment(options.apiUrl)
  const apiWorker = api?.worker
  const apiSourceSha = api?.sourceSha
  const apiTag = apiWorker?.tag
  if (!apiWorker || typeof apiWorker.id !== 'string' || !UUID_PATTERN.test(apiWorker.id)) throw new Error('/api/deployment returned a malformed Worker version id')
  if (typeof apiSourceSha !== 'string' || !SOURCE_SHA_PATTERN.test(apiSourceSha)) throw new Error('/api/deployment returned a malformed source SHA')
  if (typeof apiTag !== 'string' || !SOURCE_SHA_PATTERN.test(apiTag)) throw new Error('/api/deployment returned a malformed Worker source tag')
  if (apiWorker.id !== active.id || apiSourceSha !== tag || apiTag !== tag) throw new Error('/api/deployment provenance does not match the active Worker version/tag')

  return {
    schemaVersion: 1,
    status: 'verified',
    workerName: options.workerName,
    versionId: active.id,
    versionTag: tag,
    deployment: { active, versions: rows },
    version: { id: active.id, tag },
    api: { url: options.apiUrl, workerVersionId: apiWorker.id, sourceSha: apiSourceSha, workerVersionTag: apiTag },
  }
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  if (options.help) {
    console.log('Usage: node scripts/verify-production-baseline-provenance.mjs --deployment-file FILE --version-file FILE --api-url URL --output FILE [--expected-version-id UUID] [--worker-name NAME]')
    return
  }
  const evidence = await verifyProductionBaselineProvenance(options)
  await mkdir(dirname(options.output), { recursive: true })
  await writeFile(options.output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
