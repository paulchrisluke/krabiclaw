/**
 * The robots contract.
 *
 * A stored robots value is an *intent*, not a meta tag. Exactly four intents
 * exist — the two indexing choices crossed with the two link-following
 * choices — and every table that carries a `robots` column (`sites`,
 * `business_locations`, `products`, `content_documents`) stores one of them or
 * NULL, which means "the default". Nothing stores a rendered directive.
 *
 * The directive that reaches `<meta name="robots">` is *derived* from the
 * intent by `composeRobotsDirective()`, which appends the preview directives
 * Google reads for rich results. That derivation is the only place the served
 * string is built, so a CMS-driven page and a hardcoded marketing page emit
 * the same shape. Previously the column was free text: the same intent was
 * stored as `index, follow`, `index,follow` and NULL, each of which rendered
 * differently, and the pages with images were the ones that lost
 * `max-image-preview:large`.
 */

export type RobotsIntent = 'index,follow' | 'noindex,follow' | 'index,nofollow' | 'noindex,nofollow'

export const ROBOTS_INTENTS: readonly RobotsIntent[] = [
  'index,follow',
  'noindex,follow',
  'index,nofollow',
  'noindex,nofollow',
] as const

export const ROBOTS_INTENT_LABELS: Record<RobotsIntent, string> = {
  'index,follow': 'Index, follow',
  'noindex,follow': 'No index, follow',
  'index,nofollow': 'Index, no follow',
  'noindex,nofollow': 'No index, no follow',
}

/** A row with no stored intent is indexable and followable. */
export const DEFAULT_ROBOTS_INTENT: RobotsIntent = 'index,follow'

/** The intent for a page that must never be indexed. */
export const NON_INDEXABLE_ROBOTS_INTENT: RobotsIntent = 'noindex,nofollow'

/**
 * Preview directives served alongside every indexable page. They are the
 * @nuxtjs/robots enabled value's directives, so the module's site-wide tag and
 * this contract agree byte for byte.
 */
export const ROBOTS_PREVIEW_DIRECTIVES = [
  'max-image-preview:large',
  'max-snippet:-1',
  'max-video-preview:-1',
] as const

export function isRobotsIntent(value: unknown): value is RobotsIntent {
  return typeof value === 'string' && (ROBOTS_INTENTS as readonly string[]).includes(value)
}

/**
 * Canonicalizes a stored or submitted value to an intent, reporting failure
 * rather than throwing so each write path can reject with its own error type.
 * Blank and null mean "unset". Legacy spacing (`index, follow`) and directive
 * order (`follow, index`) canonicalize; anything else fails, because a value
 * this contract cannot name is a value nobody can serve.
 */
export function parseRobotsIntent(value: unknown): { ok: true; intent: RobotsIntent | null } | { ok: false } {
  if (value === null || value === undefined) return { ok: true, intent: null }
  if (typeof value !== 'string') return { ok: false }
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return { ok: true, intent: null }
  const tokens = trimmed.split(',').map(token => token.trim()).filter(Boolean)
  const indexing = tokens.filter(token => token === 'index' || token === 'noindex')
  const following = tokens.filter(token => token === 'follow' || token === 'nofollow')
  if (tokens.length !== indexing.length + following.length) return { ok: false }
  if (indexing.length > 1 || following.length > 1) return { ok: false }
  if (!indexing.length && !following.length) return { ok: false }
  const candidate = `${indexing[0] ?? 'index'},${following[0] ?? 'follow'}`
  return isRobotsIntent(candidate) ? { ok: true, intent: candidate } : { ok: false }
}

/** Canonicalizes a value, throwing when it names no supported intent. */
export function normalizeRobotsIntent(value: unknown): RobotsIntent | null {
  const parsed = parseRobotsIntent(value)
  if (!parsed.ok) throw new Error(`robots must be one of: ${ROBOTS_INTENTS.join(', ')}`)
  return parsed.intent
}

export function isIndexableRobotsIntent(value: RobotsIntent | null | undefined): boolean {
  return (value ?? DEFAULT_ROBOTS_INTENT).startsWith('index')
}

/**
 * The served `<meta name="robots">` content for an intent. An indexable page
 * carries the preview directives; a noindex page does not, because preview
 * limits only describe a result that will not exist.
 */
export function composeRobotsDirective(value: RobotsIntent | null | undefined): string {
  const intent = value ?? DEFAULT_ROBOTS_INTENT
  const [indexing, following] = intent.split(',')
  const directives = [indexing, following]
  if (indexing === 'index') directives.push(...ROBOTS_PREVIEW_DIRECTIVES)
  return directives.join(', ')
}

/** The directive @nuxtjs/robots must serve for an indexable route. */
export const ROBOTS_ENABLED_DIRECTIVE = composeRobotsDirective(DEFAULT_ROBOTS_INTENT)

/** The directive @nuxtjs/robots must serve for a route it blocks. */
export const ROBOTS_DISABLED_DIRECTIVE = composeRobotsDirective(NON_INDEXABLE_ROBOTS_INTENT)
