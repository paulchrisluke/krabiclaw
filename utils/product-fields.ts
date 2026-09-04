import type { ProductDetail } from '~/server/types/products'
import { PRODUCT_DETAIL_KEY, PRODUCT_LIMITS } from '~/shared/product-limits'

/**
 * A detail group as the form holds it.
 *
 * The stored shape carries a kebab-case `key` the tenant never sees — the
 * public page renders `label`. So the form edits the label and the values, and
 * the key is derived here: existing groups keep the key they were saved with so
 * renaming a label does not silently rewrite their identity, and new groups get
 * one from their label.
 */
export interface ProductDetailDraft {
  /** The key this group already has on the server, or null when it is new. */
  key: string | null
  label: string
  values: string[]
}

/**
 * "price-note" is not a detail the tenant edits here. It is reconstructed from
 * the price field, and the server rejects a product that carries one alongside
 * a fixed amount, so it is kept out of the drafts in both directions.
 */
const PRICE_NOTE_KEY = 'price-note'

function deriveDetailKey(label: string): string {
  const slug = label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, PRODUCT_LIMITS.detailKey)
    .replace(/-+$/, '')
  return slug || 'detail'
}

/** Append a numeric suffix until the key is unused, staying within the limit. */
function uniqueKey(candidate: string, taken: Set<string>): string {
  if (!taken.has(candidate)) return candidate
  for (let suffix = 2; ; suffix += 1) {
    const tail = `-${suffix}`
    const next = `${candidate.slice(0, PRODUCT_LIMITS.detailKey - tail.length).replace(/-+$/, '')}${tail}`
    if (!taken.has(next)) return next
  }
}

/**
 * Tags are unique ignoring case on the server, so the form applies that rule
 * before sending rather than letting a save fail on "Vegan" beside "vegan".
 */
export function normalizeProductTags(tags: readonly string[]): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const tag of tags) {
    const value = tag.trim().slice(0, PRODUCT_LIMITS.tag)
    if (!value) continue
    const identity = value.toLocaleLowerCase('en-US')
    if (seen.has(identity)) continue
    seen.add(identity)
    normalized.push(value)
    if (normalized.length >= PRODUCT_LIMITS.tags) break
  }
  return normalized
}

export function toProductDetailDrafts(details: readonly ProductDetail[]): ProductDetailDraft[] {
  return details
    .filter(detail => detail.key !== PRICE_NOTE_KEY)
    .map(detail => ({ key: detail.key, label: detail.label, values: [...detail.values] }))
}

/**
 * Drops groups the server would reject rather than sending them: a group needs
 * a label and at least one value, and there is a cap on how many it accepts.
 */
export function fromProductDetailDrafts(drafts: readonly ProductDetailDraft[]): ProductDetail[] {
  const taken = new Set<string>([PRICE_NOTE_KEY])
  const details: ProductDetail[] = []

  for (const draft of drafts) {
    if (details.length >= PRODUCT_LIMITS.detailGroups) break

    const label = draft.label.trim().slice(0, PRODUCT_LIMITS.detailLabel)
    if (!label) continue

    const seen = new Set<string>()
    const values: string[] = []
    for (const value of draft.values) {
      const normalized = value.trim().slice(0, PRODUCT_LIMITS.detailValue)
      if (!normalized) continue
      const identity = normalized.toLocaleLowerCase('en-US')
      if (seen.has(identity)) continue
      seen.add(identity)
      values.push(normalized)
      if (values.length >= PRODUCT_LIMITS.detailValues) break
    }
    if (!values.length) continue

    // A key saved before this editor existed may not match what we would derive
    // today, so it is kept as-is unless it is unusable.
    const existing = draft.key
      && PRODUCT_DETAIL_KEY.test(draft.key)
      && draft.key.length <= PRODUCT_LIMITS.detailKey
      && draft.key !== PRICE_NOTE_KEY
      ? draft.key
      : null
    const key = uniqueKey(existing ?? deriveDetailKey(label), taken)
    taken.add(key)
    details.push({ key, label, values })
  }

  return details
}
