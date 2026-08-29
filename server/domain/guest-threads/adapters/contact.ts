import { queryFirst } from '~/server/db'
import type {
  AdapterLoadContext,
  GuestThreadSourceAdapter,
  OperationExecutionContext,
  OperationExecutionResult,
  ThreadDetailSourceModel,
  ThreadSummaryProjection,
} from '../types'
import { formatOperationalStatusLabel } from '../status-labels'

export interface ContactSource {
  id: string
  organization_id: string
  site_id: string
  location_id: string | null
  name: string
  email: string
  subject: string | null
  message: string
  status: string
  created_at: string
  location_title: string | null
  experience_title: string | null
}

export interface ContactOpeningSnapshot {
  schemaVersion: 1
  submissionType: 'contact'
  submissionId: string
  guestName: string
  guestEmail: string
  subject: string | null
  message: string
  locationTitle: string | null
  experienceTitle: string | null
  submittedAt: string
}

// Contact submissions have zero operational actions (issue #442 Locked Decision #2) —
// reading and replying are conversation semantics, not lifecycle transitions.
export type ContactAction = never

function normalizePreview(text: string | null | undefined, maxLength = 160): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

export const contactAdapter: GuestThreadSourceAdapter<ContactSource, ContactOpeningSnapshot, ContactAction> = {
  type: 'contact',

  async loadSource(ctx: AdapterLoadContext, submissionId: string): Promise<ContactSource | null> {
    return await queryFirst<ContactSource>(ctx.db, `
      SELECT
        ct.id,
        ct.organization_id,
        ct.site_id,
        COALESCE(ct.location_id, e.location_id) AS location_id,
        ct.name,
        ct.email,
        ct.subject,
        ct.message,
        ct.status,
        ct.created_at,
        bl.title AS location_title,
        p.name AS experience_title
      FROM contact_submissions ct
      LEFT JOIN experiences e ON e.id = ct.experience_id
      LEFT JOIN products p ON p.id = e.id
      LEFT JOIN business_locations bl ON bl.id = COALESCE(ct.location_id, e.location_id)
      WHERE ct.id = ?
      LIMIT 1
    `, [submissionId])
  },

  createOpeningSnapshot(source: ContactSource): ContactOpeningSnapshot {
    return {
      schemaVersion: 1,
      submissionType: 'contact',
      submissionId: source.id,
      guestName: source.name,
      guestEmail: source.email,
      subject: source.subject,
      message: source.message,
      locationTitle: source.location_title,
      experienceTitle: source.experience_title,
      submittedAt: source.created_at,
    }
  },

  summarize(source: ContactSource): ThreadSummaryProjection {
    return {
      guestName: source.name,
      guestEmail: source.email,
      guestPhone: null,
      organizationId: source.organization_id,
      siteId: source.site_id,
      locationId: source.location_id,
      locationTitle: source.location_title,
      contextLabel: normalizePreview(source.experience_title ? `Re: ${source.experience_title} · ${source.message}` : source.message),
      createdAt: source.created_at,
      operationalStatus: source.status,
    }
  },

  getOperationalStatus(source: ContactSource): string {
    return source.status
  },

  getOperationalStatusLabel(status: string): string {
    return formatOperationalStatusLabel('contact', status)
  },

  listAvailableActions(): ContactAction[] {
    return []
  },

  async executeAction(_ctx: OperationExecutionContext, _source: ContactSource): Promise<OperationExecutionResult> {
    return { ok: false, reason: 'invalid_transition', message: 'Contact submissions have no operational actions' }
  },

  buildCurrentDetail(source: ContactSource): ThreadDetailSourceModel {
    return {
      submissionType: 'contact',
      submissionId: source.id,
      operationalStatus: source.status,
      operationalStatusLabel: this.getOperationalStatusLabel(source.status),
      fields: {
        subject: source.subject,
        message: source.message,
        locationTitle: source.location_title,
        experienceTitle: source.experience_title,
      },
    }
  },
}
