import { hasEntitlement } from '~/server/utils/billing'

type SetupEnv = Parameters<typeof hasEntitlement>[0]

export type WorkRequestType =
  | 'content_update'
  | 'menu_update'
  | 'translation'
  | 'seo'
  | 'google_business'
  | 'seasonal'
  | 'photo_update'
  | 'social_media'
  | 'technical'
  | 'other'

export type WorkRequestPriority = 'low' | 'normal' | 'high' | 'urgent'
export type WorkRequestSource = 'dashboard' | 'chowbot' | 'whatsapp'

export const VALID_WORK_REQUEST_TYPES: WorkRequestType[] = [
  'content_update',
  'menu_update',
  'translation',
  'seo',
  'google_business',
  'seasonal',
  'photo_update',
  'social_media',
  'technical',
  'other',
]

export const VALID_WORK_REQUEST_PRIORITIES: WorkRequestPriority[] = ['low', 'normal', 'high', 'urgent']

export async function createWorkRequest(
  env: SetupEnv,
  db: D1Database,
  organizationId: string,
  siteId: string | null,
  input: {
    type: string
    title: string
    description?: string | null
    priority?: string | null
    source?: WorkRequestSource
  },
) {
  const type = input.type as WorkRequestType
  const title = input.title.trim()
  const description = input.description?.trim() || null
  const priority = (input.priority as WorkRequestPriority | undefined) ?? 'normal'
  const source = input.source ?? 'dashboard'

  if (!(await hasEntitlement(env, db, organizationId, 'managed_service'))) {
    return { status: 403, data: { error: 'Work requests require a managed-service plan.' } }
  }
  if (!VALID_WORK_REQUEST_TYPES.includes(type)) {
    return {
      status: 400,
      data: { error: `Invalid type. Must be one of: ${VALID_WORK_REQUEST_TYPES.join(', ')}` },
    }
  }
  if (!title) {
    return { status: 400, data: { error: 'Title is required' } }
  }
  if (!VALID_WORK_REQUEST_PRIORITIES.includes(priority)) {
    return { status: 400, data: { error: 'Invalid priority' } }
  }

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await db.prepare(`
    INSERT INTO work_requests (
      id, organization_id, site_id, type, title, description, priority, source, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    organizationId,
    siteId,
    type,
    title,
    description,
    priority,
    source,
    now,
    now,
  ).run()

  return { status: 201, data: { success: true, id } }
}
