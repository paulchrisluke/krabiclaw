#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const lanes = JSON.parse(readFileSync(resolve(import.meta.dirname, '../config/e2e-lanes.json'), 'utf8'))
const matrix = {
  include: lanes.map((lane, index) => ({
    lane: lane.name,
    shard: index + 1,
    total: lanes.length,
    hostname: lane.hostname,
    url: `https://${lane.hostname}`,
  })),
}
const value = JSON.stringify(matrix)

const outputPath = process.argv[process.argv.indexOf('--github-output') + 1]
if (process.argv.includes('--github-output')) {
  if (!outputPath || outputPath.startsWith('--')) throw new Error('--github-output requires a path')
  const { appendFileSync } = await import('node:fs')
  appendFileSync(outputPath, `matrix=${value}\n`)
}
console.log(value)
