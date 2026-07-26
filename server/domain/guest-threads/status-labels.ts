import type { GuestThreadSubmissionType } from './types'

const OPERATIONAL_STATUS_LABELS: Record<GuestThreadSubmissionType, Record<string, string>> = {
  contact: {},
  reservation: {
    new: 'Pending',
    pending: 'Pending',
    confirmed: 'Confirmed',
    completed: 'Completed',
    cancelled: 'Cancelled',
  },
  experience_booking: {
    pending: 'Pending',
    confirmed: 'Confirmed',
    completed: 'Completed',
    cancelled: 'Cancelled',
  },
}

export function formatOperationalStatusLabel(type: GuestThreadSubmissionType, status: string): string {
  return OPERATIONAL_STATUS_LABELS[type][status]
    ?? status
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
}
