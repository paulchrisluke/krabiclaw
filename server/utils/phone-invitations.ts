import { parsePhoneOrThrow } from '~/utils/phone'

const PHONE_INVITE_EMAIL_PATTERN = /^phone-(\d+)@phone\.krabiclaw\.local$/i

export function phoneTemporaryEmail(phone: string): string {
  const digits = parsePhoneOrThrow(phone, { defaultCountry: 'TH' }).replace(/\D/g, '')
  return `phone-${digits}@phone.krabiclaw.local`
}

export function isPhoneInvitationEmail(email: string): boolean {
  return PHONE_INVITE_EMAIL_PATTERN.test(email)
}

export function phoneDigitsFromInvitationEmail(email: string): string | null {
  return email.match(PHONE_INVITE_EMAIL_PATTERN)?.[1] ?? null
}
