import { buildOgImageCard, type RenderInputs } from './shared.ts'
import type { SatoriNode } from '../satori-node.ts'

const VARIANT = {
  defaultPrimary: '#0f172a',
  defaultSecondary: '#1e3a5f',
  accentColor: '#cbb26a',
}

export function renderBlawbyCard(payload: RenderInputs): SatoriNode {
  return buildOgImageCard(payload, VARIANT)
}
