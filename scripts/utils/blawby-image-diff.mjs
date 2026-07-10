import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

async function normalizedPixels(filePath, width, height) {
  const image = sharp(filePath).ensureAlpha()
  const metadata = await image.metadata()
  const sourceWidth = metadata.width || 0
  const sourceHeight = metadata.height || 0
  if (!sourceWidth || !sourceHeight) throw new Error(`Unable to read PNG dimensions: ${filePath}`)

  const { data } = await image
    .extend({
      right: Math.max(0, width - sourceWidth),
      bottom: Math.max(0, height - sourceHeight),
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .raw()
    .toBuffer({ resolveWithObject: true })

  return { data, width: sourceWidth, height: sourceHeight }
}

export async function comparePngFiles({
  referencePath,
  actualPath,
  diffPath,
  colorThreshold,
  maxDiffRatio,
}) {
  const [referenceMetadata, actualMetadata] = await Promise.all([
    sharp(referencePath).metadata(),
    sharp(actualPath).metadata(),
  ])
  const width = Math.max(referenceMetadata.width || 0, actualMetadata.width || 0)
  const height = Math.max(referenceMetadata.height || 0, actualMetadata.height || 0)
  if (!width || !height) throw new Error('Parity images must have non-zero dimensions.')

  const [reference, actual] = await Promise.all([
    normalizedPixels(referencePath, width, height),
    normalizedPixels(actualPath, width, height),
  ])
  const diff = Buffer.alloc(width * height * 4)
  let differingPixels = 0

  for (let offset = 0; offset < diff.length; offset += 4) {
    const delta = Math.max(
      Math.abs(reference.data[offset] - actual.data[offset]),
      Math.abs(reference.data[offset + 1] - actual.data[offset + 1]),
      Math.abs(reference.data[offset + 2] - actual.data[offset + 2]),
      Math.abs(reference.data[offset + 3] - actual.data[offset + 3]),
    )
    if (delta > colorThreshold) {
      differingPixels += 1
      diff[offset] = 255
      diff[offset + 1] = 0
      diff[offset + 2] = 160
      diff[offset + 3] = 255
    } else {
      const gray = Math.round(
        reference.data[offset] * 0.2126 +
        reference.data[offset + 1] * 0.7152 +
        reference.data[offset + 2] * 0.0722,
      )
      diff[offset] = gray
      diff[offset + 1] = gray
      diff[offset + 2] = gray
      diff[offset + 3] = 90
    }
  }

  await fs.mkdir(path.dirname(diffPath), { recursive: true })
  await sharp(diff, { raw: { width, height, channels: 4 } }).png().toFile(diffPath)

  const totalPixels = width * height
  const diffRatio = differingPixels / totalPixels
  const dimensionsMatch = reference.width === actual.width && reference.height === actual.height
  return {
    ok: dimensionsMatch && diffRatio <= maxDiffRatio,
    dimensions_match: dimensionsMatch,
    reference: { width: reference.width, height: reference.height },
    actual: { width: actual.width, height: actual.height },
    differing_pixels: differingPixels,
    total_pixels: totalPixels,
    diff_ratio: diffRatio,
  }
}
