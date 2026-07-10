import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import sharp from 'sharp'

import { comparePngFiles } from '../../scripts/utils/blawby-image-diff.mjs'

test('Blawby image comparison accepts identical images', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'blawby-parity-'))
  try {
    const referencePath = path.join(directory, 'reference.png')
    const actualPath = path.join(directory, 'actual.png')
    const diffPath = path.join(directory, 'diff.png')
    const pixels = Buffer.alloc(10 * 10 * 4, 255)
    await sharp(pixels, { raw: { width: 10, height: 10, channels: 4 } }).png().toFile(referencePath)
    await sharp(pixels, { raw: { width: 10, height: 10, channels: 4 } }).png().toFile(actualPath)

    const result = await comparePngFiles({
      referencePath,
      actualPath,
      diffPath,
      colorThreshold: 16,
      maxDiffRatio: 0.005,
    })

    assert.equal(result.ok, true)
    assert.equal(result.differing_pixels, 0)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('Blawby image comparison rejects dimensions and material pixel drift', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'blawby-parity-'))
  try {
    const referencePath = path.join(directory, 'reference.png')
    const actualPath = path.join(directory, 'actual.png')
    const diffPath = path.join(directory, 'diff.png')
    await sharp({ create: { width: 10, height: 10, channels: 4, background: '#ffffff' } }).png().toFile(referencePath)
    await sharp({ create: { width: 11, height: 10, channels: 4, background: '#000000' } }).png().toFile(actualPath)

    const result = await comparePngFiles({
      referencePath,
      actualPath,
      diffPath,
      colorThreshold: 16,
      maxDiffRatio: 0.005,
    })

    assert.equal(result.ok, false)
    assert.equal(result.dimensions_match, false)
    assert.ok(result.diff_ratio > 0.005)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
