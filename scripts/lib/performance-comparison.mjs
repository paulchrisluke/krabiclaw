/**
 * Shared benchmark helpers.
 *
 * This module deliberately has no Playwright or filesystem dependency.  The
 * runner and comparator can therefore use the same summary/metadata contract,
 * while unit tests exercise the release gate without launching a browser.
 */

export const MIN_COMPARISON_SAMPLES = 20
export const P99_MIN_SAMPLES = 100
export const UPPER_PERCENTILE = 95
export const WORKER_VERSION_OVERRIDE_HEADER = 'Cloudflare-Workers-Version-Overrides'

const WALL_CLOCK_METRICS = ['totalMs', 'ttfbMs', 'lcpMs', 'interactionProxyMs']
const PLACEHOLDER_VALUES = new Set(['', 'local', 'unknown', 'n/a', 'na', 'none', 'unspecified', 'placeholder'])
const DETERMINISTIC_METRICS = ['requestCount', 'd1QueryCount', 'responseBytes']

function numericValues(values) {
  return values.filter(value => typeof value === 'number' && Number.isFinite(value))
}

export function percentile(values, percentileValue) {
  const numbers = numericValues(values)
  if (numbers.length === 0) return null
  if (!Number.isFinite(percentileValue) || percentileValue < 0 || percentileValue > 100) {
    throw new RangeError(`Percentile must be between 0 and 100, got ${percentileValue}`)
  }
  const sorted = [...numbers].sort((left, right) => left - right)
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1
  return sorted[Math.max(0, index)]
}

export function summarizeSamples(samples, field) {
  const values = numericValues(samples.map(sample => sample?.[field]))
  return {
    median: percentile(values, 50),
    // Keep p50 as a compatibility alias for existing benchmark consumers.
    p50: percentile(values, 50),
    p95: percentile(values, UPPER_PERCENTILE),
    max: percentile(values, 100),
    // A small smoke run must never imply that it measured a p99 tail.
    p99: samples.length >= P99_MIN_SAMPLES ? percentile(values, 99) : null,
  }
}

export function createWorkerVersionOverrideHeaders(workerVersionId, workerName = 'krabiclaw') {
  if (workerVersionId === null || workerVersionId === undefined || String(workerVersionId).trim() === '') {
    return {}
  }
  const version = String(workerVersionId).trim()
  const name = String(workerName || 'krabiclaw').trim()
  if (!isUuidLike(version)) {
    throw new Error('Worker version override must be a UUID-like version id')
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
    throw new Error('Worker name contains unsupported characters')
  }
  return {
    [WORKER_VERSION_OVERRIDE_HEADER]: `${name}="${version}"`,
  }
}

export function createBenchmarkVersionConfig({
  workerVersionId,
  workerVersionOverride,
  workerName = 'krabiclaw',
} = {}) {
  const metadataVersion = String(workerVersionId ?? workerVersionOverride ?? 'local').trim() || 'local'
  const explicitOverride = workerVersionOverride === null || workerVersionOverride === undefined
    || String(workerVersionOverride).trim() === ''
    ? null
    : String(workerVersionOverride).trim()
  return {
    workerVersionId: metadataVersion,
    workerVersionOverride: explicitOverride,
    workerVersionHeaders: createWorkerVersionOverrideHeaders(explicitOverride, workerName),
  }
}

export function validateBenchmarkSampleCount(sampleCount, runLabel = 'smoke') {
  const count = Number(sampleCount)
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`Benchmark sample count must be a positive integer, got ${sampleCount}`)
  }
  if (['baseline', 'head', 'candidate', 'comparison'].includes(String(runLabel).toLowerCase()) && count < MIN_COMPARISON_SAMPLES) {
    throw new Error(`Comparison benchmark runs require at least ${MIN_COMPARISON_SAMPLES} samples; got ${count}`)
  }
  return count
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== ''
}

function isPlaceholder(value) {
  return typeof value !== 'string' || PLACEHOLDER_VALUES.has(value.trim().toLowerCase())
}

function isUuidLike(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())
}

function reportErrors(report) {
  return Number.isFinite(report?.errors) ? report.errors : null
}

function resultMetric(result, metric) {
  const value = result?.[metric]
  if (!value || typeof value !== 'object') return null
  const rawValues = Array.isArray(result?.samples)
    ? numericValues(result.samples.map(sample => sample?.[metric]))
    : []
  const median = Number.isFinite(value.median) ? value.median : (Number.isFinite(value.p50) ? value.p50 : percentile(rawValues, 50))
  const p95 = Number.isFinite(value.p95) ? value.p95 : null
  const max = Number.isFinite(value.max) ? value.max : percentile(rawValues, 100)
  return {
    median: Number.isFinite(median) ? median : null,
    p95: Number.isFinite(p95) ? p95 : percentile(rawValues, UPPER_PERCENTILE),
    max: Number.isFinite(max) ? max : null,
  }
}

function scalarDelta(baselineValue, headValue) {
  if (!Number.isFinite(baselineValue) || !Number.isFinite(headValue)) {
    return { baseline: baselineValue ?? null, head: headValue ?? null, delta: null, percent: null }
  }
  const delta = headValue - baselineValue
  return {
    baseline: baselineValue,
    head: headValue,
    delta,
    percent: baselineValue === 0 ? (delta === 0 ? 0 : null) : (delta / baselineValue) * 100,
  }
}

function metricDelta(baseline, head) {
  const median = scalarDelta(baseline?.median, head?.median)
  const p95 = scalarDelta(baseline?.p95, head?.p95)
  const max = scalarDelta(baseline?.max, head?.max)
  // Preserve the original median aliases while exposing each statistic
  // explicitly for deterministic release gates and comparison reports.
  return { ...median, median, p95, max }
}

function wallClockRegression(delta) {
  return ['median', 'p95'].some(statistic => {
    const value = delta?.[statistic] ?? delta
    return Number.isFinite(value?.delta)
      && Number.isFinite(value?.percent)
      && value.delta > 50
      && value.percent > 15
  })
}

function deterministicRegression(delta) {
  return ['p95', 'max'].some(statistic => {
    const value = delta?.[statistic]
    return Number.isFinite(value?.delta) && value.delta > 0
  })
}

function requiredMetadataFailures(report, label) {
  const failures = []
  if (!report || typeof report !== 'object') {
    return [`${label} report is not an object`]
  }
  for (const field of ['runLabel', 'sourceSha', 'workerVersionId', 'cacheState', 'browser', 'runner', 'fixtures', 'scenarios', 'sampleCount', 'errors', 'results']) {
    if (!hasValue(report[field])) failures.push(`${label} report is missing ${field}`)
  }
  const expectedLabels = label === 'baseline' ? ['baseline'] : ['head', 'candidate']
  if (!expectedLabels.includes(report.runLabel)) {
    failures.push(`${label} report runLabel must be ${expectedLabels.join(' or ')}; got ${report.runLabel}`)
  }
  if (typeof report.sourceSha !== 'string' || !/^[0-9a-f]{40}$/i.test(report.sourceSha)) {
    failures.push(`${label} report sourceSha must be a full 40-character hexadecimal SHA`)
  }
  if (isPlaceholder(report.workerVersionId)) {
    failures.push(`${label} report workerVersionId must identify a deployed Worker version`)
  } else if (!isUuidLike(report.workerVersionId)) {
    failures.push(`${label} report workerVersionId must be UUID-like`)
  }
  if (report.workerVersionOverride !== null && report.workerVersionOverride !== undefined && !isUuidLike(report.workerVersionOverride)) {
    failures.push(`${label} report workerVersionOverride must be UUID-like when present`)
  }
  if (isPlaceholder(report.workerName)) {
    failures.push(`${label} report workerName is required`)
  }
  if (typeof report.environment !== 'string' || isPlaceholder(report.environment)) {
    failures.push(`${label} report environment is required`)
  }
  if (typeof report.cacheState !== 'string' || isPlaceholder(report.cacheState)) {
    failures.push(`${label} report cacheState must be explicit; unspecified is not comparable`)
  }
  if (!Number.isInteger(report.sampleCount) || report.sampleCount < MIN_COMPARISON_SAMPLES) {
    failures.push(`${label} comparison requires at least ${MIN_COMPARISON_SAMPLES} samples; got ${report.sampleCount}`)
  }
  if (!Number.isFinite(report.errors) || report.errors < 0) {
    failures.push(`${label} report errors must be a non-negative number`)
  }
  if (!Number.isInteger(report.warmupCount) || report.warmupCount < 1) {
    failures.push(`${label} report warmupCount must be at least one per scenario`)
  }
  if (!Number.isInteger(report.warmupSamplesDiscarded) || report.warmupSamplesDiscarded < 1) {
    failures.push(`${label} report warmupSamplesDiscarded is required`)
  }
  if (!Array.isArray(report.results) || report.results.length === 0) {
    failures.push(`${label} report must include at least one result`)
  } else {
    for (const result of report.results) {
      if (!Array.isArray(result.samples) || result.samples.length !== report.sampleCount) {
        failures.push(`${label} scenario ${result.name ?? '<unnamed>'} sample count does not match report sampleCount`)
      }
      if (result.warmupCount !== report.warmupCount) {
        failures.push(`${label} scenario ${result.name ?? '<unnamed>'} warmupCount does not match report warmupCount`)
      }
      for (const metric of DETERMINISTIC_METRICS) {
        const summary = result[metric]
        if (!summary || typeof summary !== 'object') {
          failures.push(`${label} scenario ${result.name ?? '<unnamed>'} is missing ${metric} summary`)
          continue
        }
        for (const statistic of ['median', 'p95', 'max']) {
          if (!Number.isFinite(summary[statistic])) {
            failures.push(`${label} scenario ${result.name ?? '<unnamed>'} ${metric}.${statistic} must be finite`)
          }
        }
        if (Array.isArray(result.samples)) {
          for (const [index, sample] of result.samples.entries()) {
            if (!Number.isFinite(sample?.[metric])) {
              failures.push(`${label} scenario ${result.name ?? '<unnamed>'} sample ${index + 1} ${metric} header must be finite`)
              break
            }
          }
        }
      }
    }
  }
  if (!Array.isArray(report.scenarios) || report.scenarios.length === 0) {
    failures.push(`${label} report must include scenarios`)
  } else if (Number.isInteger(report.warmupCount) && Number.isInteger(report.warmupSamplesDiscarded)
    && report.warmupSamplesDiscarded !== report.warmupCount * report.scenarios.length) {
    failures.push(`${label} report warmupSamplesDiscarded must equal warmupCount × scenario count`)
  }
  return failures
}

function comparableMetadataFailures(baseline, head) {
  const failures = []
  for (const field of ['runner', 'fixtures', 'scenarios', 'cacheState', 'browser', 'environment', 'workerName', 'warmupCount', 'warmupSamplesDiscarded']) {
    if (stableStringify(baseline[field]) !== stableStringify(head[field])) {
      failures.push(`${field} differs between baseline and head; runs are not equivalent`)
    }
  }
  if (baseline.sampleCount !== head.sampleCount) {
    failures.push(`sampleCount differs between baseline (${baseline.sampleCount}) and head (${head.sampleCount})`)
  }
  return failures
}

/**
 * Compare two complete benchmark reports.  The return value is intentionally
 * serialisable so the CLI can write it verbatim as JSON.
 */
export function comparePerformanceReports(baseline, head) {
  const failures = [
    ...requiredMetadataFailures(baseline, 'baseline'),
    ...requiredMetadataFailures(head, 'head'),
  ]
  if (baseline && head && typeof baseline === 'object' && typeof head === 'object') {
    failures.push(...comparableMetadataFailures(baseline, head))
  }

  const scenarios = []
  const baselineResults = Array.isArray(baseline?.results) ? baseline.results : []
  const headResults = Array.isArray(head?.results) ? head.results : []
  const headByName = new Map(headResults.map(result => [result?.name, result]))

  for (const baselineResult of baselineResults) {
    const name = baselineResult?.name ?? '<unnamed>'
    const headResult = headByName.get(baselineResult?.name)
    if (!headResult) {
      failures.push(`head report is missing scenario ${name}`)
      continue
    }
    if (Number.isFinite(baselineResult.errors) && baselineResult.errors > 0) {
      failures.push(`${name} baseline has ${baselineResult.errors} errors`)
    }
    if (Number.isFinite(headResult.errors) && headResult.errors > 0) {
      failures.push(`${name} head has ${headResult.errors} errors`)
    }

    const requestCount = metricDelta(resultMetric(baselineResult, 'requestCount'), resultMetric(headResult, 'requestCount'))
    const d1QueryCount = metricDelta(resultMetric(baselineResult, 'd1QueryCount'), resultMetric(headResult, 'd1QueryCount'))
    const responseBytes = metricDelta(resultMetric(baselineResult, 'responseBytes'), resultMetric(headResult, 'responseBytes'))
    if (deterministicRegression(requestCount)) {
      failures.push(`${name} request count regression (p95/max): baseline ${requestCount.p95.baseline}/${requestCount.max.baseline} -> head ${requestCount.p95.head}/${requestCount.max.head}`)
    }
    if (deterministicRegression(d1QueryCount)) {
      failures.push(`${name} D1 query count regression (p95/max): baseline ${d1QueryCount.p95.baseline}/${d1QueryCount.max.baseline} -> head ${d1QueryCount.p95.head}/${d1QueryCount.max.head}`)
    }
    if (deterministicRegression(responseBytes)) {
      failures.push(`${name} response bytes regression (p95/max): baseline ${responseBytes.p95.baseline}/${responseBytes.max.baseline} -> head ${responseBytes.p95.head}/${responseBytes.max.head}`)
    }

    const wallClock = {}
    for (const metric of WALL_CLOCK_METRICS) {
      const delta = metricDelta(resultMetric(baselineResult, metric), resultMetric(headResult, metric))
      wallClock[metric] = { ...delta, regression: wallClockRegression(delta) }
      if (wallClock[metric].regression) {
        const exceeded = ['median', 'p95']
          .filter(statistic => {
            const value = delta[statistic]
            return Number.isFinite(value?.delta) && Number.isFinite(value?.percent) && value.delta > 50 && value.percent > 15
          })
          .join(', ')
        failures.push(`${name} wall-clock regression (${metric}, ${exceeded}): median ${delta.median.baseline} -> ${delta.median.head} ms; p95 ${delta.p95.baseline} -> ${delta.p95.head} ms`)
      }
    }

    scenarios.push({
      name,
      template: baselineResult.template ?? null,
      requestCount,
      d1QueryCount,
      responseBytes,
      wallClock,
      errors: {
        baseline: baselineResult.errors ?? null,
        head: headResult.errors ?? null,
      },
    })
  }

  const baselineErrors = reportErrors(baseline)
  const headErrors = reportErrors(head)
  if (baselineErrors !== null && baselineErrors > 0) failures.push(`baseline report has ${baselineErrors} errors`)
  if (headErrors !== null && headErrors > 0) failures.push(`head report has ${headErrors} errors`)

  return {
    ok: failures.length === 0,
    failures,
    warnings: [],
    baseline: baseline ? {
      runLabel: baseline.runLabel,
      sourceSha: baseline.sourceSha,
      workerVersionId: baseline.workerVersionId,
      workerName: baseline.workerName,
      environment: baseline.environment,
      cacheState: baseline.cacheState,
      sampleCount: baseline.sampleCount,
      warmupCount: baseline.warmupCount,
      warmupSamplesDiscarded: baseline.warmupSamplesDiscarded,
    } : null,
    head: head ? {
      runLabel: head.runLabel,
      sourceSha: head.sourceSha,
      workerVersionId: head.workerVersionId,
      workerName: head.workerName,
      environment: head.environment,
      cacheState: head.cacheState,
      sampleCount: head.sampleCount,
      warmupCount: head.warmupCount,
      warmupSamplesDiscarded: head.warmupSamplesDiscarded,
    } : null,
    scenarios,
  }
}

function markdownValue(value) {
  if (value === null || value === undefined) return 'n/a'
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2)
  return String(value)
}

export function renderPerformanceComparisonMarkdown(comparison) {
  const lines = [
    '# Comparative performance benchmark',
    '',
    `- Status: **${comparison.ok ? 'pass' : 'fail'}**`,
    `- Baseline source SHA: \`${comparison.baseline?.sourceSha ?? 'n/a'}\``,
    `- Baseline Worker version: \`${comparison.baseline?.workerVersionId ?? 'n/a'}\``,
    `- Head source SHA: \`${comparison.head?.sourceSha ?? 'n/a'}\``,
    `- Head Worker version: \`${comparison.head?.workerVersionId ?? 'n/a'}\``,
    `- Samples per scenario: ${comparison.baseline?.sampleCount ?? 'n/a'}`,
    `- Warm-ups per scenario: ${comparison.baseline?.warmupCount ?? 'n/a'} (${comparison.baseline?.warmupSamplesDiscarded ?? 'n/a'} discarded)`,
    `- Cache state: ${comparison.baseline?.cacheState ?? 'n/a'}`,
    '',
    '| Scenario | Requests median Δ | Requests p95 Δ | D1 queries median Δ | D1 queries p95 Δ | Response bytes median Δ | Response bytes p95 Δ | Response bytes max Δ | Total median Δ | Total p95 Δ |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ]
  for (const scenario of comparison.scenarios ?? []) {
    lines.push(`| ${scenario.name} | ${markdownValue(scenario.requestCount.median.delta)} | ${markdownValue(scenario.requestCount.p95.delta)} | ${markdownValue(scenario.d1QueryCount.median.delta)} | ${markdownValue(scenario.d1QueryCount.p95.delta)} | ${markdownValue(scenario.responseBytes.median.delta)} | ${markdownValue(scenario.responseBytes.p95.delta)} | ${markdownValue(scenario.responseBytes.max.delta)} | ${markdownValue(scenario.wallClock.totalMs.median.delta)} | ${markdownValue(scenario.wallClock.totalMs.p95.delta)} |`)
  }
  lines.push('', '## Gate failures', '')
  if (comparison.failures?.length) {
    lines.push(...comparison.failures.map(failure => `- ❌ ${failure}`))
  } else {
    lines.push('- None')
  }
  lines.push('', 'Wall-clock regressions fail only when both the absolute delta exceeds 50 ms and the relative delta exceeds 15%.')
  return `${lines.join('\n')}\n`
}
