#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FULL_SOURCE_SHA_PATTERN = /^[0-9a-f]{40}$/i
const UUID_LIKE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BUILD_ID_PATTERN = /buildId\s*[:=]\s*["']([0-9a-f-]{36})["']/i
const BUILD_ID_JSON_PATTERN = /["']buildId["']\s*:\s*["']([0-9a-f-]{36})["']/i
const NUXT_ASSET_PATTERN = /(?:src|href)=["'](\/_nuxt\/[^"'#\s]+)["']/gi
const VERSION_OVERRIDE_HEADER = 'Cloudflare-Workers-Version-Overrides'
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000

function isUuidLike(value) {
  return typeof value === 'string' && UUID_LIKE_PATTERN.test(value)
}

function isVersionTimestamp(value) {
  return typeof value === 'string' && value.trim().length > 0 && Number.isFinite(Date.parse(value))
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

export function createVersionOverrideHeader(workerName, versionId) {
  if (typeof workerName !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(workerName)) {
    throw new CandidateVerificationError("workerName must contain only letters, digits, '.', '_' or '-'", 'INVALID_ARGUMENTS')
  }
  if (!isUuidLike(versionId)) {
    throw new CandidateVerificationError('version override must be a UUID-like Worker version id', 'INVALID_ARGUMENTS')
  }
  return `${workerName}="${versionId}"`
}

export class CandidateVerificationError extends Error {
  code

  constructor(message, code = 'DEPLOYED_CANDIDATE_VERIFICATION_FAILED') {
    super(message)
    this.name = 'CandidateVerificationError'
    this.code = code
  }
}

function requireOptionValue(argv, index, option) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) {
    throw new CandidateVerificationError(`${option} requires a value`, 'INVALID_ARGUMENTS')
  }
  return value
}

function normalizeRoute(route) {
  const value = route.trim()
  if (!value) throw new CandidateVerificationError('Route cannot be empty', 'INVALID_ARGUMENTS')
  if (!value.startsWith('/')) {
    throw new CandidateVerificationError(`Route must be a path beginning with '/': ${value}`, 'INVALID_ARGUMENTS')
  }
  return value
}

function normalizeBaseUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new CandidateVerificationError(`Base URL is not valid: ${value}`, 'INVALID_ARGUMENTS')
  }
  if (!/^https?:$/.test(url.protocol)) {
    throw new CandidateVerificationError(`Base URL must use http or https: ${value}`, 'INVALID_ARGUMENTS')
  }
  url.pathname = url.pathname.replace(/\/+$/, '') || '/'
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}

export function parseVerifierArgs(argv = process.argv.slice(2)) {
  const options = {
    baseUrl: undefined,
    expectedSha: undefined,
    expectedWorkerVersionId: undefined,
    workerName: 'krabiclaw',
    versionOverride: undefined,
    versionOverrideHeader: undefined,
    routes: [],
    buildDir: resolve('.output/public'),
    outputPath: undefined,
    timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index]
    if (option === '--base-url') {
      options.baseUrl = requireOptionValue(argv, index, option)
      index += 1
    } else if (option === '--expected-sha' || option === '--expected-source-sha' || option === '--source-sha') {
      options.expectedSha = requireOptionValue(argv, index, option)
      index += 1
    } else if (option === '--expected-worker-version-id' || option === '--expected-version-id' || option === '--worker-version-id' || option === '--worker-version') {
      options.expectedWorkerVersionId = requireOptionValue(argv, index, option)
      index += 1
    } else if (option === '--worker-name') {
      options.workerName = requireOptionValue(argv, index, option)
      index += 1
    } else if (option === '--version-override') {
      options.versionOverride = requireOptionValue(argv, index, option)
      index += 1
    } else if (option === '--version-override-header') {
      options.versionOverrideHeader = requireOptionValue(argv, index, option)
      index += 1
    } else if (option === '--route') {
      options.routes.push(normalizeRoute(requireOptionValue(argv, index, option)))
      index += 1
    } else if (option === '--routes') {
      const routes = requireOptionValue(argv, index, option)
      options.routes.push(...routes.split(',').map(normalizeRoute))
      index += 1
    } else if (option === '--build-dir' || option === '--local-build-dir') {
      const value = requireOptionValue(argv, index, option)
      options.buildDir = resolve(value)
      index += 1
    } else if (option === '--output' || option === '--output-json') {
      options.outputPath = resolve(requireOptionValue(argv, index, option))
      index += 1
    } else if (option === '--timeout-ms') {
      const value = Number(requireOptionValue(argv, index, option))
      if (!Number.isInteger(value) || value <= 0) {
        throw new CandidateVerificationError('--timeout-ms must be a positive integer', 'INVALID_ARGUMENTS')
      }
      options.timeoutMs = value
      index += 1
    } else if (option === '--help' || option === '-h') {
      options.help = true
    } else {
      throw new CandidateVerificationError(`Unknown option: ${option}`, 'INVALID_ARGUMENTS')
    }
  }

  if (options.help) return options
  if (!options.baseUrl) throw new CandidateVerificationError('--base-url is required', 'INVALID_ARGUMENTS')
  if (!options.expectedSha || !FULL_SOURCE_SHA_PATTERN.test(options.expectedSha)) {
    throw new CandidateVerificationError('--expected-sha must be a full 40-hex source SHA', 'INVALID_ARGUMENTS')
  }

  options.baseUrl = normalizeBaseUrl(options.baseUrl)
  options.expectedSha = options.expectedSha.toLowerCase()
  if (options.expectedWorkerVersionId !== undefined && !isUuidLike(options.expectedWorkerVersionId)) {
    throw new CandidateVerificationError('--expected-worker-version-id must be a UUID-like Worker version id', 'INVALID_ARGUMENTS')
  }
  if (typeof options.workerName !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(options.workerName)) {
    throw new CandidateVerificationError("--worker-name must contain only letters, digits, '.', '_' or '-'", 'INVALID_ARGUMENTS')
  }
  if (options.versionOverride !== undefined && options.versionOverrideHeader !== undefined) {
    throw new CandidateVerificationError('--version-override and --version-override-header are mutually exclusive', 'INVALID_ARGUMENTS')
  }
  if (options.versionOverride !== undefined) {
    options.versionOverrideHeader = createVersionOverrideHeader(options.workerName, options.versionOverride)
    options.versionOverride = undefined
  }
  if (options.versionOverrideHeader !== undefined && !options.versionOverrideHeader.trim()) {
    throw new CandidateVerificationError('--version-override-header cannot be empty', 'INVALID_ARGUMENTS')
  }
  options.routes = [...new Set(options.routes.length > 0 ? options.routes : ['/'])]
  options.buildDir = resolve(options.buildDir)
  return options
}

function requestHeaders(versionOverrideHeader) {
  const headers = {
    'cache-control': 'no-cache',
    pragma: 'no-cache',
  }
  if (versionOverrideHeader) headers[VERSION_OVERRIDE_HEADER] = versionOverrideHeader
  return headers
}

async function fetchWithTimeout(url, { headers, timeoutMs }) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      headers,
      redirect: 'follow',
      signal: controller.signal,
    })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new CandidateVerificationError(`Request timed out: ${url}`, 'REQUEST_TIMEOUT')
    }
    throw new CandidateVerificationError(`Request failed for ${url}: ${error instanceof Error ? error.message : String(error)}`, 'REQUEST_FAILED')
  } finally {
    clearTimeout(timeout)
  }
}

async function readResponseJson(response, url) {
  const body = await response.text()
  try {
    return JSON.parse(body)
  } catch {
    throw new CandidateVerificationError(`${url} returned malformed JSON`, 'MALFORMED_RESPONSE')
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function verifyEndpoint(baseUrl, options) {
  const url = new URL('/api/deployment', baseUrl)
  const response = await fetchWithTimeout(url, {
    headers: requestHeaders(options.versionOverrideHeader),
    timeoutMs: options.timeoutMs,
  })
  if (!response.ok) {
    throw new CandidateVerificationError(`/api/deployment returned HTTP ${response.status}`, 'PROVENANCE_ENDPOINT_FAILED')
  }

  const body = await readResponseJson(response, url)
  const worker = body?.worker
  const sourceSha = body?.sourceSha
  if (!isRecord(worker) || typeof sourceSha !== 'string' || !FULL_SOURCE_SHA_PATTERN.test(sourceSha)) {
    throw new CandidateVerificationError('/api/deployment did not return a valid source SHA and worker metadata', 'MALFORMED_PROVENANCE')
  }
  if (!isUuidLike(worker.id)) {
    throw new CandidateVerificationError('/api/deployment returned a malformed Worker version id', 'MALFORMED_PROVENANCE')
  }
  if (typeof worker.tag !== 'string' || !FULL_SOURCE_SHA_PATTERN.test(worker.tag)) {
    throw new CandidateVerificationError('/api/deployment returned a Worker tag that is not a full source SHA', 'MALFORMED_PROVENANCE')
  }
  if (!isVersionTimestamp(worker.timestamp)) {
    throw new CandidateVerificationError('/api/deployment returned a malformed Worker version timestamp', 'MALFORMED_PROVENANCE')
  }
  if (sourceSha.toLowerCase() !== worker.tag.toLowerCase()) {
    throw new CandidateVerificationError('/api/deployment sourceSha does not match the Worker tag', 'PROVENANCE_MISMATCH')
  }
  if (sourceSha.toLowerCase() !== options.expectedSha) {
    throw new CandidateVerificationError(`Expected source SHA ${options.expectedSha}, got ${sourceSha}`, 'SOURCE_SHA_MISMATCH')
  }
  if (options.expectedWorkerVersionId && worker.id !== options.expectedWorkerVersionId) {
    throw new CandidateVerificationError(`Expected Worker version ${options.expectedWorkerVersionId}, got ${worker.id}`, 'WORKER_VERSION_MISMATCH')
  }

  const canonicalSourceSha = sourceSha.toLowerCase()
  const canonicalWorkerTag = worker.tag.toLowerCase()
  return {
    sourceSha: canonicalSourceSha,
    workerVersionId: worker.id,
    workerVersionTag: canonicalWorkerTag,
    workerVersionTimestamp: worker.timestamp,
  }
}

function extractBuildId(html, route) {
  const match = html.match(BUILD_ID_PATTERN) ?? html.match(BUILD_ID_JSON_PATTERN)
  if (!match) {
    throw new CandidateVerificationError(`${route} did not expose a Nuxt build ID`, 'BUILD_ID_MISSING')
  }
  return match[1]
}

function extractAssetPaths(html) {
  return [...html.matchAll(NUXT_ASSET_PATTERN)].map((match) => match[1])
}

function assertSafeLocalPath(buildDir, assetPath) {
  const pathname = new URL(assetPath, 'https://candidate.invalid').pathname
  const localPath = resolve(buildDir, `.${pathname}`)
  const escaped = relative(buildDir, localPath)
  if (escaped.startsWith('..') || isAbsolute(escaped)) {
    throw new CandidateVerificationError(`Asset path escapes the local build directory: ${assetPath}`, 'LOCAL_ASSET_PATH_INVALID')
  }
  return { pathname, localPath }
}

async function readLocalAsset(buildDir, assetPath) {
  const { pathname, localPath } = assertSafeLocalPath(buildDir, assetPath)
  try {
    const bytes = await readFile(localPath)
    return { pathname, bytes }
  } catch {
    throw new CandidateVerificationError(`Local production build is missing referenced asset ${pathname}`, 'LOCAL_ASSET_MISSING')
  }
}

async function verifyRoute(route, baseUrl, options, buildDir) {
  const url = new URL(route, baseUrl)
  const response = await fetchWithTimeout(url, {
    headers: requestHeaders(options.versionOverrideHeader),
    timeoutMs: options.timeoutMs,
  })
  if (!response.ok) {
    throw new CandidateVerificationError(`${route} returned HTTP ${response.status}`, 'ROUTE_FAILED')
  }
  const html = await response.text()
  const buildId = extractBuildId(html, route)
  const assetPaths = [...new Set(extractAssetPaths(html))]
  if (assetPaths.length === 0) {
    throw new CandidateVerificationError(`${route} did not reference any Nuxt assets`, 'ASSETS_MISSING')
  }

  const metaPath = `/_nuxt/builds/meta/${buildId}.json`
  const metadataUrl = new URL(metaPath, baseUrl)
  const metadataResponse = await fetchWithTimeout(metadataUrl, {
    headers: requestHeaders(options.versionOverrideHeader),
    timeoutMs: options.timeoutMs,
  })
  if (!metadataResponse.ok) {
    throw new CandidateVerificationError(`${route} references missing Nuxt build metadata ${buildId}`, 'BUILD_META_MISSING')
  }
  const remoteMetadataBytes = Buffer.from(await metadataResponse.arrayBuffer())
  let metadata
  try {
    metadata = JSON.parse(remoteMetadataBytes.toString('utf8'))
  } catch {
    throw new CandidateVerificationError(`${metadataUrl} returned malformed JSON`, 'MALFORMED_RESPONSE')
  }
  if (!isRecord(metadata)) {
    throw new CandidateVerificationError(`${route} references malformed Nuxt build metadata ${buildId}`, 'BUILD_META_MALFORMED')
  }

  const localMetadata = await readLocalAsset(buildDir, metaPath)
  const remoteMetadataSha256 = sha256(remoteMetadataBytes)
  const localMetadataSha256 = sha256(localMetadata.bytes)
  if (remoteMetadataSha256 !== localMetadataSha256) {
    throw new CandidateVerificationError(
      `${metaPath} differs between the deployed Worker and local production build`,
      'BUILD_META_MISMATCH',
    )
  }

  const localAssets = []
  for (const assetPath of assetPaths) {
    const assetUrl = new URL(assetPath, baseUrl)
    const assetResponse = await fetchWithTimeout(assetUrl, {
      headers: requestHeaders(options.versionOverrideHeader),
      timeoutMs: options.timeoutMs,
    })
    if (!assetResponse.ok) {
      throw new CandidateVerificationError(`${assetPath} returned HTTP ${assetResponse.status}`, 'ASSET_FAILED')
    }
    const remoteAssetBytes = Buffer.from(await assetResponse.arrayBuffer())
    const localAsset = await readLocalAsset(buildDir, assetPath)
    const remoteAssetSha256 = sha256(remoteAssetBytes)
    const localAssetSha256 = sha256(localAsset.bytes)
    if (remoteAssetSha256 !== localAssetSha256) {
      throw new CandidateVerificationError(
        `${assetPath} differs between the deployed Worker and local production build`,
        'ASSET_MISMATCH',
      )
    }
    localAssets.push({
      path: localAsset.pathname,
      sha256: localAssetSha256,
    })
  }

  return {
    route,
    buildId,
    buildMetaSha256: localMetadataSha256,
    assets: localAssets,
  }
}

export async function verifyDeployedCandidate(input) {
  const options = {
    ...input,
    baseUrl: normalizeBaseUrl(input.baseUrl),
    expectedSha: String(input.expectedSha ?? '').toLowerCase(),
    workerName: input.workerName ?? 'krabiclaw',
    buildDir: resolve(input.buildDir ?? '.output/public'),
    routes: [...new Set((input.routes ?? ['/']).map(normalizeRoute))],
    timeoutMs: input.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
  }
  if (!FULL_SOURCE_SHA_PATTERN.test(options.expectedSha)) {
    throw new CandidateVerificationError('expectedSha must be a full 40-hex source SHA', 'INVALID_ARGUMENTS')
  }
  if (options.expectedWorkerVersionId !== undefined && !isUuidLike(options.expectedWorkerVersionId)) {
    throw new CandidateVerificationError('expectedWorkerVersionId must be a UUID-like Worker version id', 'INVALID_ARGUMENTS')
  }
  if (typeof options.workerName !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(options.workerName)) {
    throw new CandidateVerificationError('workerName must contain only letters, digits, ".", "_" or "-"', 'INVALID_ARGUMENTS')
  }
  if (options.versionOverride !== undefined && options.versionOverrideHeader !== undefined) {
    throw new CandidateVerificationError('versionOverride and versionOverrideHeader are mutually exclusive', 'INVALID_ARGUMENTS')
  }
  if (options.versionOverride !== undefined) {
    options.versionOverrideHeader = createVersionOverrideHeader(options.workerName, options.versionOverride)
    options.versionOverride = undefined
  }
  if (options.versionOverrideHeader !== undefined && !options.versionOverrideHeader.trim()) {
    throw new CandidateVerificationError('versionOverrideHeader cannot be empty', 'INVALID_ARGUMENTS')
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new CandidateVerificationError('timeoutMs must be a positive integer', 'INVALID_ARGUMENTS')
  }

  const endpoint = await verifyEndpoint(options.baseUrl, options)
  const routeResults = []
  for (const route of options.routes) {
    routeResults.push(await verifyRoute(route, options.baseUrl, options, options.buildDir))
  }

  const buildIds = [...new Set(routeResults.map((result) => result.buildId))]
  if (buildIds.length !== 1) {
    throw new CandidateVerificationError(`Routes exposed multiple Nuxt build IDs: ${buildIds.join(', ')}`, 'BUILD_ID_MISMATCH')
  }

  const buildMetaHashes = [...new Set(routeResults.map((result) => result.buildMetaSha256))]
  if (buildMetaHashes.length !== 1) {
    throw new CandidateVerificationError('Routes exposed different Nuxt build metadata bytes', 'BUILD_META_MISMATCH')
  }
  const assetEvidence = [...new Map(
    routeResults
      .flatMap((result) => result.assets)
      .map((asset) => [asset.path, asset]),
  ).values()]
  return {
    ok: true,
    baseUrl: options.baseUrl,
    endpoint: '/api/deployment',
    sourceSha: endpoint.sourceSha,
    workerVersionId: endpoint.workerVersionId,
    workerVersionTag: endpoint.workerVersionTag,
    workerVersionTimestamp: endpoint.workerVersionTimestamp,
    routes: options.routes,
    routeEvidence: routeResults,
    nuxtBuildId: buildIds[0],
    buildMetaPath: `/_nuxt/builds/meta/${buildIds[0]}.json`,
    buildMetaSha256: buildMetaHashes[0],
    referencedAssetCount: assetEvidence.length,
    referencedAssets: assetEvidence.map((asset) => asset.path),
    referencedAssetSha256: assetEvidence,
  }
}

async function writeEvidence(path, evidence) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
}

export async function runVerifierCli(argv = process.argv.slice(2)) {
  const options = parseVerifierArgs(argv)
  if (options.help) {
    console.log('Usage: node scripts/verify-deployed-candidate.mjs --base-url URL --expected-sha SHA [--expected-worker-version-id ID] [--version-override-header VALUE] [--route PATH ...] [--build-dir DIR] [--output FILE]')
    return null
  }

  try {
    const evidence = await verifyDeployedCandidate(options)
    if (options.outputPath) await writeEvidence(options.outputPath, evidence)
    console.log(JSON.stringify(evidence))
    return evidence
  } catch (error) {
    const failure = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      code: error?.code ?? 'DEPLOYED_CANDIDATE_VERIFICATION_FAILED',
    }
    if (options.outputPath) await writeEvidence(options.outputPath, failure)
    throw Object.assign(new CandidateVerificationError(failure.error, failure.code), { evidence: failure })
  }
}

const isMainModule = process.argv[1]
  && fileURLToPath(import.meta.url) === resolve(process.argv[1])

if (isMainModule) {
  runVerifierCli().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      code: error?.code ?? 'DEPLOYED_CANDIDATE_VERIFICATION_FAILED',
    }))
    process.exitCode = 1
  })
}
