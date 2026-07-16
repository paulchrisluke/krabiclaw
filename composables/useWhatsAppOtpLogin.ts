// Shared WhatsApp phone-OTP send/verify logic (issue #293, Section B). Before
// this, pages/login.vue and pages/accept-invitation/[invitationId].vue each
// called authClient.phoneNumber.sendOtp/verify directly with their own local
// loading/error refs — two copies of the same round-trip. Centralizing it
// here means both entry points (accept-invitation's fixed-phone activation,
// and login.vue's user-entered-phone dashboard reauth) share one
// implementation of "normalize via utils/phone.ts, call Better Auth's phone
// plugin, surface a consistent error message."
import { parsePhone, type CountryCode } from '~/utils/phone'

export interface UseWhatsAppOtpLoginOptions {
  /** ISO country used to interpret a national-format (no leading `+`) entry. */
  defaultCountry?: CountryCode
}

export function useWhatsAppOtpLogin(options: UseWhatsAppOtpLoginOptions = {}) {
  const defaultCountry: CountryCode = options.defaultCountry ?? 'TH'
  const loading = ref(false)
  const error = ref<string | null>(null)

  function normalizePhone(value: string): string | null {
    const parsed = parsePhone(value, { defaultCountry })
    return parsed.valid && parsed.e164 ? parsed.e164 : null
  }

  async function sendOtp(phoneInput: string): Promise<{ ok: true; phone: string } | { ok: false }> {
    const normalized = normalizePhone(phoneInput)
    if (!normalized) {
      error.value = 'Please enter a valid phone number'
      return { ok: false }
    }
    loading.value = true
    error.value = null
    try {
      const { authClient } = await import('~/lib/auth-client')
      const result = await authClient.phoneNumber.sendOtp({ phoneNumber: normalized })
      if (result?.error) throw new Error(result.error.message || 'Failed to send code')
      return { ok: true, phone: normalized }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to send code. Check your number and try again.'
      return { ok: false }
    } finally {
      loading.value = false
    }
  }

  async function verifyOtp(phoneInput: string, code: string, callbackURL?: string): Promise<boolean> {
    const normalized = normalizePhone(phoneInput)
    if (!normalized || code.trim().length !== 6) {
      error.value = 'Please enter a valid phone number and 6-digit code'
      return false
    }
    loading.value = true
    error.value = null
    try {
      const { authClient } = await import('~/lib/auth-client')
      const result = await authClient.phoneNumber.verify({ phoneNumber: normalized, code: code.trim(), callbackURL })
      if (result?.error) throw new Error(result.error.message || 'Invalid or expired code')
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Invalid or expired code. Please try again.'
      return false
    } finally {
      loading.value = false
    }
  }

  return { loading, error, normalizePhone, sendOtp, verifyOtp }
}
