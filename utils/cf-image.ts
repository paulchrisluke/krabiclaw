// Cloudflare Images flexible-variant URL builder. Stored media URLs
// (media_assets.public_url / thumbnail_url) always point at the `/public`
// named variant (1366x768, default quality, no format negotiation) regardless
// of where the image is actually rendered — a full-bleed hero and a 74px
// avatar both download the same oversized asset. Flexible variants let the
// render call site ask for exactly the size/quality it needs instead.
// Requires flexible_variants enabled on the Cloudflare Images account
// (accounts/{id}/images/v1/config) — confirmed enabled 2026-07-01.
export interface CfImageVariantOptions {
  width?: number
  height?: number
  quality?: number
  fit?: 'cover' | 'contain' | 'scale-down' | 'crop' | 'pad'
  format?: 'auto' | 'webp' | 'avif' | 'json'
}

export function cfImageVariant(
  url: string | null | undefined,
  opts: CfImageVariantOptions = {},
): string | null {
  if (!url) return null
  if (!url.includes('imagedelivery.net')) return url

  // fit=cover requires both width AND height (Cloudflare needs both to know
  // how to crop) — passing only one dimension with fit=cover is invalid and
  // returns a "cover fit mode needs both width and height" warning. Default
  // to scale-down (resize to fit within the given dimension, preserving
  // aspect ratio, never upscale) when only one dimension is supplied; only
  // use cover when the caller explicitly provides both.
  const hasBothDimensions = Boolean(opts.width) && Boolean(opts.height)
  const defaultFit = hasBothDimensions ? 'cover' : 'scale-down'

  const params = [
    opts.width ? `width=${opts.width}` : null,
    opts.height ? `height=${opts.height}` : null,
    `quality=${opts.quality ?? 75}`,
    `fit=${opts.fit ?? defaultFit}`,
    `format=${opts.format ?? 'auto'}`,
  ].filter(Boolean)

  return url.replace(/\/[^/]+$/, `/${params.join(',')}`)
}

// Builds a srcset across common viewport widths so a full-bleed hero doesn't
// download a desktop-sized asset on mobile (or vice versa). Pair with
// sizes="100vw" for edge-to-edge images.
export function cfImageSrcset(
  url: string | null | undefined,
  widths: number[] = [640, 1200, 1920],
  opts: Omit<CfImageVariantOptions, 'width'> = {},
): string | null {
  if (!url) return null
  if (!url.includes('imagedelivery.net')) return null

  return widths
    .map((w) => `${cfImageVariant(url, { ...opts, width: w })} ${w}w`)
    .join(', ')
}
