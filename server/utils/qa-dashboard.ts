import { queryAll, type DbClient } from '~/server/db'
import { listQa } from '~/server/utils/location-qa'

export async function getTenantPages(db: DbClient, siteId: string): Promise<Array<{ path: string; title: string }>> {
  const rows = await queryAll<{ path: string; title: string }>(db,
    `SELECT v.path AS path, v.title
     FROM tenant_page_variants v
     WHERE v.site_id = ?
     ORDER BY v.title ASC`,
    [siteId],
  )
  return rows ?? []
}

export async function getQaScopes(db: DbClient, siteId: string): Promise<Array<{ page_path: string | null }>> {
  const rows = await queryAll<{ page_path: string | null }>(db,
    `SELECT DISTINCT page_path
     FROM location_qa
     WHERE site_id = ? AND location_id IS NULL
     ORDER BY page_path ASC`,
    [siteId],
  )
  return rows ?? []
}

export async function getSiteQa(
  db: DbClient,
  siteId: string,
  pagePath: string | null,
): Promise<Array<{
  id: string
  question: string
  answer: string | null
  status: 'published' | 'hidden'
  sort_order: number
  page_path: string | null
}>> {
  const rows = await listQa(db, siteId, null, false, pagePath)
  return (rows ?? []).map(row => ({
    id: row.id as string,
    question: row.question as string,
    answer: (row.answer as string | null) ?? null,
    status: (row.status as 'published' | 'hidden') ?? 'published',
    sort_order: (row.sort_order as number) ?? 0,
    page_path: (row.page_path as string | null) ?? null,
  }))
}
