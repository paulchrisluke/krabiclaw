export type ExperienceCtaAction = 'book' | 'contact'

export interface ExperienceDetailCta {
  action: ExperienceCtaAction
  label: string
  to?: string
}

interface ExperienceCtaInput {
  status?: string | null
  availabilityState?: string | null
  locationClosed?: boolean
  bookLabel: string
  contactLabel: string
  contactUrl: string
}

const CTA_BLOCKED_AVAILABILITY_STATES = new Set([
  'sold_out',
  'full',
  'no_slots',
  'temporarily_unavailable',
  'inactive',
])

/**
 * Resolve the single primary conversion action shared by the responsive
 * experience-detail placements. Availability state is canonical server data;
 * labels and the inquiry destination are supplied by the caller's content and
 * localization contracts.
 */
export function resolveExperienceDetailCta(input: ExperienceCtaInput): ExperienceDetailCta | null {
  if (input.status === 'sold_out' || input.locationClosed) return null
  if (input.availabilityState === 'inquiry_only') {
    return { action: 'contact', label: input.contactLabel, to: input.contactUrl }
  }
  if (CTA_BLOCKED_AVAILABILITY_STATES.has(input.availabilityState ?? '')) return null
  return { action: 'book', label: input.bookLabel }
}

export function resolveExperienceAvailabilityMessage(
  availabilityState: string | null | undefined,
  labels: { fullyBooked: string; notScheduled: string; temporarilyUnavailable: string },
): string | null {
  switch (availabilityState) {
    case 'full': return labels.fullyBooked
    case 'no_slots': return labels.notScheduled
    case 'temporarily_unavailable': return labels.temporarilyUnavailable
    default: return null
  }
}

export function buildExperienceContactUrl(
  experienceId: string | null | undefined,
  experienceTitle: string | null | undefined,
): string {
  if (!experienceId) return '/contact'
  const params = new URLSearchParams({
    experienceId,
    experienceTitle: experienceTitle ?? '',
  })
  return `/contact?${params.toString()}`
}
