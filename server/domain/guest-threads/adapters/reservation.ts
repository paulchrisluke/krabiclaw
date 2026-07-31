import { queryFirst } from '~/server/db'
import { updateReservationSubmissionStatus } from '~/server/utils/mcp-workflows'
import type {
  AdapterLoadContext,
  GuestThreadSourceAdapter,
  OperationExecutionContext,
  OperationExecutionResult,
  ThreadDetailSourceModel,
  ThreadSummaryProjection,
} from '../types'
import { formatOperationalStatusLabel } from '../status-labels'

export interface ReservationSource {
  id: string
  organization_id: string
  site_id: string
  location_id: string | null
  name: string
  email: string
  phone: string | null
  date: string
  time: string
  guests: string
  requests: string | null
  status: string
  created_at: string
  location_title: string | null
}

export interface ReservationOpeningSnapshot {
  schemaVersion: 1
  submissionType: 'reservation'
  submissionId: string
  guestName: string
  guestEmail: string
  guestPhone: string | null
  locationTitle: string | null
  date: string
  time: string
  guests: string
  requests: string | null
  submittedAt: string
}

export type ReservationAction = 'confirm' | 'cancel' | 'complete'

// Locked Decision #7: fixed transition matrix. Terminal states (completed/cancelled)
// expose no actions.
const RESERVATION_TRANSITIONS: Record<string, ReservationAction[]> = {
  new: ['confirm', 'cancel'],
  confirmed: ['complete', 'cancel'],
  completed: [],
  cancelled: [],
}

const RESERVATION_ACTION_TARGET_STATUS: Record<ReservationAction, string> = {
  confirm: 'confirmed',
  cancel: 'cancelled',
  complete: 'completed',
}

function normalizePreview(text: string | null | undefined, maxLength = 160): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

export const reservationAdapter: GuestThreadSourceAdapter<ReservationSource, ReservationOpeningSnapshot, ReservationAction> = {
  type: 'reservation',

  async loadSource(ctx: AdapterLoadContext, submissionId: string): Promise<ReservationSource | null> {
    return await queryFirst<ReservationSource>(ctx.db, `
      SELECT
        rs.id,
        rs.organization_id,
        rs.site_id,
        rs.location_id,
        rs.name,
        rs.email,
        rs.phone,
        rs.date,
        rs.time,
        rs.guests,
        rs.requests,
        rs.status,
        rs.created_at,
        bl.title AS location_title
      FROM reservation_submissions rs
      LEFT JOIN business_locations bl ON bl.id = rs.location_id
      WHERE rs.id = ?
      LIMIT 1
    `, [submissionId])
  },

  createOpeningSnapshot(source: ReservationSource): ReservationOpeningSnapshot {
    return {
      schemaVersion: 1,
      submissionType: 'reservation',
      submissionId: source.id,
      guestName: source.name,
      guestEmail: source.email,
      guestPhone: source.phone,
      locationTitle: source.location_title,
      date: source.date,
      time: source.time,
      guests: source.guests,
      requests: source.requests,
      submittedAt: source.created_at,
    }
  },

  summarize(source: ReservationSource): ThreadSummaryProjection {
    return {
      guestName: source.name,
      guestEmail: source.email,
      guestPhone: source.phone,
      organizationId: source.organization_id,
      siteId: source.site_id,
      locationId: source.location_id,
      locationTitle: source.location_title,
      contextLabel: normalizePreview(`${source.date} ${source.time} · ${source.guests} guests${source.requests ? ` · ${source.requests}` : ''}`),
      createdAt: source.created_at,
      operationalStatus: source.status,
    }
  },

  getOperationalStatus(source: ReservationSource): string {
    return source.status
  },

  getOperationalStatusLabel(status: string): string {
    return formatOperationalStatusLabel('reservation', status)
  },

  listAvailableActions(source: ReservationSource): ReservationAction[] {
    return RESERVATION_TRANSITIONS[source.status] ?? []
  },

  async executeAction(ctx: OperationExecutionContext, source: ReservationSource, action: ReservationAction): Promise<OperationExecutionResult> {
    const allowed = RESERVATION_TRANSITIONS[source.status] ?? []
    if (!allowed.includes(action)) {
      return { ok: false, reason: 'invalid_transition', message: `Cannot ${action} a reservation in status "${source.status}"` }
    }

    const targetStatus = RESERVATION_ACTION_TARGET_STATUS[action]
    await updateReservationSubmissionStatus(ctx.db, source.site_id, source.id, targetStatus, { locationId: source.location_id })

    // Confirm/cancel trigger a guest-facing transactional notification; complete does not.
    const requiresNotification = action === 'confirm' || action === 'cancel'

    return {
      ok: true,
      beforeStatus: source.status,
      afterStatus: targetStatus,
      requiresNotification,
      notifyChannel: requiresNotification ? 'email' : null,
    }
  },

  buildCurrentDetail(source: ReservationSource): ThreadDetailSourceModel {
    return {
      submissionType: 'reservation',
      submissionId: source.id,
      operationalStatus: source.status,
      operationalStatusLabel: this.getOperationalStatusLabel(source.status),
      fields: {
        date: source.date,
        time: source.time,
        guests: source.guests,
        requests: source.requests,
        locationTitle: source.location_title,
      },
    }
  },
}
