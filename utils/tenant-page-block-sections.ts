import { TENANT_PAGE_BLOCK_REGISTRY, type TenantPageBlock, type TenantPageBlockType } from '~/utils/tenant-page-blocks'

/**
 * Where a block's controls live in the editor chain.
 *
 * This is route grouping and nothing else. `TENANT_PAGE_BLOCK_REGISTRY`,
 * `createTenantPageEditorData` and `validateTenantPageBlock` remain the content
 * contract — no field here restates a payload key's meaning, an allowed value or
 * a validation rule, and adding a section never changes what the page stores.
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

const CTA_SECTIONS: readonly TenantPageBlockSection[] = [
  { key: 'copy', label: 'Copy', kind: 'leaf' },
  { key: 'button', label: 'Button', kind: 'leaf' },
]

const BLOCK_SECTIONS: Record<TenantPageBlockType, readonly TenantPageBlockSection[]> = {
  // One concern, so the block itself is the leaf and there is no extra segment.
  heading: [{ key: 'content', label: 'Heading', kind: 'leaf' }],
  markdown: [{ key: 'content', label: 'Text', kind: 'leaf' }],
  image: [{ key: 'content', label: 'Image', kind: 'leaf' }],
  gallery: [{ key: 'content', label: 'Gallery', kind: 'leaf' }],
  faq: [{ key: 'content', label: 'Questions', kind: 'leaf' }],
  page_grid: [{ key: 'content', label: 'Pages', kind: 'leaf' }],
  product_grid: [{ key: 'content', label: 'Products', kind: 'leaf' }],
  // A divider has nothing to edit. It is still a row in Sections, where it is
  // reordered and removed like any other.
  divider: [],
  button_group: [{ key: 'buttons', label: 'Buttons', kind: 'list', collection: 'buttons' }],

  how_to: [
    { key: 'title', label: 'Title', kind: 'leaf' },
    { key: 'steps', label: 'Steps', kind: 'list', collection: 'steps' },
  ],
  cta: CTA_SECTIONS,
  contact_cta: CTA_SECTIONS,
  booking_cta: CTA_SECTIONS,
  callout: [
    { key: 'message', label: 'Message', kind: 'leaf' },
    { key: 'buttons', label: 'Buttons', kind: 'list', collection: 'buttons' },
  ],
  hero: [
    { key: 'copy', label: 'Copy', kind: 'leaf' },
    { key: 'image', label: 'Image', kind: 'leaf' },
    { key: 'button', label: 'Button', kind: 'leaf' },
  ],
  feature_grid: [
    { key: 'settings', label: 'Settings', kind: 'leaf' },
    { key: 'items', label: 'Items', kind: 'list', collection: 'items', sources: ['manual'] },
    { key: 'calculator', label: 'Calculator', kind: 'leaf', sources: ['calculator'] },
  ],
  testimonial_grid: [
    { key: 'settings', label: 'Settings', kind: 'leaf' },
    { key: 'items', label: 'Items', kind: 'list', collection: 'items', sources: ['manual'] },
  ],
  team_grid: [
    { key: 'copy', label: 'Copy', kind: 'leaf' },
    { key: 'items', label: 'People', kind: 'list', collection: 'items' },
  ],
  location_grid: [
    { key: 'settings', label: 'Settings', kind: 'leaf' },
    { key: 'locations', label: 'Locations', kind: 'leaf' },
    { key: 'items', label: 'Items', kind: 'list', collection: 'items', sources: ['manual'] },
  ],
  donation_choices: [
    { key: 'copy', label: 'Copy', kind: 'leaf' },
    { key: 'destination', label: 'Destination', kind: 'leaf' },
    { key: 'tiers', label: 'Tiers', kind: 'list', collection: 'tiers' },
  ],
}

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
