#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderDemoExperienceSeedBlock } from '../seed-definitions/demo.ts'

const root = process.cwd()
const seedPath = resolve(root, 'seeds/demo.sql')
const current = readFileSync(seedPath, 'utf8')

const startMarker = '-- BEGIN GENERATED: demo_experiences'
const endMarker = '-- END GENERATED: demo_experiences'
const start = current.indexOf(startMarker)
const end = current.indexOf(endMarker)

if (start === -1 || end === -1 || end < start) {
  throw new Error('Could not find demo experience seed markers in seeds/demo.sql')
}

const replacement = renderDemoExperienceSeedBlock()
const next = `${current.slice(0, start)}${replacement}${current.slice(end + endMarker.length)}`

if (process.argv.includes('--stdout')) {
  process.stdout.write(next)
} else {
  writeFileSync(seedPath, next)
}
