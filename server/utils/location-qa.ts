export interface CreateLocationQaInput {
  question: string
  answer?: string | null
  question_author?: string | null
  is_owner_answer?: boolean
  sort_order?: number
}

export async function listLocationQa(
  db: D1Database,
  siteId: string,
  locationId: string,
) {
  const { results } = await db.prepare(`
    SELECT *
    FROM location_qa
    WHERE location_id = ? AND site_id = ?
    ORDER BY is_owner_answer DESC, upvote_count DESC, sort_order, created_at
  `).bind(locationId, siteId).all()

  return results ?? []
}

export async function createLocationQa(
  db: D1Database,
  organizationId: string,
  siteId: string,
  locationId: string,
  input: CreateLocationQaInput,
) {
  const question = input.question.trim()
  if (!question) {
    return { status: 400, data: { error: 'question required' } }
  }

  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  await db.prepare(`
    INSERT INTO location_qa (
      id, organization_id, site_id, location_id, question, question_author,
      answer, is_owner_answer, source, sort_order, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?)
  `).bind(
    id,
    organizationId,
    siteId,
    locationId,
    question,
    input.question_author ?? null,
    input.answer ?? null,
    input.is_owner_answer === false ? 0 : 1,
    input.sort_order ?? 0,
    now,
    now,
  ).run()

  return { status: 201, data: { id, created: true } }
}

export async function deleteLocationQa(
  db: D1Database,
  siteId: string,
  locationId: string,
  qaId: string,
) {
  const result = await db.prepare(`
    DELETE FROM location_qa
    WHERE id = ? AND location_id = ? AND site_id = ?
  `).bind(qaId, locationId, siteId).run()

  if (!result.meta.changes) {
    return { status: 404, data: { error: 'Q&A not found' } }
  }

  return { status: 200, data: { qa_id: qaId, deleted: true } }
}
