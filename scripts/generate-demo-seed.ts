#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  renderCompiledDemoCoreSeedBlock,
  renderCompiledDemoMediaBlock,
  renderCompiledDemoReviewsBlock,
  renderCompiledDemoMenuBlock,
  renderCompiledDemoQaBlock,
  renderCompiledDemoPostsBlock,
  renderDemoExperienceSeedBlock,
  renderCompiledDemoContentBlock,
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

let result = current
result = replaceBlock(result, '-- BEGIN GENERATED: demo_core', '-- END GENERATED: demo_core', renderCompiledDemoCoreSeedBlock())
result = replaceBlock(result, '-- BEGIN GENERATED: demo_media', '-- END GENERATED: demo_media', renderCompiledDemoMediaBlock())
result = replaceBlock(result, '-- BEGIN GENERATED: demo_reviews', '-- END GENERATED: demo_reviews', renderCompiledDemoReviewsBlock())
result = replaceBlock(result, '-- BEGIN GENERATED: demo_menu', '-- END GENERATED: demo_menu', renderCompiledDemoMenuBlock())
result = replaceBlock(result, '-- BEGIN GENERATED: demo_qa', '-- END GENERATED: demo_qa', renderCompiledDemoQaBlock())
result = replaceBlock(result, '-- BEGIN GENERATED: demo_posts', '-- END GENERATED: demo_posts', renderCompiledDemoPostsBlock())
result = replaceBlock(result, '-- BEGIN GENERATED: demo_experiences', '-- END GENERATED: demo_experiences', renderDemoExperienceSeedBlock())
result = replaceBlock(result, '-- BEGIN GENERATED: demo_content', '-- END GENERATED: demo_content', renderCompiledDemoContentBlock())

if (process.argv.includes('--stdout')) {
  process.stdout.write(result)
} else {
  writeFileSync(seedPath, result)
}
