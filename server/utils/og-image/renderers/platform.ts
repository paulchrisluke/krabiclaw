import { buildOgImageCard, type RenderInputs } from './shared.ts'
import type { SatoriNode } from '../satori-node.ts'

const VARIANT = {
  defaultPrimary: '#1e1b4b',
  defaultSecondary: '#4338ca',
  accentColor: '#a5b4fc',
}

export function renderPlatformCard(payload: RenderInputs): SatoriNode {
  return buildOgImageCard(payload, VARIANT)
}
