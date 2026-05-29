#!/usr/bin/env node
/**
 * Bootstrap benchmark runner
 *
 * Usage:
 *   node scripts/benchmark-bootstrap.mjs
 *   BASE_URL=http://demo.localhost:3000 LOCATION=brooklyn RUNS=5 node scripts/benchmark-bootstrap.mjs
 *
 * Requires: yarn dev running in another terminal
 */

import autocannon from '../node_modules/autocannon/autocannon.js'
import { createWriteStream, mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const config = {
  baseUrl: process.env.BASE_URL || 'http://demo.localhost:3000',
  locationSlug: process.env.LOCATION || 'brooklyn',
  experienceSlug: process.env.EXPERIENCE || null,
  runs: parseInt(process.env.RUNS || '5', 10),
  warmupRuns: parseInt(process.env.WARMUP || '1', 10),
  connections: parseInt(process.env.CONNECTIONS || '10', 10),
  durationSeconds: parseInt(process.env.DURATION || '10', 10),
  timeoutSeconds: parseInt(process.env.TIMEOUT || '15', 10),
  outputDir: process.env.OUTPUT_DIR || 'test-results/bootstrap-benchmarks',
}

const routes = [
  { name: 'home', path: '/' },
  { name: 'about', path: '/about' },
  { name: 'contact', path: '/contact' },
  { name: 'locations-index', path: '/locations' },
  { name: 'locations-detail', path: `/locations/${config.locationSlug}` },
  { name: 'locations-reviews', path: `/locations/${config.locationSlug}/reviews` },
  { name: 'locations-photos', path: `/locations/${config.locationSlug}/photos` },
  { name: 'locations-qa', path: `/locations/${config.locationSlug}/qa` },
  { name: 'posts', path: '/posts' },
  { name: 'reviews', path: '/reviews' },
  { name: 'qa', path: '/qa' },
  { name: 'experiences-index', path: '/experiences' },
  ...(config.experienceSlug
    ? [{ name: 'experiences-detail', path: `/experiences/${config.experienceSlug}` }]
    : []),
  { name: 'reservations', path: '/reservations' },
]

async function checkStatus(url) {
  try {
    const res = await fetch(url, { redirect: 'follow' })
    const body = await res.arrayBuffer()
    return { status: res.status, bytes: body.byteLength }
  } catch {
    return { status: 0, bytes: 0 }
  }
}

function runAutocannon(url) {
  return new Promise((resolve, reject) => {
    autocannon(
      {
        url,
        connections: config.connections,
        duration: config.durationSeconds,
        timeout: config.timeoutSeconds,
        // Don't follow redirects — measure what the server returns
      },
      (err, result) => {
        if (err) reject(err)
        else resolve(result)
      },
    )
  })
}

function median(arr) {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function mean(arr) {
  if (!arr.length) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

async function benchmarkRoute(route) {
  const url = `${config.baseUrl}${route.path}`
  process.stdout.write(`\n  ${route.name.padEnd(25)} `)

  // Preflight: get real HTTP status and response size
  const { status: statusCode, bytes: responseBytes } = await checkStatus(url)

  // Warmup runs (results discarded)
  for (let i = 0; i < config.warmupRuns; i++) {
    await runAutocannon(url)
    process.stdout.write('w')
  }

  const samples = []
  for (let i = 0; i < config.runs; i++) {
    const result = await runAutocannon(url)
    samples.push(result)
    process.stdout.write('.')
  }

  // Aggregate across samples
  const p50s = samples.map((s) => s.latency.p50)
  const p95s = samples.map((s) => s.latency.p97_5) // autocannon calls this p97_5
  const p99s = samples.map((s) => s.latency.p99)
  const reqPerSecs = samples.map((s) => s.requests.average)
  const bytesPerSecs = samples.map((s) => s.throughput.average)
  const totalErrors = samples.reduce((sum, s) => sum + (s.errors || 0), 0)
  const totalTimeouts = samples.reduce((sum, s) => sum + (s.timeouts || 0), 0)
  const totalAttempts = samples.reduce((sum, s) => sum + s.requests.total, 0)
  const errorRate = totalAttempts > 0 ? totalErrors / totalAttempts : 0

  // Status code distribution — sum across all samples
  const statusCodeDistribution = { '1xx': 0, '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }
  for (const s of samples) {
    statusCodeDistribution['1xx'] += s['1xx'] || 0
    statusCodeDistribution['2xx'] += s['2xx'] || 0
    statusCodeDistribution['3xx'] += s['3xx'] || 0
    statusCodeDistribution['4xx'] += s['4xx'] || 0
    statusCodeDistribution['5xx'] += s['5xx'] || 0
  }

  const p50Ms = median(p50s)
  const p95Ms = mean(p95s)
  const p99Ms = mean(p99s)

  process.stdout.write(
    ` status=${statusCode} p50=${Math.round(p50Ms)}ms p95=${Math.round(p95Ms)}ms ${Math.round(responseBytes / 1024)}KB`,
  )

  return {
    name: route.name,
    path: route.path,
    url,
    statusCode,
    responseBytes,
    singleRequestMs: samples[0]?.latency.min ?? 0,
    p50Ms,
    p95Ms,
    p99Ms,
    requestsPerSec: mean(reqPerSecs),
    bytesPerSec: mean(bytesPerSecs),
    errors: totalErrors,
    timeouts: totalTimeouts,
    attempts: totalAttempts,
    errorRate,
    statusCodeDistribution,
    samples: samples.map((s) => ({
      latency: s.latency,
      requests: s.requests,
      throughput: s.throughput,
      errors: s.errors || 0,
      timeouts: s.timeouts || 0,
    })),
  }
}

async function run() {
  const startedAt = new Date().toISOString()
  console.log(`Bootstrap Benchmark`)
  console.log(`  Base URL:  ${config.baseUrl}`)
  console.log(`  Location:  ${config.locationSlug}`)
  console.log(`  Runs:      ${config.runs} (+${config.warmupRuns} warmup)`)
  console.log(`  Conns:     ${config.connections}`)
  console.log(`  Duration:  ${config.durationSeconds}s per run`)
  console.log(`\nRoutes (${routes.length}):`)

  const results = []
  for (const route of routes) {
    const result = await benchmarkRoute(route)
    results.push(result)
  }

  const completedAt = new Date().toISOString()

  // Compute aggregate stats
  const successfulResults = results.filter((r) => r.statusCode === 200)
  const p95Values = results.map((r) => r.p95Ms)
  const byteValues = results.map((r) => r.responseBytes)
  const aggregate = {
    medianP95Ms: median(p95Values),
    medianResponseBytes: median(byteValues),
    maxP95Ms: Math.max(...p95Values),
    totalErrors: results.reduce((sum, r) => sum + r.errors, 0),
  }

  const output = {
    startedAt,
    completedAt,
    config: {
      baseUrl: config.baseUrl,
      locationSlug: config.locationSlug,
      experienceSlug: config.experienceSlug,
      runs: config.runs,
      warmupRuns: config.warmupRuns,
      connections: config.connections,
      durationSeconds: config.durationSeconds,
      timeoutSeconds: config.timeoutSeconds,
      outputDir: config.outputDir,
    },
    routesBenchmarked: results.length,
    aggregate,
    results,
  }

  // Markdown report
  const md = [
    `# Bootstrap Benchmark`,
    ``,
    `- Started: ${startedAt}`,
    `- Completed: ${completedAt}`,
    `- Base URL: ${config.baseUrl}`,
    `- Location slug: ${config.locationSlug}`,
    `- Runs per case: ${config.runs}`,
    `- Warmup runs: ${config.warmupRuns}`,
    `- Connections: ${config.connections}`,
    `- Duration (seconds): ${config.durationSeconds}`,
    ``,
    `## Aggregate`,
    ``,
    `- Median p95: ${aggregate.medianP95Ms.toFixed(2)}ms`,
    `- Median response bytes: ${Math.round(aggregate.medianResponseBytes)}`,
    `- Max p95: ${aggregate.maxP95Ms.toFixed(2)}ms`,
    `- Total errors/timeouts: ${aggregate.totalErrors}`,
    ``,
    `## Per Route`,
    ``,
    `| Route | Status | Response Bytes | p50 | p95 | p99 | Req/s | Bytes/s | Error Rate |`,
    `|---|---:|---:|---:|---:|---:|---:|---:|---:|`,
    ...results.map(
      (r) =>
        `| ${r.name} | ${r.statusCode} | ${r.responseBytes} | ${r.p50Ms.toFixed(2)}ms | ${r.p95Ms.toFixed(2)}ms | ${r.p99Ms.toFixed(2)}ms | ${r.requestsPerSec.toFixed(2)} | ${Math.round(r.bytesPerSec)} | ${(r.errorRate * 100).toFixed(2)}% |`,
    ),
    ``,
  ].join('\n')

  // Write output
  mkdirSync(config.outputDir, { recursive: true })
  const slug = startedAt.replace(/[:.]/g, '-').replace('T', 'T').slice(0, 24) + 'Z'
  const jsonPath = join(config.outputDir, `benchmark-${slug}.json`)
  const mdPath = join(config.outputDir, `benchmark-${slug}.md`)
  await writeFile(jsonPath, JSON.stringify(output, null, 2))
  await writeFile(mdPath, md)

  console.log(`\n\n## Results`)
  console.log(md.split('\n').slice(12).join('\n'))
  console.log(`\nWritten to:\n  ${jsonPath}\n  ${mdPath}`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
