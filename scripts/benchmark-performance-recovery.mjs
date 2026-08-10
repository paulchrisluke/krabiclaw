import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

import {
  createBenchmarkVersionConfig,
  summarizeSamples,
  validateBenchmarkSampleCount,
} from './lib/performance-comparison.mjs'

function parseArgs(argv) {
  const values = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) values[key] = 'true'
    else {
      values[key] = next
      index += 1
    }
  }
  return values
}

function parseNumericHeader(response, name) {
  const value = Number(response.headers()[name])
  return Number.isFinite(value) ? value : null
}

function isLocalHost(hostname) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
}

function isPreviewContext(hostname) {
  return hostname === 'workers.dev'
    || hostname.endsWith('.workers.dev')
    || /^(?:staging|preview)\.[^.]+\.[^.]+$/.test(hostname)
}

function tenantTarget(baseUrl, slug) {
  const url = new URL(baseUrl)
  if (isLocalHost(url.hostname)) {
    url.hostname = `${slug}.localhost`
    return { baseUrl: url, headers: {} }
  }
  if (isPreviewContext(url.hostname)) {
    return {
      baseUrl: url,
      headers: { 'x-preview-tenant': slug, 'cache-control': 'no-store' },
    }
  }
  url.hostname = url.hostname.startsWith(`${slug}.`) ? url.hostname : `${slug}.${url.hostname}`
  return { baseUrl: url, headers: {} }
}

async function measurePage(context, scenario, sampleNumber) {
  const page = await context.newPage()
  try {
    if (Object.keys(scenario.headers).length > 0) {
      const scenarioOrigin = new URL(scenario.url).origin
      await page.route('**/*', async (route) => {
        if (new URL(route.request().url()).origin !== scenarioOrigin) {
          await route.continue()
          return
        }
        await route.continue({
          headers: { ...route.request().headers(), ...scenario.headers },
        })
      })
    }
    const dataRequests = []
    const failedRequests = []
    page.on('request', request => {
      if (/\/api\/(?:public|dashboard)\//.test(request.url())) dataRequests.push(request.url())
    })
    page.on('requestfailed', request => {
      if (
        request.resourceType() === 'document'
        || /\/api\/(?:public|dashboard)\//.test(request.url())
      ) {
        failedRequests.push(request.url())
      }
    })
    const startedAt = performance.now()
    const response = await page.goto(scenario.url, { waitUntil: 'load', timeout: 30_000 })
    const totalMs = performance.now() - startedAt
    const browserMetrics = await page.evaluate(async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const navigation = performance.getEntriesByType('navigation')[0]
      const lcpMs = window.__krabiBenchmarkLcp ?? null
      const interactionStartedAt = performance.now()
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      return {
        ttfbMs: navigation ? navigation.responseStart - navigation.startTime : null,
        lcpMs,
        interactionProxyMs: performance.now() - interactionStartedAt,
      }
    })
    return {
      sample: sampleNumber,
      status: response?.status() ?? 0,
      totalMs,
      ...browserMetrics,
      requestCount: dataRequests.length,
      failedRequestCount: failedRequests.length,
      d1QueryCount: response ? parseNumericHeader(response, 'x-d1-query-count') : null,
      responseBytes: response ? parseNumericHeader(response, 'x-response-bytes') : null,
      cacheStatus: response?.headers()['x-data-cache'] ?? null,
    }
  } finally {
    await page.close()
  }
}

async function measureScenario(context, scenario, sampleCount) {
  // Prime the same browser/Worker/cache path once, then discard that result.
  // Both comparison candidates perform exactly one warm-up per scenario.
  await measurePage(context, scenario, 0)
  const samples = []
  for (let index = 0; index < sampleCount; index += 1) {
    samples.push(await measurePage(context, scenario, index + 1))
  }
  return {
    name: scenario.name,
    template: scenario.template,
    url: scenario.url,
    warmupCount: 1,
    samples,
    errors: samples.filter(sample =>
      sample.status < 200 || sample.status >= 400 || sample.failedRequestCount > 0,
    ).length,
    totalMs: summarizeSamples(samples, 'totalMs'),
    ttfbMs: summarizeSamples(samples, 'ttfbMs'),
    lcpMs: summarizeSamples(samples, 'lcpMs'),
    interactionProxyMs: summarizeSamples(samples, 'interactionProxyMs'),
    requestCount: summarizeSamples(samples, 'requestCount'),
    d1QueryCount: summarizeSamples(samples, 'd1QueryCount'),
    responseBytes: summarizeSamples(samples, 'responseBytes'),
  }
}

const args = parseArgs(process.argv.slice(2))
const baseUrl = args['base-url'] ?? 'http://localhost:3000'
const runLabel = String(args['run-label'] ?? process.env.BENCHMARK_RUN_LABEL ?? 'smoke')
const samples = validateBenchmarkSampleCount(Math.max(3, Number(args.samples) || 5), runLabel)
const outputDir = path.resolve(args['output-dir'] ?? 'test-results/performance-recovery')
const platformUrl = new URL(baseUrl)
const sayaTarget = tenantTarget(baseUrl, 'demo')
const blawbyTarget = tenantTarget(baseUrl, 'ncls')
const workerName = String(args['worker-name'] ?? process.env.WORKER_NAME ?? 'krabiclaw').trim() || 'krabiclaw'
const workerVersionConfig = createBenchmarkVersionConfig({
  workerVersionId: args['worker-version-id'] ?? args['worker-version'] ?? process.env.WORKER_VERSION_ID,
  workerVersionOverride: args['worker-version-override'] ?? process.env.WORKER_VERSION_OVERRIDE,
  workerName,
})
const { workerVersionId, workerVersionOverride, workerVersionHeaders } = workerVersionConfig
const cacheState = String(args['cache-state'] ?? process.env.BENCHMARK_CACHE_STATE ?? 'unspecified')
const sourceSha = String(
  args['source-sha']
    ?? process.env.SOURCE_SHA
    ?? process.env.GITHUB_SHA
    ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }),
).trim()

const browser = await chromium.launch()
try {
  const context = await browser.newContext({ extraHTTPHeaders: workerVersionHeaders })
  await context.addInitScript(() => {
    window.__krabiBenchmarkLcp = null
    new PerformanceObserver((list) => {
      const entries = list.getEntries()
      const latest = entries[entries.length - 1]
      if (latest) window.__krabiBenchmarkLcp = latest.startTime
    }).observe({ type: 'largest-contentful-paint', buffered: true })
  })
  const loginResponse = await context.request.get(
    new URL('/api/dev/login?userId=user-pottery-house', platformUrl).toString(),
    {
      headers: {
        'x-dev-route-secret': process.env.E2E_DEV_ROUTE_SECRET ?? 'ci-dev-route-secret',
        ...workerVersionHeaders,
      },
      maxRedirects: 0,
    },
  )
  if (loginResponse.status() !== 302) {
    throw new Error(`Dashboard benchmark login failed with ${loginResponse.status()}`)
  }

  const scenarios = [
    {
      name: 'saya-about',
      template: 'saya',
      url: new URL('/about', sayaTarget.baseUrl).toString(),
      headers: sayaTarget.headers,
    },
    {
      name: 'blawby-about',
      template: 'blawby',
      url: new URL('/about', blawbyTarget.baseUrl).toString(),
      headers: blawbyTarget.headers,
    },
    {
      name: 'dashboard-site-overview',
      template: 'dashboard',
      url: new URL(
        '/dashboard/pottery-house-krabi/sites/pottery-house',
        platformUrl,
      ).toString(),
      headers: {},
    },
  ]

  const results = []
  for (const scenario of scenarios) {
    process.stdout.write(`[benchmark] ${scenario.name}: ${samples} samples\n`)
    results.push(await measureScenario(context, scenario, samples))
  }

  const browserVersion = browser.version()
  const fixtures = {
    saya: isPreviewContext(platformUrl.hostname)
      ? 'site-demo / x-preview-tenant: demo'
      : `site-demo / ${sayaTarget.baseUrl.hostname}`,
    blawby: isPreviewContext(platformUrl.hostname)
      ? 'NCLS seed / x-preview-tenant: ncls'
      : `NCLS seed / ${blawbyTarget.baseUrl.hostname}`,
    dashboard: 'user-pottery-house / pottery-house seed',
  }
  const report = {
    runLabel,
    sourceSha,
    // Keep commit as an alias for report consumers that predate the immutable
    // sourceSha field.  Comparisons always use sourceSha.
    commit: sourceSha,
    workerVersionId,
    workerVersionOverride,
    workerName,
    cacheState,
    workingTreeDirty:
      execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0,
    measuredAt: new Date().toISOString(),
    environment: baseUrl,
    browser: 'Playwright Chromium',
    runner: {
      platform: process.platform,
      nodeVersion: process.version,
      browser: 'chromium',
      browserVersion,
    },
    sampleCount: samples,
    warmupCount: 1,
    warmupSamplesDiscarded: results.reduce((total, result) => total + result.warmupCount, 0),
    fixtures,
    scenarios: results.map(result => ({ name: result.name, template: result.template, url: result.url })),
    errors: results.reduce((total, result) => total + result.errors, 0),
    note:
      'The current template registry contains Saya and Blawby; no Lobby template or fixture exists in this revision.',
    results,
  }
  await mkdir(outputDir, { recursive: true })
  const outputStem = `performance-recovery-${runLabel}`
  const jsonPath = path.join(outputDir, `${outputStem}.json`)
  const markdownPath = path.join(outputDir, `${outputStem}.md`)
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
  const rows = results.map(result => [
    result.name,
    result.template,
    result.errors,
    result.totalMs.median,
    result.totalMs.p95,
    result.totalMs.p99,
    result.ttfbMs.p95,
    result.lcpMs.p95,
    result.interactionProxyMs.p95,
    result.requestCount.p95,
    result.d1QueryCount.p95,
    result.responseBytes.p95,
  ].map(value => value ?? 'n/a').join(' | '))
  await writeFile(markdownPath, [
    '# Performance recovery benchmark',
    '',
    `- Run label: \`${report.runLabel}\``,
    `- Source SHA: \`${report.sourceSha}${report.workingTreeDirty ? '+working-tree' : ''}\``,
    `- Worker: \`${report.workerName}\` / version \`${report.workerVersionId}\``,
    `- Worker override: \`${report.workerVersionOverride ?? 'none'}\``,
    `- Measured: ${report.measuredAt}`,
    `- Environment: ${report.environment}`,
    `- Browser: ${report.browser}`,
    `- Cache state: ${report.cacheState}`,
    `- Samples per scenario: ${report.sampleCount}`,
    `- Warm-ups: ${report.warmupCount} per scenario (${report.warmupSamplesDiscarded} discarded total)`,
    `- Errors: ${report.errors}`,
    `- Note: ${report.note}`,
    '',
    '| Scenario | Template | Errors | total median | total p95 | total p99* | TTFB p95 | LCP p95 | interaction proxy p95 | data requests p95 | D1 p95 | bytes p95 |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...rows.map(row => `| ${row} |`),
    '',
    '* p99 is intentionally omitted unless at least 100 samples are collected.',
  ].join('\n'))
  process.stdout.write(`[benchmark] ${jsonPath}\n[benchmark] ${markdownPath}\n`)
} finally {
  await browser.close()
}
