// Which component draws a block, when the template draws it differently.
//
// A page is an ordered list of typed blocks and TenantPageRenderer walks that
// list. Most blocks look the same everywhere and the renderer's own markup is
// the answer; some do not. A Blawby hero is a different DOM from a Saya hero,
// not a different colour, and one platform page carries seven `feature_grid`
// treatments — a comparison, a workflow list, a proof band. That is what a
// preset names: not where a block sits (position says that) and not what it
// holds (its type says that), but which of a template's presentations draws it.
//
// This is the only declaration of that, and three surfaces read it: the
// renderer mounts what it names, the editor offers exactly these presets, and
// the MCP block description generates from the same list. So a preset the
// renderer cannot draw is a preset nobody can author — which is the defect this
// replaces. Before this, the key was `data.section`: a dispatch key for two
// hand-written renderers, in no registry field, with no control anywhere, so a
// block created in the CMS rendered nothing at all on a Blawby or platform site.
//
// Absence of an entry means the renderer's own markup. Saya has no entries.

import type { TenantPageBlockType } from '~/utils/tenant-page-blocks'
import type { PublicTemplateSlug } from '~/utils/template-registry'

/** The component that draws `type` with `preset` on `template`. */
type PresentationMap = Readonly<Record<string, string>>

const PRESENTATIONS: PresentationMap = {
  // Populated per template as each canonical page renderer is folded in.
}

function presentationKey(template: PublicTemplateSlug, type: TenantPageBlockType, preset: string): string {
  return `${template}:${type}:${preset}`
}

/**
 * The component name for a block, or null when the renderer draws it itself.
 *
 * A block with no preset asks for the template's default presentation of its
 * type, which is the empty preset — so a template may claim a type outright
 * without every block having to name a preset.
 */
export function tenantPageBlockPresentation(
  template: PublicTemplateSlug,
  type: TenantPageBlockType,
  preset: string | null | undefined,
): string | null {
  const named = typeof preset === 'string' ? preset.trim() : ''
  return PRESENTATIONS[presentationKey(template, type, named)] ?? null
}

/** The presets this template can draw for this type, for the editor's control. */
export function tenantPageBlockPresets(
  template: PublicTemplateSlug,
  type: TenantPageBlockType,
): string[] {
  const prefix = `${template}:${type}:`
  return Object.keys(PRESENTATIONS)
    .filter(key => key.startsWith(prefix))
    .map(key => key.slice(prefix.length))
    .filter(Boolean)
    .sort()
}
