export interface PlatformSupportEmailEnv {
  PLATFORM_OWNER_EMAILS?: string
}

export function getPlatformSupportEmails(env: PlatformSupportEmailEnv): string[] {
  const recipients = String(env.PLATFORM_OWNER_EMAILS || '')
    .split(',')
    .map(email => email.trim())
    .filter(Boolean)

  return recipients.length > 0 ? recipients : ['hello@krabiclaw.com']
}
