import { TENANT_PAGE_BLOCK_REGISTRY, type TenantPageBlockType, type TenantPageField } from '../utils/tenant-page-blocks'

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
/**
 * The text a tenant authors, per block type, and how each field is rendered —
 * derived from the block registry's declared fields.
 *
 * It used to be written out by hand here, which made it the third of five
 * lists describing the same fields. They disagreed. `donation_choices` was
 * declared at `tiers.*.label`, a key the editor never writes, so no donation
 * tier's words were ever translatable; a feature row's `value` and `icon` were
 * absent for the same reason. Deriving it means a field the editor can write is
 * a field localization can see, necessarily.
 *
 * Structural values stay out by declaring `translatable: false` — urls, enums,
 * icons, references — so this remains the tenant-authored text contract.
 */
function blockTextFields(fields: Readonly<Record<string, TenantPageField>>, prefix: LocalizedContentFieldSegment[] = []): ContentBlockTextField[] {
  const collected: ContentBlockTextField[] = []
  for (const [key, field] of Object.entries(fields)) {
    if (field.kind === 'list') {
      // A list of records describes its item's fields; a list of plain strings
      // is itself the text — how_to's tools and supplies are the latter.
      if (field.of) collected.push(...blockTextFields(field.of, [...prefix, key, '*']))
      else if (field.translatable !== false) collected.push({ path: [...prefix, key, '*'], format: 'plain' })
      continue
    }
    if (field.kind !== 'text' && field.kind !== 'markdown') continue
    if (field.translatable === false) continue
    collected.push({ path: [...prefix, key], format: field.kind === 'markdown' ? 'markdown' : 'plain' })
  }
  return collected
}

export const CONTENT_BLOCK_TEXT_FIELDS = Object.fromEntries(
  Object.entries(TENANT_PAGE_BLOCK_REGISTRY).map(([type, definition]) => [type, blockTextFields(definition.fields)]),
) as unknown as Record<ContentBlockType, readonly ContentBlockTextField[]>

// This is the publication block contract for tenant-authored text. Structural
// fields, URLs, flags, and media references are intentionally absent.
export const PUBLICATION_CONTENT_BLOCK_LOCALIZED_FIELDS = Object.fromEntries(
  PUBLICATION_CONTENT_BLOCK_TYPES.map(type => [type, CONTENT_BLOCK_TEXT_FIELDS[type].map(field => field.path)]),
) as unknown as Record<PublicationContentBlockType, ReadonlyArray<readonly LocalizedContentFieldSegment[]>>

/**
 * Every block type there is. Derived, because a second list is how
 * `ai_assistance` came to be writable here and unregistered there: a page
 * carrying one threw "not registered" when it was read, rather than being
 * refused when it was written.
 */
export const CONTENT_BLOCK_TYPES = Object.keys(TENANT_PAGE_BLOCK_REGISTRY) as readonly TenantPageBlockType[]

export type ContentBlockType = TenantPageBlockType

export const LOCALIZED_RESOURCE_TYPES = [
  'organization', 'business_location', 'product', 'collection', 'media_asset',
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
/**
 * The fields that are not prose: references, enums, urls and flags.
 *
 * They were described nowhere. The MCP's block description was generated from
 * the translatable-text list alone, so a tool could be told a `page_grid` holds
 * a title and a description and never that it holds `page_ids` — the one field
 * that makes it list anything. `preset` had the same hole under its old name
 * `section`, which is why a block an assistant wrote rendered nothing on a
 * Blawby or platform page.
 */
function describeStructuralFields(type: ContentBlockType): string {
  const fields = TENANT_PAGE_BLOCK_REGISTRY[type]?.fields ?? {}
  const described = Object.entries(fields)
    .filter(([, field]) => field.kind === 'url' || field.kind === 'enum' || field.kind === 'reference')
    .map(([key, field]) => {
      if (field.kind === 'enum' && field.options?.length) {
        return `${key} (one of ${field.options.map(option => option.value).join(', ')})`
      }
      if (field.kind === 'enum') return `${key} (see the organization's template)`
      if (field.kind === 'reference') return `${key} (${field.reference} ids)`
      return `${key} (url)`
    })
  return described.length ? ` Also ${described.join(', ')}.` : ''
}

export function describeContentBlockTextFields(types: readonly ContentBlockType[]): string {
  const perType = types.map((type) => {
    const fields = CONTENT_BLOCK_TEXT_FIELDS[type]
    if (fields.length === 0) return `${type} block: no text fields.${describeStructuralFields(type)}`
    const named = (format: ContentTextFormat) => fields
      .filter(field => field.format === format)
      .map(field => field.path.join('.'))
    const plainFields = named('plain')
    const markdownFields = named('markdown')
    const parts: string[] = []
    if (plainFields.length > 0) parts.push(`literal — ${plainFields.join(', ')}`)
    if (markdownFields.length > 0) parts.push(`parsed as markdown — ${markdownFields.join(', ')}`)
    return `${type} block: ${parts.join('; ')}.${describeStructuralFields(type)}`
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
