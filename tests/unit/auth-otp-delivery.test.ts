import assert from 'node:assert/strict'
import test from 'node:test'
import { scheduleOtpDelivery } from '../../server/utils/auth-otp-delivery.ts'

test('OTP delivery is scheduled on the request execution context', async () => {
  let scheduled: Promise<unknown> | undefined
  scheduleOtpDelivery(Promise.resolve('sent'), promise => { scheduled = promise })
  assert.ok(scheduled)
  await scheduled
})

test('detached OTP delivery failures are logged without rejecting authentication', async () => {
  const failures: string[] = []
  scheduleOtpDelivery(Promise.reject(new Error('provider down')), undefined, message => failures.push(message))
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(failures, ['whatsapp_otp_delivery_failed'])
})
