import { queryFirst } from '~/server/db'
import { updateBookingStatusForSite } from '~/server/utils/experiences'
import type {
  AdapterLoadContext,
  GuestThreadSourceAdapter,
  OperationExecutionContext,
  OperationExecutionResult,
  ThreadDetailSourceModel,
  ThreadSummaryProjection,
} from '../types'
import { formatOperationalStatusLabel } from '../status-labels'

export interface ExperienceBookingSource {
  id: string
  organization_id: string
  site_id: string
  location_id: string | null
  guest_name: string
  guest_email: string
  guest_phone: string | null
  booking_date: string
  time_slot: string
  party_size: number
  notes: string | null
  status: string
  created_at: string
  location_title: string | null
  experience_title: string | null
}

export interface ExperienceBookingOpeningSnapshot {
  schemaVersion: 1
  submissionType: 'experience_booking'
  submissionId: string
  guestName: string
  guestEmail: string
  guestPhone: string | null
  locationTitle: string | null
  experienceTitle: string | null
  bookingDate: string
  timeSlot: string
  partySize: number
  notes: string | null
  submittedAt: string
}

export type ExperienceBookingAction = 'confirm' | 'cancel'

// updateBookingStatusForSite only supports pending/confirmed/cancelled — there is no
// backend-supported "complete" transition for experience bookings through the canonical
// operation path (that state is only reachable via the separate, out-of-scope
// complete.post.ts route). This is "the equivalent supported source states" referenced
// by issue #442 Locked Decision #7.
const EXPERIENCE_BOOKING_TRANSITIONS: Record<string, ExperienceBookingAction[]> = {
  pending: ['confirm', 'cancel'],
  confirmed: ['cancel'],
  completed: [],
  cancelled: [],
}

const EXPERIENCE_BOOKING_ACTION_TARGET_STATUS: Record<ExperienceBookingAction, 'confirmed' | 'cancelled'> = {
  confirm: 'confirmed',
  cancel: 'cancelled',
}

function normalizePreview(text: string | null | undefined, maxLength = 160): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

export const experienceBookingAdapter: GuestThreadSourceAdapter<ExperienceBookingSource, ExperienceBookingOpeningSnapshot, ExperienceBookingAction> = {
  type: 'experience_booking',

  async loadSource(ctx: AdapterLoadContext, submissionId: string): Promise<ExperienceBookingSource | null> {
    return await queryFirst<ExperienceBookingSource>(ctx.db, `
      SELECT
        eb.id,
        eb.organization_id,
        eb.site_id,
        eb.location_id,
        eb.guest_name,
        eb.guest_email,
        eb.guest_phone,
        eb.booking_date,
        eb.time_slot,
        eb.party_size,
        eb.notes,
        eb.status,
        eb.created_at,
        bl.title AS location_title,
        p.name AS experience_title
      FROM experience_bookings eb
      LEFT JOIN business_locations bl ON bl.id = eb.location_id
      LEFT JOIN products p ON p.id = eb.experience_id
      WHERE eb.id = ?
      LIMIT 1
    `, [submissionId])
  },

  createOpeningSnapshot(source: ExperienceBookingSource): ExperienceBookingOpeningSnapshot {
    return {
      schemaVersion: 1,
      submissionType: 'experience_booking',
      submissionId: source.id,
      guestName: source.guest_name,
      guestEmail: source.guest_email,
      guestPhone: source.guest_phone,
      locationTitle: source.location_title,
      experienceTitle: source.experience_title,
      bookingDate: source.booking_date,
      timeSlot: source.time_slot,
      partySize: source.party_size,
      notes: source.notes,
      submittedAt: source.created_at,
    }
  },

  summarize(source: ExperienceBookingSource): ThreadSummaryProjection {
    return {
      guestName: source.guest_name,
      guestEmail: source.guest_email,
      guestPhone: source.guest_phone,
      organizationId: source.organization_id,
      siteId: source.site_id,
      locationId: source.location_id,
      locationTitle: source.location_title,
      contextLabel: normalizePreview(`${source.experience_title ?? 'Experience'} · ${source.booking_date} ${source.time_slot} · ${source.party_size} guests${source.notes ? ` · ${source.notes}` : ''}`),
      createdAt: source.created_at,
      operationalStatus: source.status,
    }
  },

  getOperationalStatus(source: ExperienceBookingSource): string {
    return source.status
  },

  getOperationalStatusLabel(status: string): string {
    return formatOperationalStatusLabel('experience_booking', status)
  },

  listAvailableActions(source: ExperienceBookingSource): ExperienceBookingAction[] {
    return EXPERIENCE_BOOKING_TRANSITIONS[source.status] ?? []
  },

  async executeAction(ctx: OperationExecutionContext, source: ExperienceBookingSource, action: ExperienceBookingAction): Promise<OperationExecutionResult> {
    const allowed = EXPERIENCE_BOOKING_TRANSITIONS[source.status] ?? []
    if (!allowed.includes(action)) {
      return { ok: false, reason: 'invalid_transition', message: `Cannot ${action} a booking in status "${source.status}"` }
    }

    const targetStatus = EXPERIENCE_BOOKING_ACTION_TARGET_STATUS[action]
    const updated = await updateBookingStatusForSite(ctx.db, source.site_id, source.id, targetStatus)
    if (!updated) {
      return { ok: false, reason: 'not_found', message: 'Booking not found' }
    }

    const requiresNotification = action === 'confirm' || action === 'cancel'

    return {
      ok: true,
      beforeStatus: source.status,
      afterStatus: targetStatus,
      requiresNotification,
      notifyChannel: requiresNotification ? 'email' : null,
    }
  },

  buildCurrentDetail(source: ExperienceBookingSource): ThreadDetailSourceModel {
    return {
      submissionType: 'experience_booking',
      submissionId: source.id,
      operationalStatus: source.status,
      operationalStatusLabel: this.getOperationalStatusLabel(source.status),
      fields: {
        bookingDate: source.booking_date,
        timeSlot: source.time_slot,
        partySize: source.party_size,
        notes: source.notes,
        locationTitle: source.location_title,
        experienceTitle: source.experience_title,
      },
    }
  },
}
