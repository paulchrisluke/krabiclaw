import { parsePhone, type CountryCode } from '~/utils/phone'
import { createPhoneOtpController } from '~/shared/auth/phone-otp-controller'

export interface UsePhoneOtpFlowOptions {
  defaultCountry?: CountryCode
}

export function usePhoneOtpFlow(options: UsePhoneOtpFlowOptions = {}) {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const defaultCountry = options.defaultCountry ?? 'TH'

  const controller = createPhoneOtpController({
    normalize(value) {
      const parsed = parsePhone(value, { defaultCountry })
      return parsed.valid && parsed.e164 ? parsed.e164 : null
    },
    async send(body) {
      const { authClient } = await import('~/lib/auth-client')
      return authClient.phoneNumber.sendOtp(body)
    },
    async verify(body) {
      const { authClient } = await import('~/lib/auth-client')
      return authClient.phoneNumber.verify(body)
    },
    onStateChange(state) {
      loading.value = state.loading
      error.value = state.error
    },
  })

  return {
    loading: readonly(loading),
    error: readonly(error),
    sendOtp: controller.sendOtp,
    verifyOtp: controller.verifyOtp,
  }
}
