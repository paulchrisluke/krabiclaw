import { buildOgImageCard, type RenderInputs } from './shared.ts'
import type { SatoriNode } from '../satori-node.ts'

const VARIANT = {
  accentColor: '#cbb26a',
}

export function renderBlawbyCard(payload: RenderInputs): SatoriNode {
  return buildOgImageCard(payload, VARIANT)
}
