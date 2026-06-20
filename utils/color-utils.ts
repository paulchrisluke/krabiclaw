/**
 * Color utility functions for Saya theme color configurability
 * Handles color manipulation, dark mode variants, and WCAG contrast compliance
 */

/**
 * Parse hex color to RGB values
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result || !result[1] || !result[2] || !result[3]) return null

  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  }
}

/**
 * Calculate relative luminance of a color (WCAG standard)
 */
export function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const normalized = c / 255
    return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * (rs ?? 0) + 0.7152 * (gs ?? 0) + 0.0722 * (bs ?? 0)
}

/**
 * Calculate contrast ratio between two colors (WCAG standard)
 */
export function getContrastRatio(color1: string, color2: string): number {
  const rgb1 = hexToRgb(color1)
  const rgb2 = hexToRgb(color2)
  if (!rgb1 || !rgb2) return 0

  const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b)
  const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b)
  const lighter = Math.max(lum1, lum2)
  const darker = Math.min(lum1, lum2)

  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Determine appropriate foreground color (white or black) based on contrast
 * Returns the color that provides WCAG AA compliant contrast (≥4.5:1)
 */
export function getOptimalForeground(backgroundColor: string): '#ffffff' | '#000000' {
  const whiteContrast = getContrastRatio(backgroundColor, '#ffffff')
  const blackContrast = getContrastRatio(backgroundColor, '#000000')
  
  // Prefer white if both meet AA, otherwise use whichever meets AA
  if (whiteContrast >= 4.5) return '#ffffff'
  if (blackContrast >= 4.5) return '#000000'
  
  // If neither meets AA, use the one with higher contrast
  return whiteContrast >= blackContrast ? '#ffffff' : '#000000'
}

/**
 * Lighten a hex color by a percentage
 */
export function lightenColor(hex: string, percent: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex

  const factor = 1 + percent / 100
  const r = Math.min(255, Math.round(rgb.r * factor))
  const g = Math.min(255, Math.round(rgb.g * factor))
  const b = Math.min(255, Math.round(rgb.b * factor))

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/**
 * Darken a hex color by a percentage
 */
export function darkenColor(hex: string, percent: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex

  const factor = 1 - percent / 100
  const r = Math.round(rgb.r * factor)
  const g = Math.round(rgb.g * factor)
  const b = Math.round(rgb.b * factor)

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/**
 * Calculate dark mode variant of a color
 * Lightens the color for dark mode to maintain visual hierarchy
 */
export function getDarkModeVariant(hex: string): string {
  return lightenColor(hex, 30)
}

/**
 * Validate hex color format
 */
export function isValidHex(hex: string): boolean {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(hex)
}

/**
 * Normalize hex color to 6-digit format
 */
export function normalizeHex(hex: string): string {
  if (!isValidHex(hex)) return '#8F1D21' // default fallback
  
  // Convert 3-digit to 6-digit
  if (hex.length === 4) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
  }
  
  return hex
}

/**
 * Calculate theme colors from brand color
 * Returns CSS variable values for light and dark modes
 */
export function calculateThemeColors(brandColor: string) {
  const normalizedColor = normalizeHex(brandColor)
  const darkModeColor = getDarkModeVariant(normalizedColor)
  const foregroundLight = getOptimalForeground(normalizedColor)
  const foregroundDark = getOptimalForeground(darkModeColor)

  return {
    brandColor: normalizedColor,
    brandColorDark: darkModeColor,
    brandColorForeground: foregroundLight,
    brandColorForegroundDark: foregroundDark
  }
}

/**
 * Natural language color interpretation
 * Maps descriptive color terms to appropriate hex codes
 */
const COLOR_MAPPINGS: Record<string, string> = {
  // Earthy tones
  'earthy': '#78350F',
  'terracotta': '#C27803',
  'clay': '#B45309',
  'brown': '#78350F',
  'tan': '#D4A574',
  'beige': '#F5F5DC',
  'sand': '#E8D4B8',
  'warm brown': '#8B4513',
  'rust': '#B7410E',
  'copper': '#B87333',
  'bronze': '#CD7F32',
  
  // Blue tones
  'ocean blue': '#1E40AF',
  'sky blue': '#0EA5E9',
  'navy': '#1E3A8A',
  'teal': '#0D9488',
  'cyan': '#06B6D4',
  'azure': '#0284C7',
  'cobalt': '#0047AB',
  
  // Green tones
  'forest green': '#166534',
  'sage': '#4A7C59',
  'olive': '#556B2F',
  'emerald': '#10B981',
  'mint': '#34D399',
  'lime': '#84CC16',
  
  // Red tones
  'red': '#DC2626',
  'crimson': '#DC143C',
  'burgundy': '#800020',
  'maroon': '#800000',
  'rose': '#E11D48',
  'coral': '#FF6B6B',
  
  // Purple tones
  'purple': '#7C3AED',
  'lavender': '#A78BFA',
  'violet': '#8B5CF6',
  'plum': '#9333EA',
  'indigo': '#4F46E5',
  
  // Orange tones
  'orange': '#F97316',
  'amber': '#F59E0B',
  'gold': '#EAB308',
  'peach': '#FB923C',
  'apricot': '#FB923C',
  
  // Yellow tones
  'yellow': '#EAB308',
  'mustard': '#CA8A04',
  
  // Pink tones
  'pink': '#EC4899',
  'magenta': '#D946EF',
  'fuchsia': '#E879F9',
  'blush': '#FDA4AF',
  
  // Gray tones
  'gray': '#6B7280',
  'charcoal': '#374151',
  'slate': '#475569',
  'silver': '#9CA3AF',
  
  // Neutral
  'black': '#000000',
  'white': '#FFFFFF',
  'cream': '#FEF3C7',
  'ivory': '#FFFFF0',
}

/**
 * Interpret natural language color description and return hex code
 * Supports compound descriptions like "warm terracotta", "deep ocean blue"
 */
export function interpretColorDescription(description: string): string {
  const lowerDesc = description.toLowerCase().trim()
  
  // Check for exact matches first
  if (COLOR_MAPPINGS[lowerDesc]) {
    return COLOR_MAPPINGS[lowerDesc]
  }
  
  // Check for compound descriptions (e.g., "warm terracotta")
  const words = lowerDesc.split(/\s+/)
  for (const word of words) {
    if (COLOR_MAPPINGS[word]) {
      return COLOR_MAPPINGS[word]
    }
  }
  
  // Check for partial matches
  for (const [key, value] of Object.entries(COLOR_MAPPINGS)) {
    if (lowerDesc.includes(key) || key.includes(lowerDesc)) {
      return value
    }
  }
  
  // Default to a neutral color if no match
  return '#8F1D21'
}

/**
 * Smart color resolver - accepts hex codes or natural language
 */
export function resolveColor(input: string): string {
  // If it's already a valid hex code, return it
  if (isValidHex(input)) {
    return normalizeHex(input)
  }
  
  // Otherwise, try to interpret as natural language
  return interpretColorDescription(input)
}
