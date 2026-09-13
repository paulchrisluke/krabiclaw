import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { defineNuxtModule } from 'nuxt/kit'
import { MALI_ASSET_BASE, MALI_FONT_FILES } from '../shared/site-fonts'

// Build-time only. The deployed Worker and visitors never contact Fontsource,
// Google Fonts, or GitHub. Pin the source commit and version the public path.
const SOURCE = 'https://raw.githubusercontent.com/fontsource/font-files/aead5de04c9d2f72d893103a192f3ec6be34980d/fonts/google/mali'

export default defineNuxtModule({
  meta: { name: 'krabiclaw-mali-fonts' },
  setup(_options, nuxt) {
    const directory = resolve(nuxt.options.rootDir, 'node_modules/.cache/krabiclaw/mali-aead5de0')
    nuxt.hook('nitro:config', async (config) => {
      await mkdir(directory, { recursive: true })
      await Promise.all([
        ...MALI_FONT_FILES.map(({ filename }) => ({ filename, sourcePath: `files/${filename}` })),
        { filename: 'LICENSE.txt', sourcePath: 'LICENSE' },
      ].map(async ({ filename, sourcePath }) => {
        const path = resolve(directory, filename)
        const validate = (bytes: Uint8Array) => {
          if (filename.endsWith('.woff2')) {
            if (bytes.length < 48 || ![0x77, 0x4f, 0x46, 0x32].every((byte, index) => bytes[index] === byte)) {
              throw new Error(`Invalid Mali WOFF2 asset: ${filename}`)
            }
          } else if (!new TextDecoder().decode(bytes).includes('SIL OPEN FONT LICENSE')) {
            throw new Error('Invalid Mali font license')
          }
        }
        let cachedBytes: Uint8Array | undefined
        try {
          cachedBytes = await readFile(path)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
        if (cachedBytes) {
          try {
            validate(cachedBytes)
            return
          } catch {
            // Invalid cached assets are replaced by the download below.
          }
        }
        const response = await fetch(`${SOURCE}/${sourcePath}`, { signal: AbortSignal.timeout(30_000) })
        if (!response.ok) throw new Error(`Mali asset download failed (${response.status}): ${filename}`)
        const bytes = new Uint8Array(await response.arrayBuffer())
        validate(bytes)
        const temporaryPath = `${path}.${randomUUID()}.tmp`
        await writeFile(temporaryPath, bytes)
        await rename(temporaryPath, path)
      }))
      config.publicAssets ??= []
      config.publicAssets.push({ dir: directory, baseURL: MALI_ASSET_BASE, maxAge: 31536000 })
    })
  },
})
