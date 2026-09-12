// U6-authored create-intake payload shape (R15).
//
// U4's brief explicitly deferred this: "No create-intake schema/validator
// exists yet... U6 will define the actual intake payload shape when it
// builds the public route." This file is that definition. R15's
// reconciliation gap is now closed: U8's real create-intake contract is
// createPracticeClientIntakeSchema in blawby-ts
// (src/modules/practice-client-intakes/validations/practice-client-intakes.validation.ts),
// which requires {amount, name, email, phone?, description?} -- not
// {matterType, fullName}. The browser-facing shape below is kept as
// KrabiClaw's own public contract (see buildBlawbyIntakeCreateBody for the
// mapping onto the real outbound body); its email/description length bounds
// are now aligned to Blawby's schema (255/500) so an out-of-bound value
// fails closed here with this route's own 400 rather than surfacing later as
// an opaque Blawby 502. Kept minimal and hand-rolled (an allowlisted-field
// plain-object validator), matching this repo's existing style
// (server/utils/api-response.ts's readStrictBody) rather than adding a
// validation-library dependency.

import { isRecord, readString } from '~/server/utils/type-guards'

export interface LegalIntakePayload {
  matterType: string
  fullName: string
  email: string
  phone: string | null
  description: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ALLOWED_FIELDS = new Set(['matterType', 'fullName', 'email', 'phone', 'description'])

// Every field is required except phone (nullable). Length bounds are
// conservative choices for this route, not a confirmed U8 field-length
// contract. Returns undefined for any unknown field, wrong type, empty
// required string, or out-of-bound value -- fails closed rather than
// passing anything not explicitly allowlisted through to
// buildLegalIntakeDigest/callBlawbyRoute.
export function validateLegalIntakePayload(value: unknown): LegalIntakePayload | undefined {
  if (!isRecord(value)) return undefined
  const unknownKeys = Object.keys(value).filter(key => !ALLOWED_FIELDS.has(key))
  if (unknownKeys.length) return undefined

  const matterType = readString(value, 'matterType')?.trim()
  const fullName = readString(value, 'fullName')?.trim()
  const email = readString(value, 'email')?.trim().toLowerCase()
  const description = readString(value, 'description')?.trim()
  const phoneRaw = value.phone

  if (!matterType || matterType.length > 200) return undefined
  if (!fullName || fullName.length > 200) return undefined
  if (!email || email.length > 255 || !EMAIL_PATTERN.test(email)) return undefined
  if (!description || description.length > 500) return undefined
  if (phoneRaw !== undefined && phoneRaw !== null && typeof phoneRaw !== 'string') return undefined
  // Reject an out-of-bound phone value, same as every other field in this
  // validator — never silently truncate, which would accept a different,
  // wrong value as if it were valid input.
  const trimmedPhone = typeof phoneRaw === 'string' ? phoneRaw.trim() : null
  if (typeof phoneRaw === 'string' && (!trimmedPhone || trimmedPhone.length > 50)) return undefined
  const phone = trimmedPhone

  return { matterType, fullName, email, phone, description }
}

// R15 reconciliation: U8's real create-intake contract (confirmed against
// blawby-ts's createPracticeClientIntakeSchema) is {amount, name, email,
// phone?, description?, custom_fields?} -- not {matterType, fullName}. The
// browser-facing LegalIntakePayload shape above is kept as-is (it is
// KrabiClaw's own public contract and is what claimLegalIntakeReference's
// payload digest is computed over); this function maps it onto the real
// outbound Blawby body instead of sending it through unchanged. This is a
// free (no-payment) intake, so amount is always 0. matterType has no
// first-class Blawby field, so it rides in custom_fields.matter_type.
export interface BlawbyIntakeCreateBody {
  amount: number
  name: string
  email: string
  phone?: string
  description: string
  custom_fields: { matter_type: string }
}

export function buildBlawbyIntakeCreateBody(payload: LegalIntakePayload): BlawbyIntakeCreateBody {
  return {
    amount: 0,
    name: payload.fullName,
    email: payload.email,
    ...(payload.phone ? { phone: payload.phone } : {}),
    description: payload.description,
    custom_fields: { matter_type: payload.matterType },
  }
}
