import { buildOgImageCard, type RenderInputs } from './shared.ts'
import type { SatoriNode } from '../satori-node.ts'

const VARIANT = {
  defaultPrimary: '#451a03',
  defaultSecondary: '#9a3412',
  accentColor: '#fdba74',
}

export function renderSayaCard(payload: RenderInputs): SatoriNode {
  return buildOgImageCard(payload, VARIANT)
}
