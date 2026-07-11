const PIXEL_VALUE = /^(-?\d+(?:\.\d+)?)px$/

const PROPERTIES = {
  section: ['background_color', 'overflow_x', 'overflow_y', 'padding_bottom', 'padding_left', 'padding_right', 'padding_top'],
  heading: ['font_family', 'font_size', 'font_weight', 'line_height', 'text_align'],
  copy: [],
  grid: ['column_gap', 'display', 'grid_columns', 'max_width', 'row_gap'],
  card: ['background_color', 'border_radius', 'box_shadow', 'padding_bottom', 'padding_left', 'padding_right', 'padding_top'],
  media: ['border_radius', 'max_width', 'object_fit'],
}

function normalizeFont(value) {
  if (typeof value !== 'string') return value
  const lower = value.toLowerCase()
  if (lower.includes('bitter')) return 'Bitter'
  if (lower.includes('marcellus')) return 'Marcellus'
  if (lower.includes('poppins')) return 'Poppins'
  return value
}

function normalizeShadow(value) {
  return value === 'none' ? 'none' : 'present'
}

function normalizeValue(property, value) {
  if (property === 'font_family') return normalizeFont(value)
  if (property === 'box_shadow') return normalizeShadow(value)
  if (property === 'border_radius' && typeof value === 'string' && Number.parseFloat(value) >= 9999) return 'full'
  return value
}

function valuesMatch(property, reference, actual, tolerance) {
  reference = normalizeValue(property, reference)
  actual = normalizeValue(property, actual)
  if (reference === actual) return true
  if (property.endsWith('color') && typeof reference === 'string' && typeof actual === 'string') {
    if ((reference.startsWith('okl') && actual.startsWith('rgb')) || (reference.startsWith('rgb') && actual.startsWith('okl'))) return true
  }
  if (typeof reference !== 'string' || typeof actual !== 'string') return false
  const referencePixels = reference.match(PIXEL_VALUE)
  const actualPixels = actual.match(PIXEL_VALUE)
  if (!referencePixels || !actualPixels) return false
  return Math.abs(Number(referencePixels[1]) - Number(actualPixels[1])) <= tolerance
}

export function compareStyleSignatures(reference, actual, options = {}) {
  const tolerance = options.pixelTolerance ?? 1
  const differences = []
  const nodes = new Set([...Object.keys(reference || {}), ...Object.keys(actual || {})])
  for (const node of nodes) {
    const referenceNode = reference?.[node]
    const actualNode = actual?.[node]
    if (!referenceNode || !actualNode) {
      if (referenceNode !== actualNode) differences.push(`${node}:presence`)
      continue
    }
    const properties = PROPERTIES[node] || []
    for (const property of properties) {
      if (!valuesMatch(property, referenceNode[property], actualNode[property], tolerance)) {
        differences.push(`${node}.${property}`)
      }
    }
  }
  return { ok: differences.length === 0, differences }
}
