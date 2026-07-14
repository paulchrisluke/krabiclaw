import type { SocialTemplate } from '~/utils/social-metadata'
import type { SatoriNode } from '../satori-node.ts'
import type { RenderInputs } from './shared.ts'
import { renderPlatformCard } from './platform.ts'
import { renderSayaCard } from './saya.ts'
import { renderBlawbyCard } from './blawby.ts'

export type OgImageRenderer = (_payload: RenderInputs) => SatoriNode

/**
 * Template registry for OG image rendering — mirrors the spirit of
 * docs/adr/0010-template-registry-for-tenant-public-rendering.md: the render pipeline
 * dispatches on `template`, never on scattered per-page checks. Unknown/legacy template
 * values fall back to the platform renderer rather than throwing.
 */
export const ogImageRenderers: Record<SocialTemplate, OgImageRenderer> = {
  platform: renderPlatformCard,
  saya: renderSayaCard,
  blawby: renderBlawbyCard,
}

export function resolveOgImageRenderer(template: string): OgImageRenderer {
  return ogImageRenderers[template as SocialTemplate] || ogImageRenderers.platform
}
