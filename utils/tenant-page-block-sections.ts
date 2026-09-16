import { TENANT_PAGE_BLOCK_REGISTRY, type TenantPageBlock, type TenantPageBlockType } from '~/utils/tenant-page-blocks'

/**
 * Where a block's controls live in the editor chain.
 *
 * Derived from the block's declared fields, so this restates nothing. It was a
 * second hand-written table beside the registry, which is how a block could
 * grow a field that no screen ever showed.
 *
 * It exists because `DESIGN.md` measures a leaf by its controls: a block with
 * one concern is a leaf, and a block with several is a hub whose concerns each
 * sit one level deeper. Which of the two a block is, is a fact about that block
 * type, so it is written down once rather than re-derived by each screen.
 */
export type TenantPageBlockSectionKind = 'leaf' | 'list'

/** The nested arrays a block stores its own records in. */
export type TenantPageBlockCollection = 'items' | 'buttons' | 'steps' | 'tiers'

export interface TenantPageBlockSection {
  /** The route segment, and the key the editors switch on. */
  key: string
  label: string
  kind: TenantPageBlockSectionKind
  /** Which array a `list` section browses. */
  collection?: TenantPageBlockCollection
  /**
   * Restricts the section to blocks whose stored `source` is one of these. A
   * feature grid drawing its rows from published posts has no manual items to
   * browse, and a calculator has no items at all.
   */
  sources?: readonly string[]
}

const SECTION_LABELS: Record<string, string> = {
  content: 'Content', copy: 'Copy', button: 'Button', buttons: 'Buttons',
  settings: 'Settings', items: 'Items', steps: 'Steps', tiers: 'Amounts',
  destination: 'Destination', calculator: 'Calculator', image: 'Image',
  icon: 'Icon', link: 'Link',
}

const COLLECTIONS = new Set<TenantPageBlockCollection>(['items', 'buttons', 'steps', 'tiers'])

/**
 * A block's sections are the distinct `section` values its fields declare, in
 * declaration order. They used to be a second hand-written table beside the
 * registry, which is how a block could grow a field the editor never showed.
 */
function blockSections(type: TenantPageBlockType): readonly TenantPageBlockSection[] {
  const fields = TENANT_PAGE_BLOCK_REGISTRY[type]?.fields ?? {}
  const sections: TenantPageBlockSection[] = []
  for (const [key, field] of Object.entries(fields)) {
    const sectionKey = field.section ?? 'content'
    const existing = sections.find(section => section.key === sectionKey)
    const isList = field.kind === 'list' && COLLECTIONS.has(key as TenantPageBlockCollection)
    if (existing) {
      // A section browses a collection when any field in it is one.
      if (isList && !existing.collection) {
        existing.kind = 'list'
        existing.collection = key as TenantPageBlockCollection
        existing.label = SECTION_LABELS[key] ?? field.label
      }
      continue
    }
    sections.push({
      key: isList ? key : sectionKey,
      label: SECTION_LABELS[isList ? key : sectionKey] ?? field.label,
      kind: isList ? 'list' : 'leaf',
      ...(isList ? { collection: key as TenantPageBlockCollection } : {}),
      ...(field.availableWhen?.field === 'source' ? { sources: field.availableWhen.equals } : {}),
    })
  }
  return sections
}

const BLOCK_SECTIONS: Record<TenantPageBlockType, readonly TenantPageBlockSection[]> = Object.fromEntries(
  (Object.keys(TENANT_PAGE_BLOCK_REGISTRY) as TenantPageBlockType[]).map(type => [type, blockSections(type)]),
) as Record<TenantPageBlockType, readonly TenantPageBlockSection[]>

/** An unset `source` means the block authors its own rows. */
export function tenantPageBlockSource(block: TenantPageBlock): string {
  const value = block.data.source
  return typeof value === 'string' && value.trim() ? value : 'manual'
}

/** The sections this block actually has, given what it currently stores. */
export function tenantPageBlockSections(block: TenantPageBlock): readonly TenantPageBlockSection[] {
  const sections = BLOCK_SECTIONS[block.type] ?? []
  const source = tenantPageBlockSource(block)
  return sections.filter(section => !section.sources || section.sources.includes(source))
}

/**
 * A block with two or more sections routes onward; one section renders in place
 * at the block's own level, because a lone row that opens the only thing below
 * it is a level that says nothing.
 */
export function tenantPageBlockIsHub(block: TenantPageBlock): boolean {
  return tenantPageBlockSections(block).length > 1
}

export function tenantPageBlockLabel(type: string): string {
  return TENANT_PAGE_BLOCK_REGISTRY[type as TenantPageBlockType]?.label ?? type
}

/** How one record of a nested collection is named in its list and its heading. */
export const TENANT_PAGE_RECORD_NOUNS: Record<TenantPageBlockCollection, { one: string; add: string }> = {
  items: { one: 'Item', add: 'Add an item' },
  buttons: { one: 'Button', add: 'Add a button' },
  steps: { one: 'Step', add: 'Add a step' },
  tiers: { one: 'Tier', add: 'Add a tier' },
}

/** One concern of a record inside a nested collection. */
export interface TenantPageRecordSection {
  key: string
  label: string
}

const GRID_ITEM_SECTIONS: readonly TenantPageRecordSection[] = [
  { key: 'copy', label: 'Copy' },
  { key: 'image', label: 'Image' },
  { key: 'link', label: 'Link' },
]

const FEATURE_ITEM_SECTIONS: readonly TenantPageRecordSection[] = [
  { key: 'copy', label: 'Copy' },
  { key: 'icon', label: 'Icon' },
  { key: 'image', label: 'Image' },
  { key: 'link', label: 'Link' },
]

const PERSON_SECTIONS: readonly TenantPageRecordSection[] = [
  { key: 'name', label: 'Name' },
  { key: 'role', label: 'Role' },
  { key: 'bio', label: 'Bio' },
  { key: 'photo', label: 'Photo' },
]

/**
 * A record with one concern is a leaf and has no sections of its own — a button
 * is a label and where it goes, and asking for those on two screens would be a
 * level that carries nothing. A grid item or a person has several, so it is a
 * hub like anything else that does.
 */
export function tenantPageRecordSections(
  blockType: TenantPageBlockType,
  collection: TenantPageBlockCollection,
): readonly TenantPageRecordSection[] {
  if (collection !== 'items') return []
  if (blockType === 'team_grid') return PERSON_SECTIONS
  if (blockType === 'feature_grid') return FEATURE_ITEM_SECTIONS
  return GRID_ITEM_SECTIONS
}

function text(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

/** Names one record in its list, its heading and its control labels. */
export function tenantPageRecordTitle(
  record: Record<string, unknown>,
  blockType: TenantPageBlockType,
  collection: TenantPageBlockCollection,
  index: number,
): string {
  const fallback = `${TENANT_PAGE_RECORD_NOUNS[collection].one} ${index + 1}`
  if (collection === 'buttons') return text(record.label) || fallback
  if (collection === 'steps') return text(record.name) || fallback
  if (collection === 'tiers') return text(record.title) || text(record.amount) || fallback
  if (blockType === 'team_grid') {
    return [text(record.first_name), text(record.last_name)].filter(Boolean).join(' ') || fallback
  }
  return text(record.title) || text(record.name) || fallback
}
