// Isomorphic phone parse/format utility — Nuxt's shared client+server auto-import
// directory (see utils/organization-access.ts for precedent). Every phone read/write
// boundary in the app should go through this file rather than a bespoke regex.
//
// Uses libphonenumber-js's `/min` metadata build (smaller, less-precise-by-carrier
// metadata) instead of the full build so this file stays light in the client bundle
// — this file is imported from client components (e.g. components/PhoneInput.vue,
// pages/login.vue), not just server code.
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min'

export type { CountryCode }

export interface PhoneParseResult {
  e164: string | null
  nationalFormat: string | null
  country: CountryCode | null
  valid: boolean
  possible: boolean
  raw: string
}

function emptyResult(raw: string): PhoneParseResult {
  return { e164: null, nationalFormat: null, country: null, valid: false, possible: false, raw }
}

/**
 * Parse a phone number string into a structured result. Never throws — always
 * returns a result object so callers can decide strict-vs-lenient handling
 * themselves (managers/operational identity paths reject invalid results;
 * guest-facing paths fall back to the raw string).
 */
export function parsePhone(input: string, opts?: { defaultCountry?: CountryCode }): PhoneParseResult {
  const raw = typeof input === 'string' ? input : String(input ?? '')
  const trimmed = raw.trim()
  if (!trimmed) return emptyResult(raw)

  try {
    const parsed = parsePhoneNumberFromString(trimmed, opts?.defaultCountry)
    if (!parsed) return emptyResult(raw)

    return {
      e164: parsed.number,
      nationalFormat: parsed.formatNational(),
      country: parsed.country ?? null,
      valid: parsed.isValid(),
      possible: parsed.isPossible(),
      raw,
    }
  } catch {
    return emptyResult(raw)
  }
}

/** True when `input` parses to a valid E.164 phone number. */
export function isValidE164(input: string): boolean {
  return parsePhone(input).valid
}

/**
 * Strict variant for manager/operational identity paths that must reject an
 * invalid number outright (mirrors the old `server/utils/whatsapp.ts`
 * `normalizePhone`'s throw-based contract). Guest-facing/lenient call sites
 * should use `parsePhone` directly instead and fall back to the raw value.
 */
export function parsePhoneOrThrow(input: string, opts?: { defaultCountry?: CountryCode }): string {
  const result = parsePhone(input, opts)
  if (!result.valid || !result.e164) throw new Error(`Invalid phone number: ${input}`)
  return result.e164
}

/**
 * Masked display format for an already-normalized E.164 number, e.g.
 * "+66 xx-xxx-x123" — used to show "where the reply is going" without
 * fully exposing the recipient's number (see Workstream 5's pre-send
 * disclosure requirement).
 */
export function formatForDisplay(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164)
  if (!parsed) return e164

  const countryCallingCode = `+${parsed.countryCallingCode}`
  const nationalDigits = parsed.nationalNumber
  const visibleTailLength = nationalDigits.length > 4 ? 4 : Math.min(3, nationalDigits.length)
  const maskedLength = Math.max(0, nationalDigits.length - visibleTailLength)
  const masked = 'x'.repeat(maskedLength)
  const visibleTail = nationalDigits.slice(nationalDigits.length - visibleTailLength)

  return `${countryCallingCode} ${masked}${visibleTail}`.trim()
}

/**
 * Identifies the phone metadata implementation that produced a stored E.164
 * value/verification row, so future metadata upgrades can be reasoned about
 * per-row instead of assuming every stored number was normalized the same way.
 * Hardcoded rather than dynamically read from package.json — dynamic reads of
 * package.json aren't reliable in this isomorphic (client + server + Workers)
 * context. Update this string when bumping the libphonenumber-js dependency.
 */
export const PHONE_METADATA_VERSION = 'libphonenumber-js@1.13.8'

/**
 * Meta's WhatsApp webhook `from`/`recipient_id` fields are always a full
 * international MSISDN with no leading "+" (e.g. "14155552671" for a US
 * number, not "+14155552671" or a Thai-local "0812345678"). Parsing that
 * through `parsePhoneOrThrow`'s `defaultCountry` fallback (the convention used
 * elsewhere in this codebase for user-typed input) misinterprets it as a
 * national number for the default country and throws for any sender outside
 * that country. Prepending "+" makes it unambiguous international input,
 * which needs no default-country guess.
 */
export function parseMetaMsisdn(raw: string): string {
  const trimmed = raw.trim()
  return parsePhoneOrThrow(trimmed.startsWith('+') ? trimmed : `+${trimmed}`)
}
