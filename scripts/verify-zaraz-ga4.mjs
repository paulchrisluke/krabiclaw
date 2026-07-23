#!/usr/bin/env node
import { chromium } from '@playwright/test'

function readArg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] || '' : fallback
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`)
}

function usage(message) {
  if (message) console.error(message)
  console.error('Usage: node scripts/verify-zaraz-ga4.mjs --url <url> --expected <G-...> [--forbidden <G-...>] [--consent accepted|rejected]')
  process.exit(1)
}

const url = readArg('url')
const expected = readArg('expected')
const forbidden = readArg('forbidden')
const consent = readArg('consent', 'accepted')
const timeoutMs = Number(readArg('timeout-ms', '20000'))
const headed = hasFlag('headed')

if (!url) usage('Missing --url.')
if (!expected) usage('Missing --expected.')
if (!['accepted', 'rejected'].includes(consent)) usage('--consent must be accepted or rejected.')

const parsedUrl = new URL(url)
const collectionRequests = []
const requestErrors = []
const consoleErrors = []
const observedMeasurementIds = new Set()

function measurementIdFromRequest(requestUrl) {
  const parsed = new URL(requestUrl)
  return parsed.searchParams.get('tid') || parsed.searchParams.get('measurement_id')
}

function isGoogleCollectRequest(requestUrl) {
  const parsed = new URL(requestUrl)
  return (
    parsed.pathname.endsWith('/g/collect') &&
    (
      parsed.hostname === 'www.google-analytics.com' ||
      parsed.hostname === 'analytics.google.com' ||
      parsed.hostname === 'stats.g.doubleclick.net'
    )
  )
}

const browser = await chromium.launch({ headless: !headed })
let exitCode = 0
try {
  const context = await browser.newContext()
  await context.addCookies([{
    name: 'kc_consent',
    value: consent,
    domain: parsedUrl.hostname,
    path: '/',
    sameSite: 'Lax',
    expires: Math.floor(Date.now() / 1000) + 3600,
  }])
  const page = await context.newPage()
  page.on('request', (request) => {
    const requestUrl = request.url()
    if (!isGoogleCollectRequest(requestUrl)) return
    const measurementId = measurementIdFromRequest(requestUrl)
    if (measurementId) observedMeasurementIds.add(measurementId)
    collectionRequests.push({
      url: requestUrl.replace(/([?&](?:cid|sid|_p|dl|dr|dt)=)[^&]+/g, '$1<redacted>'),
      measurementId,
    })
  })
  page.on('requestfailed', (request) => {
    if (isGoogleCollectRequest(request.url())) {
      requestErrors.push({ url: request.url(), errorText: request.failure()?.errorText })
    }
  })
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  const response = await page.goto(url, { waitUntil: 'load', timeout: timeoutMs })
  await page.waitForTimeout(5000)
  const runtime = await page.evaluate(() => ({
    hasZaraz: typeof window.zaraz !== 'undefined',
    hasGtag: typeof window.gtag !== 'undefined',
    consentCookie: document.cookie.split('; ').find(value => value.startsWith('kc_consent=')) || null,
  }))
  const measurementIds = Array.from(observedMeasurementIds).sort()
  const result = {
    url,
    status: response?.status() ?? null,
    consent,
    expected,
    forbidden: forbidden || null,
    observedMeasurementIds: measurementIds,
    collectionRequests,
    requestErrors,
    runtime,
    consoleErrors: consoleErrors.slice(0, 10),
  }
  console.log(JSON.stringify(result, null, 2))

  if (response && response.status() >= 400) exitCode = 1
  if (!runtime.hasZaraz) exitCode = 1
  if (consent === 'accepted' && !measurementIds.includes(expected)) exitCode = 1
  if (consent === 'rejected' && measurementIds.includes(expected)) exitCode = 1
  if (forbidden && measurementIds.includes(forbidden)) exitCode = 1
} finally {
  await browser.close()
}
process.exit(exitCode)
