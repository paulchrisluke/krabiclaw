#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildReleaseRouteInventory,
  REQUIRED_RELEASE_SURFACES,
} from './release-route-inventory.mjs'
import {
  buildLegacyRollbackRouteInventory,
  LEGACY_ROLLBACK_TARGET_SHA,
} from './legacy-rollback-route-inventory-4e49e5a37e4a0578bd1b306c4e0822c4fa8bc5c9.mjs'

const FULL_SOURCE_SHA_PATTERN = /^[0-9a-f]{40}$/i
const UUID_LIKE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BUILD_ID_PATTERN = /buildId\s*[:=]\s*["']([0-9a-f-]{36})["']/i
const BUILD_ID_JSON_PATTERN = /["']buildId["']\s*:\s*["']([0-9a-f-]{36})["']/i
const NUXT_ASSET_PATTERN = /(?:src|href)=["'](\/_nuxt\/[^"'#\s]+)["']/gi
const VERSION_OVERRIDE_HEADER = 'Cloudflare-Workers-Version-Overrides'
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000
const PROVENANCE_MAX_ATTEMPTS = 5
const PROVENANCE_RETRY_DELAY_MS = 1_000

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
  const value = String(route).trim()
  if (!value) throw new CandidateVerificationError('Route cannot be empty', 'INVALID_ARGUMENTS')
  if (!value.startsWith('/')) {
    throw new CandidateVerificationError(`Route must be a path beginning with '/': ${value}`, 'INVALID_ARGUMENTS')
  }
  if (value.includes('?') || value.includes('#')) {
    throw new CandidateVerificationError(`Route may not contain a query or hash: ${value}`, 'INVALID_ARGUMENTS')
  }
  return value
}

function normalizeRouteContract(route, baseUrl) {
  if (typeof route === 'string') {
    const path = normalizeRoute(route)
    return {
      path,
      expectedOrigin: new URL(baseUrl).origin,
      expectedPath: path,
      identity: 'body',
      content: null,
      allowRedirects: [],
    }
  }
  if (!route || typeof route !== 'object' || Array.isArray(route)) {
    throw new CandidateVerificationError('Release route must be a path or contract object', 'INVALID_ROUTE_INVENTORY')
  }
  const path = normalizeRoute(route.path)
  const expectedPath = normalizeRoute(route.expectedPath ?? path)
  let expectedOrigin
  try {
    expectedOrigin = new URL(String(route.expectedOrigin ?? new URL(baseUrl).origin)).origin
  } catch {
    throw new CandidateVerificationError(`Release route ${path} has an invalid expected origin`, 'INVALID_ROUTE_INVENTORY')
  }
  if (expectedOrigin !== new URL(baseUrl).origin) {
    throw new CandidateVerificationError(`Release route ${path} expected origin must match its surface base URL`, 'INVALID_ROUTE_INVENTORY')
  }
  const redirects = Array.isArray(route.allowRedirects) ? route.allowRedirects.map((redirect) => {
    if (!redirect || typeof redirect !== 'object') throw new CandidateVerificationError(`Release route ${path} has an invalid redirect contract`, 'INVALID_ROUTE_INVENTORY')
    const status = Number(redirect.status)
    if (![301, 302, 303, 307, 308].includes(status)) throw new CandidateVerificationError(`Release route ${path} has an unsupported redirect status`, 'INVALID_ROUTE_INVENTORY')
    const redirectOrigin = new URL(String(redirect.origin ?? expectedOrigin)).origin
    const redirectPath = normalizeRoute(redirect.path)
    if (redirectOrigin !== expectedOrigin) throw new CandidateVerificationError(`Release route ${path} allows a cross-origin redirect`, 'INVALID_ROUTE_INVENTORY')
    return { status, origin: redirectOrigin, path: redirectPath }
  }) : []
  return {
    path,
    expectedOrigin,
    expectedPath,
    identity: typeof route.identity === 'string' ? route.identity : 'body',
    content: typeof route.content === 'string' ? route.content : null,
    allowRedirects: redirects,
  }
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
    routeInventoryPath: undefined,
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
    } else if (option === '--route-inventory' || option === '--route-inventory-file') {
      options.routeInventoryPath = requireOptionValue(argv, index, option)
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

function requestHeaders(versionOverrideHeader, extraHeaders = {}) {
  const headers = {
    ...extraHeaders,
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
      // Redirects are part of the immutable route contract.  Follow them only
      // after the caller has checked the declared status, origin, and path.
      redirect: 'manual',
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

function assertResponseUrl(response, expectedUrl, label) {
  const actual = new URL(response.url)
  const expected = new URL(expectedUrl)
  if (actual.origin !== expected.origin || actual.pathname !== expected.pathname || actual.search !== expected.search || actual.hash !== expected.hash) {
    throw new CandidateVerificationError(
      `${label} resolved to unexpected final URL ${actual.toString()} (expected ${expected.toString()})`,
      'UNEXPECTED_FINAL_URL',
    )
  }
}

function redirectLocation(response, requestedUrl, label) {
  const location = response.headers.get('location')
  if (!location) throw new CandidateVerificationError(`${label} returned HTTP ${response.status} without a Location header`, 'UNEXPECTED_REDIRECT')
  try {
    return new URL(location, requestedUrl)
  } catch {
    throw new CandidateVerificationError(`${label} returned an invalid redirect Location`, 'UNEXPECTED_REDIRECT')
  }
}

function isRedirectStatus(status) {
  return [301, 302, 303, 307, 308].includes(status)
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function verifyEndpoint(baseUrl, options, extraHeaders = {}) {
  const url = new URL('/api/deployment', baseUrl)
  url.searchParams.set(
    'deployment-verification',
    `${options.expectedSha}-${options.expectedWorkerVersionId ?? 'source-only'}`,
  )
  let response
  let attempt = 0
  while (attempt < PROVENANCE_MAX_ATTEMPTS) {
    attempt += 1
    response = await fetchWithTimeout(url, {
      headers: requestHeaders(options.versionOverrideHeader, extraHeaders),
      timeoutMs: options.timeoutMs,
    })
    if (response.status !== 404 || attempt === PROVENANCE_MAX_ATTEMPTS) break
    await response.arrayBuffer()
    await sleep(PROVENANCE_RETRY_DELAY_MS)
  }
  if (isRedirectStatus(response.status)) {
    throw new CandidateVerificationError(`/api/deployment returned an unexpected redirect to ${redirectLocation(response, url, '/api/deployment').toString()}`, 'UNEXPECTED_REDIRECT')
  }
  assertResponseUrl(response, url, '/api/deployment')
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

async function verifyRoute(route, baseUrl, options, buildDir, extraHeaders = {}, surface = null) {
  const contract = normalizeRouteContract(route, baseUrl)
  const url = new URL(contract.path, baseUrl)
  let response = await fetchWithTimeout(url, {
    headers: requestHeaders(options.versionOverrideHeader, extraHeaders),
    timeoutMs: options.timeoutMs,
  })
  const redirects = []
  if (isRedirectStatus(response.status)) {
    const location = redirectLocation(response, url, contract.path)
    const allowed = contract.allowRedirects.find(redirect => redirect.status === response.status
      && redirect.origin === location.origin
      && redirect.path === location.pathname
      && location.search === ''
      && location.hash === '')
    if (!allowed) {
      throw new CandidateVerificationError(`${contract.path} returned an unexpected redirect to ${location.toString()}`, 'UNEXPECTED_REDIRECT')
    }
    redirects.push({ status: response.status, origin: location.origin, path: location.pathname })
    response = await fetchWithTimeout(location, {
      headers: requestHeaders(options.versionOverrideHeader, extraHeaders),
      timeoutMs: options.timeoutMs,
    })
  }
  const expectedFinalUrl = new URL(contract.expectedPath, contract.expectedOrigin)
  assertResponseUrl(response, expectedFinalUrl, contract.path)
  if (!response.ok) {
    throw new CandidateVerificationError(`${contract.path} returned HTTP ${response.status}`, 'ROUTE_FAILED')
  }
  const html = await response.text()
  const buildId = extractBuildId(html, contract.path)
  const assetPaths = [...new Set(extractAssetPaths(html))]
  if (assetPaths.length === 0) {
    throw new CandidateVerificationError(`${contract.path} did not reference any Nuxt assets`, 'ASSETS_MISSING')
  }

  const metaPath = `/_nuxt/builds/meta/${buildId}.json`
  const metadataUrl = new URL(metaPath, baseUrl)
  const metadataResponse = await fetchWithTimeout(metadataUrl, {
    headers: requestHeaders(options.versionOverrideHeader, extraHeaders),
    timeoutMs: options.timeoutMs,
  })
  if (isRedirectStatus(metadataResponse.status)) {
    throw new CandidateVerificationError(`${metaPath} returned an unexpected redirect to ${redirectLocation(metadataResponse, metadataUrl, metaPath).toString()}`, 'UNEXPECTED_REDIRECT')
  }
  assertResponseUrl(metadataResponse, metadataUrl, metaPath)
  if (!metadataResponse.ok) {
    throw new CandidateVerificationError(`${contract.path} references missing Nuxt build metadata ${buildId}`, 'BUILD_META_MISSING')
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
    if (assetUrl.origin !== new URL(baseUrl).origin) {
      throw new CandidateVerificationError(`${contract.path} references a cross-origin Nuxt asset ${assetPath}`, 'ASSET_ORIGIN_MISMATCH')
    }
    const assetResponse = await fetchWithTimeout(assetUrl, {
      headers: requestHeaders(options.versionOverrideHeader, extraHeaders),
      timeoutMs: options.timeoutMs,
    })
    if (isRedirectStatus(assetResponse.status)) {
      throw new CandidateVerificationError(`${assetPath} returned an unexpected redirect to ${redirectLocation(assetResponse, assetUrl, assetPath).toString()}`, 'UNEXPECTED_REDIRECT')
    }
    assertResponseUrl(assetResponse, assetUrl, assetPath)
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
    surface,
    baseUrl,
    route: contract.path,
    requestedPath: contract.path,
    expectedOrigin: contract.expectedOrigin,
    expectedPath: contract.expectedPath,
    redirects,
    buildId,
    buildMetaSha256: localMetadataSha256,
    assets: localAssets,
  }
}

function normalizeRouteInventory(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.surfaces)) {
    throw new CandidateVerificationError('route inventory must contain a surfaces array', 'INVALID_ROUTE_INVENTORY')
  }
  const normalizeHeaders = (surfaceName, headers) => {
    const rawHeaders = headers ?? {}
    if (typeof rawHeaders !== 'object' || Array.isArray(rawHeaders)) {
      throw new CandidateVerificationError(`route inventory surface ${surfaceName} headers must be an object`, 'INVALID_ROUTE_INVENTORY')
    }
    return Object.fromEntries(Object.entries(rawHeaders).map(([key, headerValue]) => {
      if (!key || typeof headerValue !== 'string' || !headerValue.trim()) {
        throw new CandidateVerificationError(`route inventory surface ${surfaceName} has an invalid header`, 'INVALID_ROUTE_INVENTORY')
      }
      if (key.toLowerCase() === VERSION_OVERRIDE_HEADER.toLowerCase()) {
        throw new CandidateVerificationError('route inventory may not provide the Worker version override header', 'INVALID_ROUTE_INVENTORY')
      }
      return [key, headerValue]
    }))
  }
  const normalizeTarget = (target, label) => {
    if (!target || typeof target !== 'object') {
      throw new CandidateVerificationError(`route inventory target ${label} must be an object`, 'INVALID_ROUTE_INVENTORY')
    }
    const name = typeof target.name === 'string' ? target.name.trim() : ''
    if (!name) throw new CandidateVerificationError(`route inventory target ${label} name is required`, 'INVALID_ROUTE_INVENTORY')
    let baseUrl
    try {
      baseUrl = normalizeBaseUrl(target.baseUrl)
    } catch {
      throw new CandidateVerificationError(`route inventory target ${label} has an invalid base URL`, 'INVALID_ROUTE_INVENTORY')
    }
    if (!Array.isArray(target.routes) || target.routes.length === 0) {
      throw new CandidateVerificationError(`route inventory target ${label} must list at least one route`, 'INVALID_ROUTE_INVENTORY')
    }
    return {
      name,
      baseUrl,
      headers: normalizeHeaders(label, target.headers),
      routes: target.routes.map(route => normalizeRouteContract(route, baseUrl)),
    }
  }
  const surfaces = value.surfaces.map((surface) => {
    if (!surface || typeof surface !== 'object') {
      throw new CandidateVerificationError('route inventory surface must be an object', 'INVALID_ROUTE_INVENTORY')
    }
    const name = typeof surface.name === 'string' ? surface.name.trim() : ''
    if (!name) throw new CandidateVerificationError('route inventory surface name is required', 'INVALID_ROUTE_INVENTORY')
    let baseUrl
    try {
      baseUrl = normalizeBaseUrl(surface.baseUrl)
    } catch {
      throw new CandidateVerificationError(`route inventory surface ${name} has an invalid base URL`, 'INVALID_ROUTE_INVENTORY')
    }
    if (!Array.isArray(surface.routes) || surface.routes.length === 0) {
      throw new CandidateVerificationError(`route inventory surface ${name} must list at least one route`, 'INVALID_ROUTE_INVENTORY')
    }
    return {
      name,
      baseUrl,
      headers: normalizeHeaders(name, surface.headers),
      routes: surface.routes.map(route => normalizeRouteContract(route, baseUrl)),
      ...(surface.variants !== undefined
        ? (() => {
            if (!Array.isArray(surface.variants) || surface.variants.length === 0) {
              throw new CandidateVerificationError(`route inventory surface ${name} variants must be a non-empty array when provided`, 'INVALID_ROUTE_INVENTORY')
            }
            const variants = surface.variants.map((variant) => normalizeTarget(
              variant,
              `${name}/${variant?.name ?? 'unnamed'}`,
            ))
            const variantNames = new Set(variants.map(variant => variant.name))
            if (variantNames.size !== variants.length) {
              throw new CandidateVerificationError(`route inventory surface ${name} has duplicate variant names`, 'INVALID_ROUTE_INVENTORY')
            }
            return { variants }
          })()
        : {}),
    }
  })
  const names = new Set(surfaces.map(surface => surface.name))
  for (const requiredSurface of REQUIRED_RELEASE_SURFACES) {
    if (!names.has(requiredSurface)) {
      throw new CandidateVerificationError(`route inventory is missing required ${requiredSurface} surface`, 'INVALID_ROUTE_INVENTORY')
    }
  }
  if (names.size !== surfaces.length || names.size !== new Set(REQUIRED_RELEASE_SURFACES).size) {
    throw new CandidateVerificationError('route inventory must contain exactly one platform, saya, and blawby surface', 'INVALID_ROUTE_INVENTORY')
  }
  const normalized = {
    schemaVersion: value.schemaVersion,
    rootBaseUrl: typeof value.rootBaseUrl === 'string' ? normalizeBaseUrl(value.rootBaseUrl) : null,
    requiredSurfaces: [...REQUIRED_RELEASE_SURFACES],
    surfaces,
  }
  if (typeof value.inventoryKind === 'string') normalized.inventoryKind = value.inventoryKind
  if (typeof value.targetSourceSha === 'string') normalized.targetSourceSha = value.targetSourceSha.toLowerCase()
  return normalized
}

export async function verifyDeployedCandidate(input) {
  const options = {
    ...input,
    baseUrl: normalizeBaseUrl(input.baseUrl),
    expectedSha: String(input.expectedSha ?? '').toLowerCase(),
    workerName: input.workerName ?? 'krabiclaw',
    buildDir: resolve(input.buildDir ?? '.output/public'),
    routes: [...new Set((input.routes ?? ['/']).map(normalizeRoute))],
    routeInventory: input.routeInventory ? normalizeRouteInventory(input.routeInventory) : null,
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
  if (options.routeInventory) {
    const expectedInventory = normalizeRouteInventory(
      options.expectedSha === LEGACY_ROLLBACK_TARGET_SHA
      && options.routeInventory.targetSourceSha === LEGACY_ROLLBACK_TARGET_SHA
        ? buildLegacyRollbackRouteInventory(options.baseUrl)
        : buildReleaseRouteInventory(options.baseUrl),
    )
    if (JSON.stringify(options.routeInventory) !== JSON.stringify(expectedInventory)) {
      throw new CandidateVerificationError(
        `route inventory does not match the exact release route and origin contract for ${options.baseUrl}`,
        'INVALID_ROUTE_INVENTORY',
      )
    }
  }

  const routeTargets = options.routeInventory
    ? options.routeInventory.surfaces.flatMap(surface => [
      { name: surface.name, baseUrl: surface.baseUrl, headers: surface.headers, routes: surface.routes },
      ...(surface.variants ?? []).map(variant => ({
        name: `${surface.name}/${variant.name}`,
        baseUrl: variant.baseUrl,
        headers: variant.headers,
        routes: variant.routes,
      })),
    ].flatMap(target => target.routes.map(route => ({
      surface: target.name,
      baseUrl: target.baseUrl,
      headers: target.headers,
      route,
    }))))
    : options.routes.map(route => ({ surface: null, baseUrl: options.baseUrl, headers: {}, route }))
  const endpointTargets = [...new Map(routeTargets.map(target => [
      `${target.baseUrl}\u0000${JSON.stringify(target.headers)}`,
    target,
  ])).values()]
  const endpointResults = []
  for (const target of endpointTargets) {
    endpointResults.push({
      surface: target.surface,
      baseUrl: target.baseUrl,
      ...await verifyEndpoint(target.baseUrl, options, target.headers),
    })
  }
  const endpoint = endpointResults[0]
  for (const result of endpointResults.slice(1)) {
    if (result.sourceSha !== endpoint.sourceSha || result.workerVersionId !== endpoint.workerVersionId || result.workerVersionTag !== endpoint.workerVersionTag) {
      throw new CandidateVerificationError('Release route inventory surfaces exposed different Worker provenance', 'PROVENANCE_MISMATCH')
    }
  }
  const routeResults = []
  for (const target of routeTargets) {
    routeResults.push(await verifyRoute(target.route, target.baseUrl, options, options.buildDir, target.headers, target.surface))
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
    routeInventory: options.routeInventory,
    surfaces: endpointResults,
    endpoint: '/api/deployment',
    sourceSha: endpoint.sourceSha,
    workerVersionId: endpoint.workerVersionId,
    workerVersionTag: endpoint.workerVersionTag,
    workerVersionTimestamp: endpoint.workerVersionTimestamp,
    routes: options.routeInventory ? routeTargets.map(target => `${target.surface}:${target.route.path}`) : options.routes,
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
    console.log('Usage: node scripts/verify-deployed-candidate.mjs --base-url URL --expected-sha SHA [--expected-worker-version-id ID] [--version-override-header VALUE] [--route PATH ...] [--route-inventory FILE] [--build-dir DIR] [--output FILE]')
    return null
  }

  try {
    let routeInventory = null
    if (options.routeInventoryPath) {
      let parsed
      try {
        parsed = JSON.parse(await readFile(options.routeInventoryPath, 'utf8'))
      } catch {
        throw new CandidateVerificationError('route inventory file is not valid JSON', 'INVALID_ROUTE_INVENTORY')
      }
      routeInventory = parsed
    }
    const evidence = await verifyDeployedCandidate({ ...options, routeInventory })
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
