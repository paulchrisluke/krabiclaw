export const SITE_FONT_PRESETS = ['default', 'mali'] as const
export type SiteFontPreset = typeof SITE_FONT_PRESETS[number]

export const SITE_FONT_OPTIONS: Array<{ label: string; value: SiteFontPreset }> = [
  { label: 'Default', value: 'default' },
  { label: 'Mali (Thai and English)', value: 'mali' },
]

export function isSiteFontPreset(value: unknown): value is SiteFontPreset {
  return value === 'default' || value === 'mali'
}

// An absent optional setting means the template's existing typography. Invalid
// stored values are errors, never arbitrary CSS or a substitute font choice.
export function resolveSiteFontPreset(value: unknown): SiteFontPreset {
  if (value === undefined) return 'default'
  if (!isSiteFontPreset(value)) throw new Error('Unsupported site font preset')
  return value
}

export const MALI_ASSET_BASE = '/assets/fonts/mali-aead5de0'
// One webfont, then the generic category. Which face backs the generic differs
// per platform, and so does its metrics, so the stack cannot be tuned to make a
// swap cheap -- see MALI_FONT_CSS, which removes the swap instead.
export const MALI_FONT_FAMILY = '"Mali", sans-serif'

// Same manifest drives build-time asset copying and the SSR font declarations.
// No locale gating: an English page can contain Thai names and vice versa.
const MALI_SUBSETS = {
  thai: 'U+02D7,U+0303,U+0331,U+0E01-0E5B,U+200C-200D,U+25CC',
  latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
} as const
const MALI_FACES = [
  { weight: 400, style: 'normal' },
  { weight: 500, style: 'normal' },
  { weight: 600, style: 'normal' },
  { weight: 700, style: 'normal' },
  { weight: 400, style: 'italic' },
] as const

export const MALI_FONT_FILES = MALI_FACES.flatMap(face => Object.entries(MALI_SUBSETS).map(([subset, unicodeRange]) => ({
  ...face,
  unicodeRange,
  filename: `mali-${subset}-${face.weight}-${face.style}.woff2`,
})))

// `optional`, not `swap`. Mali's line box is 1.30em (ascent 105%, descent 25%
// measured from the shipped files); a generic sans-serif's is about 1.15em on
// macOS and taller again on the Linux fallbacks, so a swap reflows every line of
// text by a different amount on every platform. Measured on the Thai home page:
// 0.0616 CLS with `Tahoma` in the stack, 0.1239 without it, 0.0052-0.0349 on
// macOS -- the number tracks the platform's fallback, not anything we control.
// `optional` gives the face a block period and then declines to swap, so no
// platform reflows. Measured with the faces served under the same throttle:
// Mali still reached `loaded` on every cold sample, with no preload -- the
// layout's one preload belongs to the hero image (useHeroLcpPreload), which is
// what decides LCP, and a webfont hint ahead of it is what that budget exists
// to prevent.
export const MALI_FONT_CSS = MALI_FONT_FILES.map(face => `@font-face{font-family:"Mali";font-style:${face.style};font-weight:${face.weight};font-display:optional;src:url("${MALI_ASSET_BASE}/${face.filename}") format("woff2");unicode-range:${face.unicodeRange};}`).join('\n')

export function siteFontStyles(preset: SiteFontPreset): Record<string, string> {
  if (preset === 'default') return {}
  if (preset !== 'mali') throw new Error('Unsupported site font preset')
  return {
    '--font-saya': MALI_FONT_FAMILY,
    '--font-sans': MALI_FONT_FAMILY,
    'font-family': MALI_FONT_FAMILY,
  }
}
