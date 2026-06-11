#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  renderCompiledPotteryHouseCoreSeedBlock,
  renderCompiledPotteryHouseMediaBlock,
  renderCompiledPotteryHouseExperiencesBlock,
  renderCompiledPotteryHouseReviewsBlock,
  renderCompiledPotteryHouseQaBlock,
  renderCompiledPotteryHousePostsBlock,
  renderCompiledPotteryHouseContentBlock,
} from '../seed-definitions/pottery-house.ts'

const root = process.cwd()
const seedPath = resolve(root, 'seeds/pottery-house-krabi.sql')
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
result = replaceBlock(result, '-- BEGIN GENERATED: pottery_core', '-- END GENERATED: pottery_core', renderCompiledPotteryHouseCoreSeedBlock())
result = replaceBlock(result, '-- BEGIN GENERATED: pottery_media', '-- END GENERATED: pottery_media', renderCompiledPotteryHouseMediaBlock())
result = replaceBlock(result, '-- BEGIN GENERATED: pottery_experiences', '-- END GENERATED: pottery_experiences', renderCompiledPotteryHouseExperiencesBlock())
result = replaceBlock(result, '-- BEGIN GENERATED: pottery_reviews', '-- END GENERATED: pottery_reviews', renderCompiledPotteryHouseReviewsBlock())
result = replaceBlock(result, '-- BEGIN GENERATED: pottery_qa', '-- END GENERATED: pottery_qa', renderCompiledPotteryHouseQaBlock())
result = replaceBlock(result, '-- BEGIN GENERATED: pottery_posts', '-- END GENERATED: pottery_posts', renderCompiledPotteryHousePostsBlock())
result = replaceBlock(result, '-- BEGIN GENERATED: pottery_content', '-- END GENERATED: pottery_content', renderCompiledPotteryHouseContentBlock())

if (process.argv.includes('--stdout')) {
  process.stdout.write(result)
} else {
  writeFileSync(seedPath, result)
}
