export type BookingPolicySummaryType = 'reservation' | 'experience'

export interface BookingPolicySummarySource {
  policy_type: BookingPolicySummaryType
  booking_window_days: number | null
  advance_notice_minutes: number | null
  free_cancellation_until_minutes: number | null
  late_arrival_grace_minutes: number | null
  host_confirmation_sla_minutes: number | null
  reschedule_allowed: boolean
  reschedule_cutoff_minutes: number | null
  deposit_required: boolean
  deposit_trigger_party_size: number | null
  special_requests_allowed: boolean
  weather_policy: string | null
  minimum_guest_age: number | null
  accessibility_contact_required: boolean
  additional_notes_html: string | null
}

export interface FormattedBookingPolicySummaryItem {
  id: string
  text: string
}

export interface FormattedBookingPolicySummary {
  heading: string
  items: FormattedBookingPolicySummaryItem[]
  additional_notes_html: string | null
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

  if (policy.host_confirmation_sla_minutes) {
    items.push({
      id: 'host_confirmation_sla',
      text: th
        ? `ทีมงานยืนยันการจองภายใน ${formatMinutes(policy.host_confirmation_sla_minutes, locale)} โดยปกติภายในวันเดียวกัน`
        : `Our team confirms by email, usually within ${formatMinutes(policy.host_confirmation_sla_minutes, locale)}, always the same day.`,
    })
  }

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

  if (policy.late_arrival_grace_minutes) {
    items.push({
      id: 'late_arrival',
      text: policy.policy_type === 'experience'
        ? (th
            ? `เราถือสิทธิ์การจองไว้ ${formatMinutes(policy.late_arrival_grace_minutes, locale)} หลังเวลาเริ่ม กรุณาติดต่อหากมาช้า`
            : `We hold your spot for ${formatMinutes(policy.late_arrival_grace_minutes, locale)} after the scheduled start. Running late? Just call.`)
        : (th
            ? `เราถือโต๊ะไว้ ${formatMinutes(policy.late_arrival_grace_minutes, locale)} หลังเวลาจอง กรุณาติดต่อหากมาช้า`
            : `We hold the table for ${formatMinutes(policy.late_arrival_grace_minutes, locale)} past the booked time. Running late? Just call.`),
    })
  }

  if (policy.deposit_required) {
    items.push({
      id: 'deposit',
      text: policy.deposit_trigger_party_size
        ? (th
            ? `กลุ่มตั้งแต่ ${policy.deposit_trigger_party_size} ท่านขึ้นไปอาจต้องวางมัดจำ`
            : `Parties of ${policy.deposit_trigger_party_size}+ guests may require a deposit.`)
        : (th
            ? 'อาจต้องวางมัดจำก่อนยืนยันการจอง'
            : 'A deposit may be required before confirmation.'),
    })
  }

  if (policy.special_requests_allowed) {
    items.push({
      id: 'special_requests',
      text: th
        ? 'สามารถแจ้งคำขอพิเศษได้ล่วงหน้า แล้วทีมงานจะยืนยันให้ตามความพร้อม'
        : 'Special requests can be shared in advance and are confirmed subject to availability.',
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

  if (policy.policy_type === 'experience' && policy.weather_policy) {
    items.push({
      id: 'weather_policy',
      text: th
        ? `สภาพอากาศ: ${policy.weather_policy}`
        : `Weather: ${policy.weather_policy}`,
    })
  }

  return {
    heading: th
      ? (policy.policy_type === 'experience' ? 'นโยบายประสบการณ์' : 'นโยบายการจอง')
      : (policy.policy_type === 'experience' ? 'Experience policies' : 'Reservation policies'),
    items,
    additional_notes_html: policy.additional_notes_html,
  }
}
