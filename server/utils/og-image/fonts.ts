import interRegularBase64 from '~/server/assets/fonts/inter-regular'
import interBoldBase64 from '~/server/assets/fonts/inter-bold'

export interface OgImageFontConfig {
  name: string
  data: ArrayBuffer
  weight: 400 | 700
  style: 'normal'
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

let cachedFonts: OgImageFontConfig[] | null = null

/**
 * Fonts bundled directly in the Nitro/Workers build (small, ~30KB each — safe to inline
 * as base64 modules the same way server/assets/og-image-part-*.ts bundles binary assets).
 * Do not add more weights/families here without checking the impact on Worker bundle size.
 */
export function getOgImageFonts(): OgImageFontConfig[] {
  if (cachedFonts) return cachedFonts
  cachedFonts = [
    { name: 'Inter', data: base64ToUint8Array(interRegularBase64).buffer as ArrayBuffer, weight: 400, style: 'normal' },
    { name: 'Inter', data: base64ToUint8Array(interBoldBase64).buffer as ArrayBuffer, weight: 700, style: 'normal' },
  ]
  return cachedFonts
}
