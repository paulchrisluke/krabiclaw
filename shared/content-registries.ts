export const CONTENT_DOCUMENT_KINDS = [
  'page',
  'article',
  'social_post',
  'qa',
] as const

export type ContentDocumentKind = typeof CONTENT_DOCUMENT_KINDS[number]

export const PUBLICATION_CONTENT_BLOCK_TYPES = [
  'heading',
  'markdown',
  'image',
  'gallery',
  'faq',
  'how_to',
  'divider',
  'ai_assistance',
  'cta',
  'callout',
] as const

export type PublicationContentBlockType = typeof PUBLICATION_CONTENT_BLOCK_TYPES[number]

export type LocalizedContentFieldSegment = string | '*'

/**
 * How a surface renders a text field.
 *
 * `plain` is interpolated — `{{ value }}` — so markdown syntax in it ships to the
 * reader as literal characters. `markdown` is parsed and sanitized.
 *
 * This distinction was previously written nowhere a machine could read it. The
 * MCP tool schemas described block data as `{ type: 'object' }`, or as one
 * English sentence, or said nothing at all, so an assistant had no way to know
 * that `heading.text` is not markdown. Twenty-three NCLS headings are published
 * right now reading `**1\\. Excessive Delays in Evaluations**`, asterisks and all.
 */
export type ContentTextFormat = 'plain' | 'markdown'

export interface ContentBlockTextField {
  /** Path into the block's data. `*` walks every element of an array. */
  readonly path: readonly LocalizedContentFieldSegment[]
  readonly format: ContentTextFormat
}

const plain = (...path: LocalizedContentFieldSegment[]): ContentBlockTextField => ({ path, format: 'plain' })
const markdown = (...path: LocalizedContentFieldSegment[]): ContentBlockTextField => ({ path, format: 'markdown' })

/**
 * The text a tenant authors, per block type, and how each field is rendered.
 *
 * This is the one declaration. The writer validates against it, the MCP tool
 * schemas are generated from it, and localization derives its field paths from
 * it — so the three cannot drift into disagreeing about the same block again.
 *
 * It describes the contract, not everything the column currently holds. Stored
 * data carries keys this does not name — components flattened into `markdown`
 * blocks by an earlier migration, `legacy_type` markers, and three separate
 * namings for a hero's call to action. Those are reconciled by the epoch
 * backfill, not by widening this declaration to match them.
 */
export const CONTENT_BLOCK_TEXT_FIELDS = {
  heading: [plain('text')],
  markdown: [markdown('markdown')],
  image: [plain('caption')],
  gallery: [plain('caption')],
  faq: [plain('title')],
  how_to: [
    plain('label'), plain('estimated_time'), plain('tool_items', '*'), plain('supply_items', '*'),
    plain('steps', '*', 'name'), plain('steps', '*', 'text'),
  ],
  divider: [],
  ai_assistance: [
    plain('label'), plain('intro'), plain('prompts', '*', 'title'), plain('prompts', '*', 'prompt'),
    plain('prompts', '*', 'description'), plain('prompts', '*', 'copy_label'),
  ],
  cta: [plain('title'), plain('description'), plain('label')],
  // `body` is what callouts actually store. The blog renderer read
  // `data.markdown || data.text`, and no stored callout has either key, so every
  // callout rendered empty there.
  callout: [plain('title'), plain('body')],
  hero: [plain('eyebrow'), plain('title'), plain('subtitle'), plain('description'), plain('cta_label')],
  button_group: [plain('buttons', '*', 'label')],
  feature_grid: [plain('title'), plain('description'), plain('items', '*', 'title'), plain('items', '*', 'description')],
  testimonial_grid: [plain('title'), plain('description'), plain('items', '*', 'title'), plain('items', '*', 'description')],
  contact_cta: [plain('title'), plain('description'), plain('label')],
  booking_cta: [plain('title'), plain('description'), plain('label')],
  donation_choices: [plain('tiers', '*', 'label')],
  offering_grid: [plain('title'), plain('description')],
  location_grid: [plain('title'), plain('description')],
} as const satisfies Record<ContentBlockType, readonly ContentBlockTextField[]>

// This is the publication block contract for tenant-authored text. Structural
// fields, URLs, flags, and media references are intentionally absent.
export const PUBLICATION_CONTENT_BLOCK_LOCALIZED_FIELDS = Object.fromEntries(
  PUBLICATION_CONTENT_BLOCK_TYPES.map(type => [type, CONTENT_BLOCK_TEXT_FIELDS[type].map(field => field.path)]),
) as unknown as Record<PublicationContentBlockType, ReadonlyArray<readonly LocalizedContentFieldSegment[]>>

export const CONTENT_BLOCK_TYPES = [
  ...PUBLICATION_CONTENT_BLOCK_TYPES,
  'hero',
  'button_group',
  'feature_grid',
  'testimonial_grid',
  'contact_cta',
  'booking_cta',
  'donation_choices',
  'offering_grid',
  'location_grid',
] as const

export type ContentBlockType = typeof CONTENT_BLOCK_TYPES[number]

export const LOCALIZED_RESOURCE_TYPES = [
  'site', 'business_location', 'product', 'collection', 'media_asset',
] as const

export type LocalizedResourceType = typeof LOCALIZED_RESOURCE_TYPES[number]

export type ContentFieldPath = ReadonlyArray<string | number>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Resolves one declared field pattern against a block's data, expanding `*`
 * into the indices the array actually holds. A pattern that does not match
 * anything yields nothing rather than an empty slot.
 */
export function expandContentFieldPath(
  data: Record<string, unknown>,
  pattern: readonly LocalizedContentFieldSegment[],
  path: ContentFieldPath = [],
): ContentFieldPath[] {
  const [segment, ...remaining] = pattern
  if (segment === undefined) return [path]
  if (segment !== '*') return expandContentFieldPath(data, remaining, [...path, segment])
  const collection = readContentFieldValue(data, path)
  if (!Array.isArray(collection)) return []
  return collection.flatMap((_, index) => expandContentFieldPath(data, remaining, [...path, index]))
}

export function readContentFieldValue(data: Record<string, unknown>, path: ContentFieldPath): unknown {
  let value: unknown = data
  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!Array.isArray(value)) return undefined
      value = value[segment]
    } else {
      if (!isRecord(value)) return undefined
      value = value[segment]
    }
  }
  return value
}

/**
 * Renders the block contract as prose for an MCP tool schema.
 *
 * The three tool surfaces used to describe block data by hand — one as
 * `{ type: 'object' }` with no description at all, one as a single English
 * sentence, one silent on text format — so they disagreed about the same
 * behaviour and an assistant got whichever it happened to load. Generating the
 * description from the registry makes that disagreement structurally
 * impossible: there is one declaration, and the schemas are a view of it.
 */
export function describeContentBlockTextFields(types: readonly ContentBlockType[]): string {
  const perType = types.map((type) => {
    const fields = CONTENT_BLOCK_TEXT_FIELDS[type]
    if (fields.length === 0) return `${type} block: no text fields.`
    const named = (format: ContentTextFormat) => fields
      .filter(field => field.format === format)
      .map(field => field.path.join('.'))
    const plainFields = named('plain')
    const markdownFields = named('markdown')
    const parts: string[] = []
    if (plainFields.length > 0) parts.push(`literal — ${plainFields.join(', ')}`)
    if (markdownFields.length > 0) parts.push(`parsed as markdown — ${markdownFields.join(', ')}`)
    return `${type} block: ${parts.join('; ')}.`
  })
  return [
    'Typed block payload.',
    'Plain-text fields are rendered literally, so markdown syntax written into one reaches the reader as raw characters — a heading of "**Title**" publishes with the asterisks showing.',
    'Only the fields listed as markdown are parsed.',
    'A markdown field also requires editor_mode alongside it: "rich" for prose the visual editor can handle, "source" for tables or raw HTML.',
    'Asset IDs and delivery URLs belong in the block media array, never in data.',
    'Fields by block type — ' + perType.join(' '),
  ].join(' ')
}
