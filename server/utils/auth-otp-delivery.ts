export function scheduleOtpDelivery(
  delivery: Promise<unknown>,
  waitUntil?: (task: Promise<unknown>) => void,
  log: (message: string) => void = message => console.error(message),
) {
  const guarded = delivery.catch((error) => {
    void error
    log('whatsapp_otp_delivery_failed')
  })
  if (waitUntil) waitUntil(guarded)
  else void guarded
}
