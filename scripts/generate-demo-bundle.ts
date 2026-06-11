#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compiledDemoSeed } from '../seed-definitions/demo.ts'
import { serializeCompiledSeedBundle } from '../seed-definitions/serialize.ts'

const root = process.cwd()
const outDir = resolve(root, 'seed-definitions/generated')
const outPath = resolve(outDir, 'demo.bundle.json')

const serialized = serializeCompiledSeedBundle(compiledDemoSeed)

mkdirSync(outDir, { recursive: true })

const output = `${JSON.stringify(serialized, null, 2)}\n`

if (process.argv.includes('--stdout')) {
  process.stdout.write(output)
} else {
  writeFileSync(outPath, output)
}
