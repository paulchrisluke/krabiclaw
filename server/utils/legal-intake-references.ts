// U4/U9: durable KrabiClaw authorization and recovery record for public
// legal (Blawby) intake requests. Implements R14-R18, R27, R29, R31 and
// KTD4/KTD9. No route imports this module yet (U6 wires the public route
// and the outbound Blawby call; U4 only builds the repository layer and
// extends the trusted Better Auth link hook in auth.ts).
//
// KTD4: "Claim the public idempotency binding atomically before the network
// call. A single atomic upsert-return claim owns the request, immutable
// actor/site fields, and versioned keyed payload digest. Intake attachment
// cannot overwrite another value; Checkout replacement requires
// compare-and-set against the expected current value returned to that
// caller." claimLegalIntakeReference below never calls out to Blawby or any
// network client — it is structurally impossible for it to have done so,
// since it accepts only a DbClient, an H3Event (for R29 correlation), and
// plain data, and its only I/O is one D1 statement.

import type { H3Event } from 'nitro'

import { execute, queryFirst, type DbClient } from '~/server/db'
import type { CloudflareEnv } from '~/server/utils/auth'
import {
  emitLegalSecurityEvent,
  legalRequestCorrelationId,
  type LegalActorKind,
} from '~/server/utils/legal-access'

// -- Versioned keyed digest (R15, R31) ---------------------------------------

// Bumping this changes the signed message for every new claim, so a stored
// row's digest_version pins which canonicalization/message format produced
// it — an old version's digest is never compared using new-version logic,
// which is how "digest versions do not collide silently" (R31) holds even if
// a future version changes canonicalization rules.
export const LEGAL_INTAKE_DIGEST_VERSION = 1

// Recursively sorts object keys so different object-key order yields the
// same digest (R31/"Data Model"), while leaving array order and string
// content (legal fact whitespace/case) untouched — both are significant per
// the data model and must survive canonicalization unchanged.
function canonicalizeForDigest(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeForDigest)
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(source).sort()) {
      sorted[key] = canonicalizeForDigest(source[key])
    }
    return sorted
  }
  return value
}

async function hmacHex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message))
  return [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export interface LegalIntakeDigestKeyConfig {
  activeKeyId: string
  activeKey: string
  previousKeys: Record<string, string>
}

// Parses LEGAL_DIGEST_KEY_ACTIVE ("<keyId>:<secret>") and the comma-separated
// LEGAL_DIGEST_KEYS_PREVIOUS ("<keyId>:<secret>,<keyId>:<secret>,...") from
// U1's CloudflareEnv. A missing/malformed active key returns null — new
// claims fail closed (no fallback key is invented), matching R19's
// "a missing... value... denies" precedent in legal-access.ts.
export function parseLegalIntakeDigestKeyConfig(env: CloudflareEnv): LegalIntakeDigestKeyConfig | null {
  const active = env.LEGAL_DIGEST_KEY_ACTIVE
  if (!active) return null
  const separatorIndex = active.indexOf(':')
  if (separatorIndex <= 0) return null
  const activeKeyId = active.slice(0, separatorIndex)
  const activeKey = active.slice(separatorIndex + 1)
  if (!activeKeyId || !activeKey) return null

  const previousKeys: Record<string, string> = {}
  const previousRaw = env.LEGAL_DIGEST_KEYS_PREVIOUS ?? ''
  for (const entry of previousRaw.split(',').map(part => part.trim()).filter(Boolean)) {
    const entrySeparatorIndex = entry.indexOf(':')
    if (entrySeparatorIndex <= 0) continue
    const keyId = entry.slice(0, entrySeparatorIndex)
    const key = entry.slice(entrySeparatorIndex + 1)
    if (keyId && key) previousKeys[keyId] = key
  }

  return { activeKeyId, activeKey, previousKeys }
}

export interface LegalIntakeDigest {
  digest: string
  digestKeyId: string
  digestVersion: number
}

// Builds the digest for a NEW claim using the currently active key only
// (R31: "new claims use the active server-only key"). `payload` must already
// be validated and allowlisted by the caller (U6's create-intake schema) —
// this function does no schema validation of its own.
export async function buildLegalIntakeDigest(
  payload: Record<string, unknown>,
  env: CloudflareEnv,
): Promise<LegalIntakeDigest | null> {
  const keys = parseLegalIntakeDigestKeyConfig(env)
  if (!keys) return null
  const canonical = JSON.stringify(canonicalizeForDigest(payload))
  const message = `v${LEGAL_INTAKE_DIGEST_VERSION}:${canonical}`
  const digest = await hmacHex(keys.activeKey, message)
  return { digest, digestKeyId: keys.activeKeyId, digestVersion: LEGAL_INTAKE_DIGEST_VERSION }
}

// Verifies a payload against a STORED row's digest/digestKeyId/digestVersion
// using the bounded configured key ring (R31: "existing claims verify with
// the bounded configured key ring"). This is what makes recovery
// rotation-safe: it never recomputes with the current active key and
// compares hex strings (which would falsely conflict after rotation) — it
// looks up the specific key identified by the stored row first. An unknown
// digest_version or an unconfigured/unknown digest_key_id fails closed
// (returns false) without ever logging the key material itself.
export async function verifyLegalIntakeDigest(
  payload: Record<string, unknown>,
  stored: { digest: string; digestKeyId: string; digestVersion: number },
  env: CloudflareEnv,
): Promise<boolean> {
  if (stored.digestVersion !== LEGAL_INTAKE_DIGEST_VERSION) return false
  const keys = parseLegalIntakeDigestKeyConfig(env)
  if (!keys) return false
  const key = stored.digestKeyId === keys.activeKeyId ? keys.activeKey : keys.previousKeys[stored.digestKeyId]
  if (!key) return false
  const canonical = JSON.stringify(canonicalizeForDigest(payload))
  const message = `v${stored.digestVersion}:${canonical}`
  const digest = await hmacHex(key, message)
  return digest === stored.digest
}

// -- Record shape -------------------------------------------------------

export interface LegalIntakeRecord {
  id: string
  organizationId: string
  siteId: string
  originalActorId: string
  originalActorKind: Extract<LegalActorKind, 'human' | 'anonymous'>
  currentAuthorizedUserId: string | null
  payloadDigest: string
  digestKeyId: string
  digestVersion: number
  blawbyIntakeId: string | null
  checkoutSessionId: string | null
  createdAt: string
  updatedAt: string
}

interface LegalIntakeRow {
  id: string
  organization_id: string
  site_id: string
  original_actor_id: string
  original_actor_kind: string
  current_authorized_user_id: string | null
  payload_digest: string
  digest_key_id: string
  digest_version: number
  blawby_intake_id: string | null
  checkout_session_id: string | null
  created_at: string
  updated_at: string
}

function mapRow(row: LegalIntakeRow): LegalIntakeRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    siteId: row.site_id,
    originalActorId: row.original_actor_id,
    originalActorKind: row.original_actor_kind as Extract<LegalActorKind, 'human' | 'anonymous'>,
    currentAuthorizedUserId: row.current_authorized_user_id,
    payloadDigest: row.payload_digest,
    digestKeyId: row.digest_key_id,
    digestVersion: row.digest_version,
    blawbyIntakeId: row.blawby_intake_id,
    checkoutSessionId: row.checkout_session_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// -- Atomic upsert-return claim (KTD4) ---------------------------------------

export type LegalIntakeClaimOutcome =
  | { status: 'claimed' | 'recovered'; record: LegalIntakeRecord }
  | { status: 'ownership_conflict' }
  | { status: 'payload_conflict' }
  | { status: 'digest_key_unconfigured' }

export interface ClaimLegalIntakeReferenceParams {
  requestReference: string
  organizationId: string
  siteId: string
  actorId: string
  actorKind: Extract<LegalActorKind, 'human' | 'anonymous'>
  payload: Record<string, unknown>
}

// R15: "Before calling Blawby, KrabiClaw persists a request record bound to
// organization, site, immutable original actor ID and kind... and a
// versioned keyed digest." One INSERT...ON CONFLICT...DO UPDATE...RETURNING
// round trip either creates the record (first claim) or returns the
// existing row untouched in its immutable fields (retry/conflict) — no
// check-then-insert race, matching KTD4 and the bind-session.post.ts /
// incrementHourlyRateLimit precedents this repo already uses for atomic D1
// claims. The DO UPDATE branch only ever writes `updated_at` (to the fresh
// timestamp of THIS call, which is also how claimed-vs-recovered is told
// apart below), so original_actor_id/kind, organization_id, site_id,
// payload_digest, digest_key_id, and digest_version are never overwritten by
// a second caller — R16/R17's "immutable... fields" guarantee.
export async function claimLegalIntakeReference(
  db: DbClient,
  event: H3Event,
  env: CloudflareEnv,
  params: ClaimLegalIntakeReferenceParams,
): Promise<LegalIntakeClaimOutcome> {
  const built = await buildLegalIntakeDigest(params.payload, env)
  if (!built) return { status: 'digest_key_unconfigured' }

  const now = new Date().toISOString()
  const row = await queryFirst<LegalIntakeRow>(db, `
    INSERT INTO legal_intake_references (
      id, organization_id, site_id, original_actor_id, original_actor_kind,
      payload_digest, digest_key_id, digest_version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at
      WHERE legal_intake_references.organization_id = excluded.organization_id
        AND legal_intake_references.site_id = excluded.site_id
        AND (legal_intake_references.original_actor_id = excluded.original_actor_id
          OR legal_intake_references.current_authorized_user_id = excluded.original_actor_id)
    RETURNING *
  `, [
    params.requestReference, params.organizationId, params.siteId,
    params.actorId, params.actorKind,
    built.digest, built.digestKeyId, built.digestVersion,
    now, now,
  ])
  // The ownership rule is carried by the write itself, so a guessed reference
  // touches nothing at all: the upsert used to bump another tenant's row and
  // only then check who owned it. No row back means the conflict target exists
  // and belongs to somebody else.
  if (!row) {
    emitLegalSecurityEvent({
      reason: 'legal_intake_ownership_conflict',
      organizationId: params.organizationId,
      siteId: params.siteId,
      actorKind: params.actorKind,
      requestCorrelationId: legalRequestCorrelationId(event),
    })
    return { status: 'ownership_conflict' }
  }

  // R16: "The only cross-actor continuation allowed is the current
  // authorized user established by the trusted Better Auth link hook."
  const ownedByActor = row.original_actor_id === params.actorId
    || (row.current_authorized_user_id !== null && row.current_authorized_user_id === params.actorId)
  if (row.organization_id !== params.organizationId || row.site_id !== params.siteId || !ownedByActor) {
    emitLegalSecurityEvent({
      reason: 'legal_intake_ownership_conflict',
      organizationId: params.organizationId,
      siteId: params.siteId,
      actorKind: params.actorKind,
      requestCorrelationId: legalRequestCorrelationId(event),
    })
    return { status: 'ownership_conflict' }
  }

  const digestOk = await verifyLegalIntakeDigest(
    params.payload,
    { digest: row.payload_digest, digestKeyId: row.digest_key_id, digestVersion: row.digest_version },
    env,
  )
  if (!digestOk) {
    emitLegalSecurityEvent({
      reason: 'legal_intake_payload_conflict',
      organizationId: params.organizationId,
      siteId: params.siteId,
      actorKind: params.actorKind,
      requestCorrelationId: legalRequestCorrelationId(event),
    })
    return { status: 'payload_conflict' }
  }

  // Best-effort claimed-vs-recovered signal for callers/telemetry only — the
  // atomicity/ownership/digest guarantees above hold regardless of this
  // label. A row whose updated_at has never diverged from created_at (no
  // prior claim or attach touched it) reads as a fresh claim.
  const wasCreated = row.created_at === row.updated_at
  return { status: wasCreated ? 'claimed' : 'recovered', record: mapRow(row) }
}

// -- U6 addition: read-only lookup for recover/checkout/status/post-pay -----

export interface FindLegalIntakeReferenceParams {
  requestReference: string
  organizationId: string
  siteId: string
  actorId: string
}

// R16's "recover by request reference" (and the checkout/status/post-pay
// routes that follow it) need to re-find an existing claim WITHOUT
// resubmitting/reverifying the original payload -- claimLegalIntakeReference
// above always requires a payload and performs a write. This is the
// read-only counterpart: same ownership rule as claimLegalIntakeReference
// (original actor OR the linked current authorized user), but no digest
// verification (there is no payload to verify here) and no row mutation.
// Returns null for both "no such row" and "row exists but this actor does
// not own it" -- the two are made indistinguishable to the caller so a
// probing actor cannot use this to enumerate other actors' request
// references.
export async function findLegalIntakeReferenceForActor(
  db: DbClient,
  params: FindLegalIntakeReferenceParams,
): Promise<LegalIntakeRecord | null> {
  const row = await queryFirst<LegalIntakeRow>(db, `
    SELECT * FROM legal_intake_references
     WHERE id = ? AND organization_id = ? AND site_id = ?
  `, [params.requestReference, params.organizationId, params.siteId])
  if (!row) return null
  const ownedByActor = row.original_actor_id === params.actorId
    || (row.current_authorized_user_id !== null && row.current_authorized_user_id === params.actorId)
  if (!ownedByActor) return null
  return mapRow(row)
}

// -- Intake/Checkout attachment (R17) ----------------------------------------

export type LegalIntakeAttachOutcome = 'attached' | 'conflict'

// Drizzle's execute() wraps D1's thrown error (DrizzleQueryError, message
// "Failed query: ..."), with the actual "UNIQUE constraint failed: ..."
// message nested on `.cause` — so this walks the cause chain rather than
// checking only the top-level message, matching the substance of the
// UNIQUE-detection precedent already used elsewhere in this repo (e.g.
// server/utils/site-creation.ts) for the raw-D1-batch error shape.
function isUniqueConstraintError(error: unknown): boolean {
  let current: unknown = error
  while (current instanceof Error) {
    if (/UNIQUE constraint failed/i.test(current.message)) return true
    current = current.cause
  }
  return false
}

export interface AttachLegalIntakeUuidParams {
  requestReference: string
  organizationId: string
  siteId: string
  blawbyIntakeId: string
}

// R17: "Null-to-value and same-value updates are allowed" for the unique
// Blawby intake identifier; "Concurrent stale or conflicting updates fail
// without overwrite." The UNIQUE index on blawby_intake_id (schema.ts) is
// what makes "two request references cannot bind the same Blawby intake"
// hold even under a race between two different reference rows — caught here
// and reported as the same 'conflict' outcome as a same-row mismatch.
export async function attachLegalIntakeUuid(
  db: DbClient,
  event: H3Event,
  params: AttachLegalIntakeUuidParams,
): Promise<LegalIntakeAttachOutcome> {
  const now = new Date().toISOString()
  try {
    const result = await execute(db, `
      UPDATE legal_intake_references
         SET blawby_intake_id = COALESCE(blawby_intake_id, ?), updated_at = ?
       WHERE id = ? AND organization_id = ? AND site_id = ?
         AND (blawby_intake_id IS NULL OR blawby_intake_id = ?)
    `, [params.blawbyIntakeId, now, params.requestReference, params.organizationId, params.siteId, params.blawbyIntakeId])
    if (Number(result?.meta?.changes ?? 0) === 1) return 'attached'
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error
  }
  emitLegalSecurityEvent({
    reason: 'legal_intake_attachment_conflict',
    organizationId: params.organizationId,
    siteId: params.siteId,
    actorKind: null,
    requestCorrelationId: legalRequestCorrelationId(event),
  })
  return 'conflict'
}

export interface AttachLegalCheckoutSessionInitialParams {
  requestReference: string
  organizationId: string
  siteId: string
  checkoutSessionId: string
}

// R17: "a Payment Link return may attach an unbound session only after U8
// verifies request reference, intake UUID, organization, and session
// together" — U4 only implements the attach primitive itself (null-to-value
// / same-value), not U8's verification, which is out of scope here. The
// UNIQUE index on checkout_session_id again enforces "two request references
// cannot bind the same... Checkout session."
export async function attachLegalCheckoutSessionInitial(
  db: DbClient,
  event: H3Event,
  params: AttachLegalCheckoutSessionInitialParams,
): Promise<LegalIntakeAttachOutcome> {
  const now = new Date().toISOString()
  try {
    const result = await execute(db, `
      UPDATE legal_intake_references
         SET checkout_session_id = COALESCE(checkout_session_id, ?), updated_at = ?
       WHERE id = ? AND organization_id = ? AND site_id = ?
         AND (checkout_session_id IS NULL OR checkout_session_id = ?)
    `, [params.checkoutSessionId, now, params.requestReference, params.organizationId, params.siteId, params.checkoutSessionId])
    if (Number(result?.meta?.changes ?? 0) === 1) return 'attached'
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error
  }
  emitLegalSecurityEvent({
    reason: 'legal_intake_attachment_conflict',
    organizationId: params.organizationId,
    siteId: params.siteId,
    actorKind: null,
    requestCorrelationId: legalRequestCorrelationId(event),
  })
  return 'conflict'
}

export interface ReplaceLegalCheckoutSessionParams {
  requestReference: string
  organizationId: string
  siteId: string
  expectedPriorSessionId: string
  newSessionId: string
}

// R17: "a checkout response may compare-and-set the expected prior session
// to a Blawby-validated replacement." Unlike the initial attach above, this
// requires an EXACT match on the expected prior value (no NULL branch) —
// a stale or conflicting concurrent replacement attempt fails without
// overwrite, and never falls back to attaching over an unexpected value.
export async function replaceLegalCheckoutSession(
  db: DbClient,
  event: H3Event,
  params: ReplaceLegalCheckoutSessionParams,
): Promise<LegalIntakeAttachOutcome> {
  const now = new Date().toISOString()
  try {
    const result = await execute(db, `
      UPDATE legal_intake_references
         SET checkout_session_id = ?, updated_at = ?
       WHERE id = ? AND organization_id = ? AND site_id = ?
         AND checkout_session_id = ?
    `, [params.newSessionId, now, params.requestReference, params.organizationId, params.siteId, params.expectedPriorSessionId])
    if (Number(result?.meta?.changes ?? 0) === 1) return 'attached'
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error
  }
  emitLegalSecurityEvent({
    reason: 'legal_intake_attachment_conflict',
    organizationId: params.organizationId,
    siteId: params.siteId,
    actorKind: null,
    requestCorrelationId: legalRequestCorrelationId(event),
  })
  return 'conflict'
}

// -- Trusted Better Auth link hook (R27, KTD9) -------------------------------

// Extends the existing trusted onLinkAccount hook in auth.ts. Sets
// current_authorized_user_id exactly once per record, from NULL only — the
// WHERE clause makes this replay-safe (a second call for the same anonymous
// actor is a no-op, not an error) and collision-safe (a record already
// authorized to a DIFFERENT user is left untouched rather than overwritten
// or thrown on, matching the brief's guidance that a hard failure here could
// break the unrelated review_requests/reviews linking in the same hook).
// original_actor_id is never written by this function, preserving the
// original anonymous attribution per KTD9.
export async function linkLegalIntakeAuthorizedUser(
  db: DbClient,
  anonymousActorId: string,
  newUserId: string,
): Promise<void> {
  const now = new Date().toISOString()
  await execute(db, `
    UPDATE legal_intake_references
       SET current_authorized_user_id = ?, updated_at = ?
     WHERE original_actor_id = ?
       AND current_authorized_user_id IS NULL
  `, [newUserId, now, anonymousActorId])
}
