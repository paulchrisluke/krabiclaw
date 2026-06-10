#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  renderCompiledDemoCoreSeedBlock,
  renderDemoExperienceSeedBlock,
} from '../seed-definitions/demo.ts'

const root = process.cwd()
const seedPath = resolve(root, 'seeds/demo.sql')
const current = readFileSync(seedPath, 'utf8')

function replaceBlock(source: string, startMarker: string, endMarker: string, replacement: string) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker)

  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Could not find generated seed markers: ${startMarker} ... ${endMarker}`)
  }

  return `${source.slice(0, start)}${replacement}${source.slice(end + endMarker.length)}`
}

const withCore = replaceBlock(
  current,
  '-- BEGIN GENERATED: demo_core',
  '-- END GENERATED: demo_core',
  renderCompiledDemoCoreSeedBlock(),
)

const next = replaceBlock(
  withCore,
  '-- BEGIN GENERATED: demo_experiences',
  '-- END GENERATED: demo_experiences',
  renderDemoExperienceSeedBlock(),
)

if (process.argv.includes('--stdout')) {
  process.stdout.write(next)
} else {
  writeFileSync(seedPath, next)
}
