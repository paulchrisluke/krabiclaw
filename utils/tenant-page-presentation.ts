// Which component a template draws a block with.
//
// A page is an ordered list of typed blocks. The block says what the content
// *is* — a hero, a feature grid, a question set — and the template says how it
// looks. Saya's hero, Blawby's hero and KrabiClaw's hero are three renderings
// of one block, and nothing in the document chooses between them: the site's
// template does, because that is what a template is for.
//
// So the key is the template and the block type, and nothing else. There is no
// third axis and no field in `data` naming a presentation. Content that carries
// rendering instructions is content deciding how the theme looks, which is the
// coupling this replaces: `data.section` held values like `comparison-against`
// and `proof-card` — component names, written into the document, because the
// components were built first and the data was shaped to fit them.
//
// Absence of an entry means the renderer's own markup, which is Saya's.

import type { TenantPageBlockType } from '~/utils/tenant-page-blocks'
import type { PublicTemplateSlug } from '~/utils/template-registry'

const PRESENTATIONS: Readonly<Record<string, string>> = {
  // Populated per template as each template's components are folded in.
}

/** The component this template draws this block with, or null for the default. */
export function tenantPageBlockPresentation(
  template: PublicTemplateSlug,
  type: TenantPageBlockType,
): string | null {
  return PRESENTATIONS[`${template}:${type}`] ?? null
}
