export interface PhoneOtpProviderResult {
  error?: { message?: string } | null
}

export interface PhoneOtpControllerDependencies {
  normalize: (value: string) => string | null
  send: (body: { phoneNumber: string }) => Promise<PhoneOtpProviderResult>
  verify: (body: { phoneNumber: string; code: string }) => Promise<PhoneOtpProviderResult>
  onStateChange?: (state: { loading: boolean; error: string | null }) => void
}

export type PhoneOtpResult = { ok: true; phone: string } | { ok: false }

export function createPhoneOtpController(dependencies: PhoneOtpControllerDependencies) {
  let loading = false
  let currentError: string | null = null

  function update(nextLoading: boolean, error: string | null) {
    loading = nextLoading
    currentError = error
    dependencies.onStateChange?.({ loading, error: currentError })
  }

  async function run(
    phoneInput: string,
    operation: (phone: string) => Promise<PhoneOtpProviderResult>,
    fallback: string,
  ): Promise<PhoneOtpResult> {
    if (loading) return { ok: false }
    const phone = dependencies.normalize(phoneInput)
    if (!phone) {
      update(false, 'Please enter a valid phone number')
      return { ok: false }
    }
    update(true, null)
    try {
      const result = await operation(phone)
      if (result.error) throw new Error(result.error.message || fallback)
      return { ok: true, phone }
    } catch (error) {
      update(true, error instanceof Error ? error.message : fallback)
      return { ok: false }
    } finally {
      update(false, currentError)
    }
  }

  return {
    sendOtp: (phoneInput: string) => run(
      phoneInput,
      phoneNumber => dependencies.send({ phoneNumber }),
      'Failed to send code. Check your number and try again.',
    ),
    verifyOtp: (phoneInput: string, code: string) => {
      const trimmedCode = code.trim()
      if (trimmedCode.length !== 6) {
        dependencies.onStateChange?.({ loading, error: 'Please enter a 6-digit code' })
        return Promise.resolve<PhoneOtpResult>({ ok: false })
      }
      return run(
        phoneInput,
        phoneNumber => dependencies.verify({ phoneNumber, code: trimmedCode }),
        'Invalid or expired code. Please try again.',
      )
    },
    get loading() { return loading },
  }
}
