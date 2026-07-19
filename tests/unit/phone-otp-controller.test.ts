import assert from 'node:assert/strict'
import test from 'node:test'
import { createPhoneOtpController } from '../../shared/auth/phone-otp-controller.ts'

test('phone OTP verification normalizes identity and excludes navigation fields', async () => {
  const verifyBodies: Array<Record<string, unknown>> = []
  const controller = createPhoneOtpController({
    normalize: () => '+66812345678',
    send: async () => ({ error: null }),
    verify: async body => {
      verifyBodies.push(body)
      return { error: null }
    },
  })

  const result = await controller.verifyOtp('081 234 5678', '123456')
  assert.deepEqual(result, { ok: true, phone: '+66812345678' })
  assert.deepEqual(verifyBodies, [{ phoneNumber: '+66812345678', code: '123456' }])
})

test('phone OTP controller rejects invalid input and locks concurrent requests', async () => {
  let release!: () => void
  let sends = 0
  const pending = new Promise<void>(resolve => { release = resolve })
  const controller = createPhoneOtpController({
    normalize: value => value === 'valid' ? '+66812345678' : null,
    send: async () => {
      sends++
      await pending
      return { error: null }
    },
    verify: async () => ({ error: null }),
  })

  assert.deepEqual(await controller.sendOtp('invalid'), { ok: false })
  const first = controller.sendOtp('valid')
  assert.deepEqual(await controller.sendOtp('valid'), { ok: false })
  release()
  assert.deepEqual(await first, { ok: true, phone: '+66812345678' })
  assert.equal(sends, 1)
})

test('phone OTP verification rejects non-numeric six-character codes locally', async () => {
  let verifications = 0
  let latestError: string | null = null
  const controller = createPhoneOtpController({
    normalize: () => '+66812345678',
    send: async () => ({ error: null }),
    verify: async () => {
      verifications++
      return { error: null }
    },
    onStateChange: state => { latestError = state.error },
  })

  assert.deepEqual(await controller.verifyOtp('0812345678', '12ab56'), { ok: false })
  assert.equal(verifications, 0)
  assert.equal(latestError, 'Please enter a 6-digit code')
})

test('phone OTP provider failures settle once with loading false and the provider error', async () => {
  const states: Array<{ loading: boolean; error: string | null }> = []
  const controller = createPhoneOtpController({
    normalize: () => '+66812345678',
    send: async () => ({ error: { message: 'Provider unavailable' } }),
    verify: async () => ({ error: null }),
    onStateChange: state => { states.push({ ...state }) },
  })

  assert.deepEqual(await controller.sendOtp('0812345678'), { ok: false })
  assert.deepEqual(states, [
    { loading: true, error: null },
    { loading: false, error: 'Provider unavailable' },
  ])
})
