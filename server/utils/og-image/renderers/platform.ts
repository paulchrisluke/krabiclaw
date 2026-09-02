import { buildOgImageCard, type RenderInputs } from './shared.ts'
import type { SatoriNode } from '../satori-node.ts'

const VARIANT = {
  accentColor: '#a5b4fc',
}

export function renderPlatformCard(payload: RenderInputs): SatoriNode {
  return buildOgImageCard(payload, VARIANT)
}
