export type BookingPolicySummaryType = 'reservation' | 'experience'

export interface BookingPolicySummarySource {
  policy_type: BookingPolicySummaryType
  advance_notice_minutes: number | null
  free_cancellation_until_minutes: number | null
  reschedule_allowed: boolean | null
  reschedule_cutoff_minutes: number | null
  deposit_required: boolean | null
  deposit_trigger_party_size: number | null
  minimum_guest_age: number | null
  accessibility_contact_required: boolean | null
}

export interface FormattedBookingPolicySummaryItem {
  id: string
  text: string
}

export interface FormattedBookingPolicySummary {
  heading: string
  items: FormattedBookingPolicySummaryItem[]
}

function isThaiLocale(locale: string) {
  return locale.toLowerCase().startsWith('th')
}

function formatMinutes(minutes: number, locale: string) {
  const th = isThaiLocale(locale)
  if (minutes % 1440 === 0) {
    const days = minutes / 1440
    return th ? `${days} วัน` : `${days} day${days === 1 ? '' : 's'}`
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60
    return th ? `${hours} ชั่วโมง` : `${hours} hour${hours === 1 ? '' : 's'}`
  }
  return th ? `${minutes} นาที` : `${minutes} minute${minutes === 1 ? '' : 's'}`
}

export function formatBookingPolicySummary(
  policy: BookingPolicySummarySource,
  locale = 'en',
  _vertical?: string | null,
): FormattedBookingPolicySummary {
  const th = isThaiLocale(locale)
  const items: FormattedBookingPolicySummaryItem[] = []

  if (policy.free_cancellation_until_minutes) {
    items.push({
      id: 'cancellation',
      text: policy.policy_type === 'experience'
        ? (th
            ? `ยกเลิกได้ฟรีล่วงหน้าสูงสุด ${formatMinutes(policy.free_cancellation_until_minutes, locale)} ก่อนเริ่มกิจกรรม`
            : `Free cancellation is available up to ${formatMinutes(policy.free_cancellation_until_minutes, locale)} before the experience starts.`)
        : (th
            ? `ยกเลิกได้ฟรีล่วงหน้าสูงสุด ${formatMinutes(policy.free_cancellation_until_minutes, locale)} ก่อนเวลาจอง`
            : `Change or cancel free up to ${formatMinutes(policy.free_cancellation_until_minutes, locale)} before your booking.`),
    })
  }

  if (policy.reschedule_allowed && policy.reschedule_cutoff_minutes) {
    items.push({
      id: 'reschedule',
      text: th
        ? `สามารถเปลี่ยนเวลาได้ล่วงหน้าสูงสุด ${formatMinutes(policy.reschedule_cutoff_minutes, locale)} ก่อนเวลาเริ่ม`
        : `You can reschedule up to ${formatMinutes(policy.reschedule_cutoff_minutes, locale)} before the start time.`,
    })
  }

  if (policy.deposit_required) {
    items.push({
      id: 'deposit',
      text: policy.deposit_trigger_party_size
        ? (th
            ? `กลุ่มตั้งแต่ ${policy.deposit_trigger_party_size} ท่านขึ้นไปอาจต้องวางมัดจำ`
            : `Parties of ${policy.deposit_trigger_party_size}+ guests may require a deposit.`)
        : (th ? 'อาจต้องวางมัดจำก่อนยืนยันการจอง' : 'A deposit may be required before confirmation.'),
    })
  }

  if (policy.policy_type === 'experience' && policy.minimum_guest_age) {
    items.push({
      id: 'minimum_guest_age',
      text: th
        ? `อายุขั้นต่ำสำหรับผู้เข้าร่วมคือ ${policy.minimum_guest_age} ปี`
        : `The minimum guest age is ${policy.minimum_guest_age}.`,
    })
  }

  if (policy.policy_type === 'experience' && policy.accessibility_contact_required) {
    items.push({
      id: 'accessibility',
      text: th
        ? 'หากต้องการการช่วยเหลือด้านการเข้าถึง โปรดติดต่อเราก่อนทำการจอง'
        : 'Please contact us before booking if you need accessibility arrangements.',
    })
  }

  return {
    heading: th
      ? (policy.policy_type === 'experience' ? 'นโยบายประสบการณ์' : 'นโยบายการจอง')
      : (policy.policy_type === 'experience' ? 'Experience policies' : 'Reservation policies'),
    items,
  }
}
