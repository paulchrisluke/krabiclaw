import assert from 'node:assert/strict'
import test from 'node:test'

import {
  comparePerformanceReports,
  createBenchmarkVersionConfig,
  createWorkerVersionOverrideHeaders,
  percentile,
  renderPerformanceComparisonMarkdown,
  summarizeSamples,
  validateBenchmarkSampleCount,
} from '../../scripts/lib/performance-comparison.mjs'

function sampleReport(overrides: Record<string, unknown> = {}) {
  const samples = Array.from({ length: 20 }, (_, index) => ({
    sample: index + 1,
    status: 200,
    totalMs: 100,
    ttfbMs: 40,
    lcpMs: 80,
    interactionProxyMs: 2,
    requestCount: 3,
    failedRequestCount: 0,
    d1QueryCount: 2,
    responseBytes: 1200,
    cacheStatus: 'hit',
  }))
  return {
    runLabel: 'baseline',
    sourceSha: 'a'.repeat(40),
    workerVersionId: '00000000-0000-4000-8000-000000000001',
    workerName: 'krabiclaw',
    cacheState: 'warm',
    environment: 'https://staging.example',
    browser: 'Playwright Chromium',
    runner: { platform: 'darwin', nodeVersion: 'v24', browserVersion: '1.59.1' },
    fixtures: { site: 'demo', dataset: 'seed-v1' },
    scenarios: [{ name: 'saya-about', template: 'saya', url: 'https://staging.example/about' }],
    sampleCount: 20,
    warmupCount: 1,
    warmupSamplesDiscarded: 1,
    errors: 0,
    results: [{
      name: 'saya-about',
      template: 'saya',
      url: 'https://staging.example/about',
      warmupCount: 1,
      samples,
      errors: 0,
      totalMs: { median: 100, p50: 100, p95: 100, max: 100, p99: null },
      ttfbMs: { median: 40, p50: 40, p95: 40, max: 40, p99: null },
      lcpMs: { median: 80, p50: 80, p95: 80, max: 80, p99: null },
      interactionProxyMs: { median: 2, p50: 2, p95: 2, max: 2, p99: null },
      requestCount: { median: 3, p50: 3, p95: 3, max: 3, p99: null },
      d1QueryCount: { median: 2, p50: 2, p95: 2, max: 2, p99: null },
      responseBytes: { median: 1200, p50: 1200, p95: 1200, max: 1200, p99: null },
    }],
    ...overrides,
  }
}

test('worker version override headers use Cloudflare deployment pin syntax', () => {
  const versionId = '00000000-0000-4000-8000-000000000002'
  assert.deepEqual(
    createWorkerVersionOverrideHeaders(versionId, 'krabiclaw'),
    { 'Cloudflare-Workers-Version-Overrides': `krabiclaw="${versionId}"` },
  )
  assert.deepEqual(createWorkerVersionOverrideHeaders(null, 'krabiclaw'), {})
  assert.throws(() => createWorkerVersionOverrideHeaders('not-a-version', 'krabiclaw'), /UUID-like/)
})

test('worker version metadata does not pin requests unless an explicit override is supplied', () => {
  assert.deepEqual(
    createBenchmarkVersionConfig({ workerVersionId: 'metadata-only', workerName: 'krabiclaw' }),
    {
      workerVersionId: 'metadata-only',
      workerVersionOverride: null,
      workerVersionHeaders: {},
    },
  )
  assert.deepEqual(
    createBenchmarkVersionConfig({
      workerVersionId: 'metadata-only',
      workerVersionOverride: '00000000-0000-4000-8000-000000000003',
      workerName: 'krabiclaw-staging',
    }),
    {
      workerVersionId: 'metadata-only',
      workerVersionOverride: '00000000-0000-4000-8000-000000000003',
      workerVersionHeaders: {
        'Cloudflare-Workers-Version-Overrides': 'krabiclaw-staging="00000000-0000-4000-8000-000000000003"',
      },
    },
  )
})

test('candidate runs require the full comparison sample count while smoke runs stay small', () => {
  assert.equal(validateBenchmarkSampleCount(5, 'smoke'), 5)
  assert.throws(
    () => validateBenchmarkSampleCount(19, 'candidate'),
    /at least 20 samples/,
  )
  assert.equal(validateBenchmarkSampleCount(20, 'candidate'), 20)
})

test('summaries expose median and suppress p99 below one hundred samples', () => {
  const summary = summarizeSamples([{ totalMs: 20 }, { totalMs: 10 }, { totalMs: 30 }], 'totalMs')
  assert.equal(summary.median, 20)
  assert.equal(summary.p50, 20)
  assert.equal(summary.p95, 30)
  assert.equal(summary.max, 30)
  assert.equal(summary.p99, null)
  assert.equal(percentile([10, 20, 30], 95), 30)
})

test('comparison rejects fewer than twenty samples and mismatched run metadata', () => {
  const baseline = sampleReport()
  const head = sampleReport({ runLabel: 'head', sampleCount: 19, cacheState: 'cold' })
  const result = comparePerformanceReports(baseline, head)
  assert.equal(result.ok, false)
  assert.match(result.failures.join('\n'), /at least 20 samples/)
  assert.match(result.failures.join('\n'), /cacheState/)
})

test('comparison rejects unverifiable source, Worker, environment, cache, label, and warm-up metadata', () => {
  const baseline = sampleReport({
    sourceSha: 'not-a-sha',
    workerVersionId: 'local',
    cacheState: 'unspecified',
    warmupCount: 0,
  })
  const head = sampleReport({
    runLabel: 'candidate',
    workerName: 'krabiclaw-other',
    environment: 'https://other.example',
    warmupSamplesDiscarded: 2,
  })
  const result = comparePerformanceReports(baseline, head)
  assert.equal(result.ok, false)
  const failures = result.failures.join('\n')
  assert.match(failures, /full 40-character hexadecimal SHA/)
  assert.match(failures, /deployed Worker version/)
  assert.match(failures, /cacheState must be explicit/)
  assert.match(failures, /environment differs/)
  assert.match(failures, /workerName differs/)
  assert.match(failures, /warmupCount/)
})

test('comparison rejects missing deterministic headers and non-UUID Worker identifiers', () => {
  const baseline = sampleReport({
    workerVersionId: 'worker-baseline',
    workerVersionOverride: 'not-a-uuid',
    results: [{
      ...sampleReport().results[0],
      samples: sampleReport().results[0].samples.map(sample => ({ ...sample, d1QueryCount: null })),
      d1QueryCount: { median: null, p95: null, max: null, p99: null },
    }],
  })
  const head = sampleReport({ runLabel: 'candidate' })
  const result = comparePerformanceReports(baseline, head)
  assert.equal(result.ok, false)
  const failures = result.failures.join('\n')
  assert.match(failures, /workerVersionId must be UUID-like/)
  assert.match(failures, /workerVersionOverride must be UUID-like/)
  assert.match(failures, /d1QueryCount\.median must be finite/)
  assert.match(failures, /sample 1 d1QueryCount header must be finite/)
})

test('comparison fails deterministic request and query increases, but reports payload deltas', () => {
  const baseline = sampleReport()
  const head = sampleReport({
    runLabel: 'head',
    sourceSha: 'b'.repeat(40),
    workerVersionId: '00000000-0000-4000-8000-000000000002',
    results: [{
      ...baseline.results[0],
      requestCount: { median: 4, p50: 4, p95: 4, max: 4, p99: null },
      d1QueryCount: { median: 3, p50: 3, p95: 3, max: 3, p99: null },
      responseBytes: { median: 1300, p50: 1300, p95: 1300, max: 1300, p99: null },
    }],
  })
  const result = comparePerformanceReports(baseline, head)
  assert.equal(result.ok, false)
  assert.match(result.failures.join('\n'), /request count regression/)
  assert.match(result.failures.join('\n'), /D1 query count regression/)
  assert.equal(result.scenarios[0].responseBytes.delta, 100)
  assert.equal(result.scenarios[0].responseBytes.percent, 8.333333333333332)
})

test('wall-clock regressions require both fifteen percent and fifty milliseconds', () => {
  const baseline = sampleReport()
  const underThreshold = sampleReport({
    runLabel: 'head',
    results: [{ ...baseline.results[0], totalMs: { median: 149, p50: 149, p95: 149, max: 149, p99: null } }],
  })
  assert.equal(comparePerformanceReports(baseline, underThreshold).ok, true)

  const overThreshold = sampleReport({
    runLabel: 'head',
    results: [{ ...baseline.results[0], totalMs: { median: 151, p50: 151, p95: 151, max: 151, p99: null } }],
  })
  const result = comparePerformanceReports(baseline, overThreshold)
  assert.equal(result.ok, false)
  assert.match(result.failures.join('\n'), /wall-clock regression/)
})

test('deterministic gates catch p95 and maximum regressions even when medians match', () => {
  const baseline = sampleReport()
  const head = sampleReport({
    runLabel: 'head',
    results: [{
      ...baseline.results[0],
      requestCount: { median: 3, p50: 3, p95: 4, max: 4, p99: null },
      d1QueryCount: { median: 2, p50: 2, p95: 3, max: 3, p99: null },
      responseBytes: { median: 1200, p50: 1200, p95: 1300, max: 1400, p99: null },
    }],
  })
  const result = comparePerformanceReports(baseline, head)
  assert.equal(result.ok, false)
  assert.match(result.failures.join('\n'), /request count regression/)
  assert.match(result.failures.join('\n'), /D1 query count regression/)
  assert.match(result.failures.join('\n'), /response bytes regression/)
  assert.equal(result.scenarios[0].responseBytes.p95.delta, 100)
  assert.equal(result.scenarios[0].responseBytes.max.delta, 200)
})

test('comparison markdown exposes median and p95 deltas', () => {
  const baseline = sampleReport()
  const head = sampleReport({
    runLabel: 'head',
    results: [{
      ...baseline.results[0],
      requestCount: { median: 3, p50: 3, p95: 4, max: 4, p99: null },
      d1QueryCount: { median: 2, p50: 2, p95: 3, max: 3, p99: null },
      responseBytes: { median: 1250, p50: 1250, p95: 1300, max: 1300, p99: null },
    }],
  })
  const comparison = comparePerformanceReports(baseline, head)
  const markdown = renderPerformanceComparisonMarkdown(comparison)
  assert.match(markdown, /Requests median Δ/)
  assert.match(markdown, /Requests p95 Δ/)
  assert.match(markdown, /Response bytes median Δ/)
  assert.match(markdown, /Response bytes p95 Δ/)
})
