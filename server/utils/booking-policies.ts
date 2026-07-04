import { createError } from 'h3'
import { execute, queryFirst, type DbClient } from '../db/index.ts'
import { sanitizeUrl } from '~/utils/sanitize'
export { formatBookingPolicySummary as renderBookingPolicySummary } from './booking-policy-summary.ts'
export type {
  FormattedBookingPolicySummary as RenderedBookingPolicySummary,
  FormattedBookingPolicySummaryItem as RenderedBookingPolicySummaryItem,
} from './booking-policy-summary.ts'

export type BookingPolicyType = 'reservation' | 'experience'
export type BookingPolicyScopeType = 'site' | 'location' | 'experience'

export interface BookingPolicy {
  id: string
  organization_id: string
  site_id: string
  policy_type: BookingPolicyType
  scope_type: BookingPolicyScopeType
  location_id: string | null
  experience_id: string | null
  booking_window_days: number | null
  advance_notice_minutes: number | null
  free_cancellation_until_minutes: number | null
  late_arrival_grace_minutes: number | null
  host_confirmation_sla_minutes: number | null
  reschedule_allowed: boolean | null
  reschedule_cutoff_minutes: number | null
  deposit_required: boolean | null
  deposit_trigger_party_size: number | null
  special_requests_allowed: boolean | null
  weather_policy: string | null
  minimum_guest_age: number | null
  accessibility_contact_required: boolean | null
  additional_notes_html: string | null
  created_at: string
  updated_at: string
}

export interface BookingPolicyPatch {
  booking_window_days?: number | null
  advance_notice_minutes?: number | null
  free_cancellation_until_minutes?: number | null
  late_arrival_grace_minutes?: number | null
  host_confirmation_sla_minutes?: number | null
  reschedule_allowed?: boolean
  reschedule_cutoff_minutes?: number | null
  deposit_required?: boolean
  deposit_trigger_party_size?: number | null
  special_requests_allowed?: boolean
  weather_policy?: string | null
  minimum_guest_age?: number | null
  accessibility_contact_required?: boolean
  additional_notes_html?: string | null
}

export interface ResolveBookingPolicyInput {
  siteId: string
  policyType: BookingPolicyType
  locationId?: string | null
  experienceId?: string | null
}

export interface ResolvedBookingPolicy extends Omit<BookingPolicy,
  'id' | 'organization_id' | 'created_at' | 'updated_at' |
  'reschedule_allowed' | 'deposit_required' | 'special_requests_allowed' | 'accessibility_contact_required'
> {
  id: string | null
  organization_id: string | null
  created_at: string | null
  updated_at: string | null
  // Unlike BookingPolicy (a raw stored row, which may leave these unset at
  // location/experience scope to inherit from its parent — see seedDefaultsForScope),
  // a resolved policy has always had baseDefaults applied, so these are never null here.
  reschedule_allowed: boolean
  deposit_required: boolean
  special_requests_allowed: boolean
  accessibility_contact_required: boolean
  source_scope: BookingPolicyScopeType | 'default'
}

type NumericBookingPolicyField =
  | 'booking_window_days'
  | 'advance_notice_minutes'
  | 'free_cancellation_until_minutes'
  | 'late_arrival_grace_minutes'
  | 'host_confirmation_sla_minutes'
  | 'reschedule_cutoff_minutes'
  | 'deposit_trigger_party_size'
  | 'minimum_guest_age'

type BooleanBookingPolicyField =
  | 'reschedule_allowed'
  | 'deposit_required'
  | 'special_requests_allowed'
  | 'accessibility_contact_required'

type OverlayBookingPolicyField =
  | NumericBookingPolicyField
  | BooleanBookingPolicyField
  | 'weather_policy'
  | 'additional_notes_html'

interface BookingPolicyRow {
  id: string
  organization_id: string
  site_id: string
  policy_type: BookingPolicyType
  scope_type: BookingPolicyScopeType
  location_id: string | null
  experience_id: string | null
  booking_window_days: number | null
  advance_notice_minutes: number | null
  free_cancellation_until_minutes: number | null
  late_arrival_grace_minutes: number | null
  host_confirmation_sla_minutes: number | null
  reschedule_allowed: number | null
  reschedule_cutoff_minutes: number | null
  deposit_required: number | null
  deposit_trigger_party_size: number | null
  special_requests_allowed: number | null
  weather_policy: string | null
  minimum_guest_age: number | null
  accessibility_contact_required: number | null
  additional_notes_html: string | null
  created_at: string
  updated_at: string
}

interface GetDirectBookingPolicyInput {
  siteId: string
  policyType: BookingPolicyType
  scopeType: BookingPolicyScopeType
  locationId?: string | null
  experienceId?: string | null
}

interface UpsertBookingPolicyInput extends GetDirectBookingPolicyInput {
  organizationId: string
  patch: BookingPolicyPatch
}

const BOOKING_POLICY_SELECT = `
  SELECT id, organization_id, site_id, policy_type, scope_type, location_id, experience_id,
         booking_window_days, advance_notice_minutes, free_cancellation_until_minutes,
         late_arrival_grace_minutes, host_confirmation_sla_minutes, reschedule_allowed,
         reschedule_cutoff_minutes, deposit_required, deposit_trigger_party_size,
         special_requests_allowed, weather_policy, minimum_guest_age,
         accessibility_contact_required, additional_notes_html, created_at, updated_at
  FROM booking_policies
`

const RESERVATION_DEFAULTS: Omit<ResolvedBookingPolicy, 'id' | 'organization_id' | 'created_at' | 'updated_at' | 'source_scope'> = {
  site_id: '',
  policy_type: 'reservation',
  scope_type: 'site',
  location_id: null,
  experience_id: null,
  booking_window_days: null,
  advance_notice_minutes: null,
  free_cancellation_until_minutes: 120,
  late_arrival_grace_minutes: 15,
  host_confirmation_sla_minutes: 60,
  reschedule_allowed: true,
  reschedule_cutoff_minutes: 120,
  deposit_required: false,
  deposit_trigger_party_size: 6,
  special_requests_allowed: true,
  weather_policy: null,
  minimum_guest_age: null,
  accessibility_contact_required: false,
  additional_notes_html: null,
}

const EXPERIENCE_DEFAULTS: Omit<ResolvedBookingPolicy, 'id' | 'organization_id' | 'created_at' | 'updated_at' | 'source_scope'> = {
  site_id: '',
  policy_type: 'experience',
  scope_type: 'site',
  location_id: null,
  experience_id: null,
  booking_window_days: null,
  advance_notice_minutes: null,
  free_cancellation_until_minutes: 24 * 60,
  late_arrival_grace_minutes: 15,
  host_confirmation_sla_minutes: 60,
  reschedule_allowed: true,
  reschedule_cutoff_minutes: 24 * 60,
  deposit_required: false,
  deposit_trigger_party_size: null,
  special_requests_allowed: true,
  weather_policy: null,
  minimum_guest_age: null,
  accessibility_contact_required: false,
  additional_notes_html: null,
}

function rowToPolicy(row: BookingPolicyRow): BookingPolicy {
  return {
    ...row,
    reschedule_allowed: row.reschedule_allowed === null ? null : Boolean(row.reschedule_allowed),
    deposit_required: row.deposit_required === null ? null : Boolean(row.deposit_required),
    special_requests_allowed: row.special_requests_allowed === null ? null : Boolean(row.special_requests_allowed),
    accessibility_contact_required: row.accessibility_contact_required === null ? null : Boolean(row.accessibility_contact_required),
  }
}

function baseDefaults(siteId: string, policyType: BookingPolicyType): ResolvedBookingPolicy {
  const defaults = policyType === 'experience' ? EXPERIENCE_DEFAULTS : RESERVATION_DEFAULTS
  return {
    ...defaults,
    site_id: siteId,
    policy_type: policyType,
    id: null,
    organization_id: null,
    created_at: null,
    updated_at: null,
    source_scope: 'default',
  }
}

// Row seed for a newly-created policy, before the caller's patch is applied. Site-scope rows
// are the ultimate fallback and should hold real default values. Location/experience-scope rows
// must start with every overlay field null — seeding them with baseDefaults would persist a
// concrete value for every unset field, which applyPolicy's overlay then treats as an explicit
// override and applies to every guest, silently breaking inheritance from the site-level policy.
// The four boolean fields can't be nulled here because ResolvedBookingPolicy always holds a
// concrete boolean (see its definition) — upsertBookingPolicy's insertableBoolean() nulls them
// out at the SQL layer instead, based on whether the caller's patch explicitly set each one.
function seedDefaultsForScope(
  siteId: string,
  policyType: BookingPolicyType,
  scopeType: BookingPolicyScopeType,
): ResolvedBookingPolicy {
  const base = baseDefaults(siteId, policyType)
  if (scopeType === 'site') return base
  return {
    ...base,
    booking_window_days: null,
    advance_notice_minutes: null,
    free_cancellation_until_minutes: null,
    late_arrival_grace_minutes: null,
    host_confirmation_sla_minutes: null,
    reschedule_cutoff_minutes: null,
    deposit_trigger_party_size: null,
    weather_policy: null,
    minimum_guest_age: null,
    additional_notes_html: null,
  }
}

function applyPolicy(base: ResolvedBookingPolicy, next: BookingPolicy): ResolvedBookingPolicy {
  const merged: ResolvedBookingPolicy = {
    ...base,
    id: next.id,
    organization_id: next.organization_id,
    site_id: next.site_id,
    policy_type: next.policy_type,
    scope_type: next.scope_type,
    location_id: next.location_id,
    experience_id: next.experience_id,
    source_scope: next.scope_type,
    created_at: next.created_at,
    updated_at: next.updated_at,
  }

  const overlayKeys: OverlayBookingPolicyField[] = [
    'booking_window_days',
    'advance_notice_minutes',
    'free_cancellation_until_minutes',
    'late_arrival_grace_minutes',
    'host_confirmation_sla_minutes',
    'reschedule_allowed',
    'reschedule_cutoff_minutes',
    'deposit_required',
    'deposit_trigger_party_size',
    'special_requests_allowed',
    'weather_policy',
    'minimum_guest_age',
    'accessibility_contact_required',
    'additional_notes_html',
  ]

  for (const key of overlayKeys) {
    const value = next[key]
    if (value !== null && value !== undefined) {
      switch (key) {
        case 'booking_window_days':
          merged.booking_window_days = value as number
          break
        case 'advance_notice_minutes':
          merged.advance_notice_minutes = value as number
          break
        case 'free_cancellation_until_minutes':
          merged.free_cancellation_until_minutes = value as number
          break
        case 'late_arrival_grace_minutes':
          merged.late_arrival_grace_minutes = value as number
          break
        case 'host_confirmation_sla_minutes':
          merged.host_confirmation_sla_minutes = value as number
          break
        case 'reschedule_allowed':
          merged.reschedule_allowed = value as boolean
          break
        case 'reschedule_cutoff_minutes':
          merged.reschedule_cutoff_minutes = value as number
          break
        case 'deposit_required':
          merged.deposit_required = value as boolean
          break
        case 'deposit_trigger_party_size':
          merged.deposit_trigger_party_size = value as number
          break
        case 'special_requests_allowed':
          merged.special_requests_allowed = value as boolean
          break
        case 'weather_policy':
          merged.weather_policy = value as string
          break
        case 'minimum_guest_age':
          merged.minimum_guest_age = value as number
          break
        case 'accessibility_contact_required':
          merged.accessibility_contact_required = value as boolean
          break
        case 'additional_notes_html':
          merged.additional_notes_html = value as string
          break
      }
    }
  }

  return merged
}

function assertScope(input: GetDirectBookingPolicyInput) {
  if (input.scopeType === 'site') {
    if (input.locationId || input.experienceId) {
      throw createError({ statusCode: 400, statusMessage: 'site scope cannot include location_id or experience_id' })
    }
    return
  }
  if (input.scopeType === 'location') {
    if (!input.locationId) {
      throw createError({ statusCode: 400, statusMessage: 'location scope requires location_id' })
    }
    if (input.experienceId) {
      throw createError({ statusCode: 400, statusMessage: 'location scope cannot include experience_id' })
    }
    return
  }
  if (input.policyType !== 'experience') {
    throw createError({ statusCode: 400, statusMessage: 'experience scope is only valid for experience policies' })
  }
  if (!input.experienceId) {
    throw createError({ statusCode: 400, statusMessage: 'experience scope requires experience_id' })
  }
}

function normalizeInteger(value: unknown, field: string) {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw createError({ statusCode: 400, statusMessage: `${field} must be a non-negative integer or null` })
  }
  return value
}

function normalizeBoolean(value: unknown, field: string) {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: `${field} must be a boolean` })
  }
  return value
}

function normalizeString(value: unknown, field: string) {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string') {
    throw createError({ statusCode: 400, statusMessage: `${field} must be a string or null` })
  }
  const trimmed = value.trim()
  return trimmed || null
}

const ALLOWED_NOTES_TAGS = new Set(['p', 'br', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'a'])
const ALLOWED_NOTES_ATTRS: Record<string, Set<string>> = { a: new Set(['href', 'target', 'rel']) }

// Uses the Workers runtime's native HTMLRewriter rather than a DOM-based sanitizer
// (e.g. DOMPurify/jsdom) — those depend on Node's `vm`/native bindings and crash the
// whole Worker at module load if imported anywhere in the server bundle, since jsdom
// has no Workers-compatible build. See utils/sanitize.ts's server-side fallback for
// the same constraint on the client/shared sanitize path.
async function sanitizeAdditionalNotesHtml(value: string | null): Promise<string | null> {
  if (!value) return null
  const rewriter = new HTMLRewriter().on('*', {
    element(el) {
      const tag = el.tagName.toLowerCase()
      if (!ALLOWED_NOTES_TAGS.has(tag)) {
        el.removeAndKeepContent()
        return
      }
      const allowedAttrs = ALLOWED_NOTES_ATTRS[tag] ?? new Set<string>()
      // Workers' HTMLRewriter Element.attributes is IterableIterator<string[]> (name/value
      // pairs), but @cloudflare/workers-types' global `Element` collides with lib.dom's
      // `Element` in this project's tsconfig (both declare a same-named global interface),
      // so TS resolves .attributes to the DOM NamedNodeMap shape here. Cast back to the
      // actual runtime shape rather than touching the shared tsconfig lib/types config.
      const attrPairs = el.attributes as unknown as IterableIterator<[string, string]>
      for (const [name] of [...attrPairs]) {
        if (!allowedAttrs.has(name)) el.removeAttribute(name)
      }
      if (tag === 'a') {
        el.setAttribute('href', sanitizeUrl(el.getAttribute('href')))
        el.setAttribute('rel', 'noopener noreferrer')
      }
    },
  })
  const response = rewriter.transform(new Response(`<div>${value}</div>`, { headers: { 'content-type': 'text/html' } }))
  const rewritten = await response.text()
  const sanitized = rewritten.replace(/^<div>/, '').replace(/<\/div>$/, '').trim()
  return sanitized || null
}

export async function validateBookingPolicyPatch(input: Record<string, unknown>, policyType: BookingPolicyType): Promise<BookingPolicyPatch> {
  const patch: BookingPolicyPatch = {}
  const numericFields: NumericBookingPolicyField[] = [
    'booking_window_days',
    'advance_notice_minutes',
    'free_cancellation_until_minutes',
    'late_arrival_grace_minutes',
    'host_confirmation_sla_minutes',
    'reschedule_cutoff_minutes',
    'deposit_trigger_party_size',
    'minimum_guest_age',
  ]
  for (const field of numericFields) {
    const normalized = normalizeInteger(input[field], field)
    if (normalized !== undefined) patch[field] = normalized
  }

  const booleanFields: BooleanBookingPolicyField[] = [
    'reschedule_allowed',
    'deposit_required',
    'special_requests_allowed',
    'accessibility_contact_required',
  ]
  for (const field of booleanFields) {
    const normalized = normalizeBoolean(input[field], field)
    if (normalized !== undefined) patch[field] = normalized
  }

  const notes = normalizeString(input.additional_notes_html, 'additional_notes_html')
  if (notes !== undefined) patch.additional_notes_html = await sanitizeAdditionalNotesHtml(notes)

  if (policyType === 'experience') {
    const weatherPolicy = normalizeString(input.weather_policy, 'weather_policy')
    if (weatherPolicy !== undefined) patch.weather_policy = weatherPolicy
  } else {
    if ('weather_policy' in input || 'minimum_guest_age' in input || 'accessibility_contact_required' in input) {
      // minimum_guest_age/accessibility_contact_required are validated above because they are
      // harmless shared form inputs, but reservation policy responses never render them.
    }
  }

  return patch
}

export async function getDirectBookingPolicy(
  db: DbClient,
  input: GetDirectBookingPolicyInput,
): Promise<BookingPolicy | null> {
  assertScope(input)
  if (input.scopeType === 'site') {
    const row = await queryFirst<BookingPolicyRow>(
      db,
      `${BOOKING_POLICY_SELECT}
       WHERE site_id = ? AND policy_type = ? AND scope_type = 'site'
       LIMIT 1`,
      [input.siteId, input.policyType],
    )
    return row ? rowToPolicy(row) : null
  }
  if (input.scopeType === 'location') {
    const row = await queryFirst<BookingPolicyRow>(
      db,
      `${BOOKING_POLICY_SELECT}
       WHERE site_id = ? AND policy_type = ? AND scope_type = 'location' AND location_id = ?
       LIMIT 1`,
      [input.siteId, input.policyType, input.locationId!],
    )
    return row ? rowToPolicy(row) : null
  }
  const row = await queryFirst<BookingPolicyRow>(
    db,
    `${BOOKING_POLICY_SELECT}
     WHERE site_id = ? AND policy_type = 'experience' AND scope_type = 'experience' AND experience_id = ?
     LIMIT 1`,
    [input.siteId, input.experienceId!],
  )
  return row ? rowToPolicy(row) : null
}

export async function resolveBookingPolicy(
  db: DbClient,
  input: ResolveBookingPolicyInput,
): Promise<ResolvedBookingPolicy> {
  let resolved = baseDefaults(input.siteId, input.policyType)

  const sitePolicy = await getDirectBookingPolicy(db, {
    siteId: input.siteId,
    policyType: input.policyType,
    scopeType: 'site',
  })
  if (sitePolicy) resolved = applyPolicy(resolved, sitePolicy)

  if (input.locationId) {
    const locationPolicy = await getDirectBookingPolicy(db, {
      siteId: input.siteId,
      policyType: input.policyType,
      scopeType: 'location',
      locationId: input.locationId,
    })
    if (locationPolicy) resolved = applyPolicy(resolved, locationPolicy)
  }

  if (input.policyType === 'experience' && input.experienceId) {
    const experiencePolicy = await getDirectBookingPolicy(db, {
      siteId: input.siteId,
      policyType: 'experience',
      scopeType: 'experience',
      experienceId: input.experienceId,
    })
    if (experiencePolicy) resolved = applyPolicy(resolved, experiencePolicy)
  }

  return resolved
}

export function applyBookingPolicyPatch(
  policy: ResolvedBookingPolicy,
  patch: BookingPolicyPatch,
): ResolvedBookingPolicy {
  const next: ResolvedBookingPolicy = { ...policy }

  for (const [key, value] of Object.entries(patch) as Array<[keyof BookingPolicyPatch, BookingPolicyPatch[keyof BookingPolicyPatch]]>) {
    if (value === undefined) continue
    switch (key) {
      case 'booking_window_days':
        next.booking_window_days = value as number | null
        break
      case 'advance_notice_minutes':
        next.advance_notice_minutes = value as number | null
        break
      case 'free_cancellation_until_minutes':
        next.free_cancellation_until_minutes = value as number | null
        break
      case 'late_arrival_grace_minutes':
        next.late_arrival_grace_minutes = value as number | null
        break
      case 'host_confirmation_sla_minutes':
        next.host_confirmation_sla_minutes = value as number | null
        break
      case 'reschedule_cutoff_minutes':
        next.reschedule_cutoff_minutes = value as number | null
        break
      case 'deposit_trigger_party_size':
        next.deposit_trigger_party_size = value as number | null
        break
      case 'minimum_guest_age':
        next.minimum_guest_age = value as number | null
        break
      case 'weather_policy':
        next.weather_policy = value as string | null
        break
      case 'additional_notes_html':
        next.additional_notes_html = value as string | null
        break
      case 'reschedule_allowed':
      case 'deposit_required':
      case 'special_requests_allowed':
      case 'accessibility_contact_required':
        next[key] = value as boolean
        break
    }
  }

  return next
}

export async function upsertBookingPolicy(
  db: DbClient,
  input: UpsertBookingPolicyInput,
): Promise<BookingPolicy> {
  assertScope(input)
  const existing = await getDirectBookingPolicy(db, input)
  const patch = input.patch
  const now = new Date().toISOString()

  if (existing) {
    const sets: string[] = []
    const params: Array<string | number | null> = []
    const patchEntries = Object.entries(patch).filter(([, value]) => value !== undefined)
    for (const [key, value] of patchEntries) {
      sets.push(`${key} = ?`)
      if (typeof value === 'boolean') params.push(value ? 1 : 0)
      else params.push(value as string | number | null)
    }
    sets.push('updated_at = ?')
    params.push(now, existing.id)
    await execute(db, `UPDATE booking_policies SET ${sets.join(', ')} WHERE id = ?`, params)
    const updated = await getDirectBookingPolicy(db, input)
    if (!updated) {
      throw createError({ statusCode: 500, statusMessage: 'Failed to load updated booking policy' })
    }
    return updated
  }

  const id = crypto.randomUUID()
  const seeded = applyBookingPolicyPatch(seedDefaultsForScope(input.siteId, input.policyType, input.scopeType), patch)
  // Site-scope rows are the ultimate fallback and must always store a concrete value.
  // Location/experience-scope rows only store a concrete value for a boolean field when
  // the caller's patch explicitly set it — otherwise it's persisted as NULL so applyPolicy's
  // overlay leaves it inherited from the parent scope instead of silently resetting it to
  // seedDefaultsForScope's placeholder default (see seedDefaultsForScope's own comment).
  function insertableBoolean(field: BooleanBookingPolicyField): number | null {
    if (input.scopeType === 'site') {
      return seeded[field] ? 1 : 0
    }
    const value = patch[field]
    if (value === undefined || value === null) return null
    return seeded[field] ? 1 : 0
  }
  await execute(
    db,
    `INSERT INTO booking_policies (
      id, organization_id, site_id, policy_type, scope_type, location_id, experience_id,
      booking_window_days, advance_notice_minutes, free_cancellation_until_minutes,
      late_arrival_grace_minutes, host_confirmation_sla_minutes, reschedule_allowed,
      reschedule_cutoff_minutes, deposit_required, deposit_trigger_party_size,
      special_requests_allowed, weather_policy, minimum_guest_age,
      accessibility_contact_required, additional_notes_html, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      input.organizationId,
      input.siteId,
      input.policyType,
      input.scopeType,
      input.locationId ?? null,
      input.experienceId ?? null,
      seeded.booking_window_days,
      seeded.advance_notice_minutes,
      seeded.free_cancellation_until_minutes,
      seeded.late_arrival_grace_minutes,
      seeded.host_confirmation_sla_minutes,
      insertableBoolean('reschedule_allowed'),
      seeded.reschedule_cutoff_minutes,
      insertableBoolean('deposit_required'),
      seeded.deposit_trigger_party_size,
      insertableBoolean('special_requests_allowed'),
      seeded.weather_policy,
      seeded.minimum_guest_age,
      insertableBoolean('accessibility_contact_required'),
      seeded.additional_notes_html,
      now,
      now,
    ],
  )

  const created = await getDirectBookingPolicy(db, input)
  if (!created) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to load created booking policy' })
  }
  return created
}
