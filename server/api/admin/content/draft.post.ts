import { defineEventHandler, readBody, createError, toWebRequest } from 'h3'
import { isAdminRequest } from '~/server/utils/admin-auth'
import { buildUpsertDraftStmt } from '~/server/utils/content-management'
import { cloudflareEnv } from '~/server/utils/api-response'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)

  const body = await readBody(event)
  const { path, changes } = body

  if (!await isAdminRequest(toWebRequest(event), env)) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  if (!path || !changes) {
    throw createError({ statusCode: 400, statusMessage: 'Missing path or changes' })
  }

  const page = path === '/' ? 'home' : path.replace(/^\//, '').replace(/\//g, '-')
  const db = env.REVIEWS_DB

  if (!db) {
    throw createError({ 
      statusCode: 500, 
      statusMessage: 'Database not available. Ensure you are running with Wrangler or D1 binding is configured.' 
    })
  }

  try {
    const stmts = []
    const heroFields = ['hero.title', 'hero.subtitle', 'hero.video']
    const heroChange: Record<string, string | null> = {}
    let hasHeroChange = false

    for (const [field, value] of Object.entries(changes as Record<string, string>)) {
      if (heroFields.includes(field)) {
        hasHeroChange = true
        if (field === 'hero.title')    heroChange.hero_title    = value || null
        if (field === 'hero.subtitle') heroChange.hero_subtitle = value || null
        if (field === 'hero.video')    heroChange.hero_video_url = value || null
      } else {
        stmts.push(buildUpsertDraftStmt(db, {
          id: `${page}-${field}`,
          page,
          field,
          content: typeof value === 'string' ? value : JSON.stringify(value)
        }))
      }
    }

    if (hasHeroChange) {
      stmts.push(buildUpsertDraftStmt(db, {
        id: `${page}-hero`,
        page,
        field: 'hero',
        content: null,
        ...heroChange
      }))
    }
    
    if (stmts.length > 0) {
      await db.batch(stmts)
    }
    
    return { success: true }
  } catch (err: any) {
    console.error('[draft.post.ts] Failed to save drafts:', err)
    throw createError({ statusCode: 500, statusMessage: err.message || 'Database error' })
  }
})
