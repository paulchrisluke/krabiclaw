import { contactAdapter } from './contact'
import { reservationAdapter } from './reservation'
import { experienceBookingAdapter } from './experience-booking'
import type { AnyGuestThreadSourceAdapter, GuestThreadSubmissionType } from '../types'

const ADAPTERS: Record<GuestThreadSubmissionType, AnyGuestThreadSourceAdapter> = {
  contact: contactAdapter as AnyGuestThreadSourceAdapter,
  reservation: reservationAdapter as AnyGuestThreadSourceAdapter,
  experience_booking: experienceBookingAdapter as AnyGuestThreadSourceAdapter,
}

export function getAdapter(type: GuestThreadSubmissionType): AnyGuestThreadSourceAdapter {
  const adapter = ADAPTERS[type]
  if (!adapter) throw new Error(`No guest-thread source adapter registered for type "${type}"`)
  return adapter
}

export function listSupportedSubmissionTypes(): GuestThreadSubmissionType[] {
  return Object.keys(ADAPTERS) as GuestThreadSubmissionType[]
}
