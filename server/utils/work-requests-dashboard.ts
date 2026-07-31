import { queryAll, type DbClient } from '~/server/db'

export interface WorkRequest {
  id: string
  type: string
  title: string
  status: string
  notes: string | null
  created_at: string
}

export async function listWorkRequests(db: DbClient, organizationId: string): Promise<WorkRequest[]> {
  const rows = await queryAll<WorkRequest>(db,
    `SELECT id, type, title, status, notes, created_at
     FROM work_requests
     WHERE organization_id = ?
     ORDER BY created_at DESC`,
    [organizationId],
  )
  return rows ?? []
}
