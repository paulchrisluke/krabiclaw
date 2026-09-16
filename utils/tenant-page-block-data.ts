// Reading a block's fields, for the components that draw them.
//
// A template's component takes the block and reads it. It used to take a dozen
// named props, which meant a dispatcher stood between the document and the
// markup converting one into the other — about 130 lines of it on the platform
// page alone, and it was that dispatcher that needed `data.section` to know
// which block to convert for which component.
//
// `data` is a free object, so every read is a narrowing, and an absent or
// wrong-typed field reads as empty rather than throwing in a render.

import type { TenantPageBlock } from '~/utils/tenant-page-blocks'

export type BlockRecord = Record<string, unknown>

export function blockText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** The value, or null — for a field a component treats as absent when empty. */
export function blockTextOrNull(value: unknown): string | null {
  return blockText(value) || null
}

export function blockRecords(value: unknown): BlockRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is BlockRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : []
}

export function blockStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    : []
}

/** A block's media placement in a slot, in the order it was arranged. */
export function blockMedia(block: TenantPageBlock, slot: string) {
  return block.media
    .filter(item => item.slot === slot)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
}
