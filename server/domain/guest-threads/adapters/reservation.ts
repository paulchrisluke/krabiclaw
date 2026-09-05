import { queryFirst } from '~/server/db'
import type {
  AdapterLoadContext,
  GuestThreadSourceAdapter,
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

export type ReservationAction = 'confirm' | 'cancel' | 'complete'

const RESERVATION_TRANSITIONS: Record<string, ReservationAction[]> = {
  new: ['confirm', 'cancel'],
  confirmed: ['complete', 'cancel'],
  completed: [],
  cancelled: [],
}

function normalizePreview(text: string | null | undefined, maxLength = 160): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

export const reservationAdapter: GuestThreadSourceAdapter<ReservationSource, ReservationAction> = {
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
