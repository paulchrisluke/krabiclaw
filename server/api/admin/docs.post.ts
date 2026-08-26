import { defineHandler } from 'nitro';
// POST /api/admin/docs - Create platform doc
import { cloudflareEnv, jsonResponse, readRequiredBody } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { platformPermissionJsonResponse } from '~/server/utils/platform-admin-users'
import { createPlatformDoc } from '~/server/utils/platform-content'
import { platformContentNavInput } from '~/server/utils/platform-content-request'
import { schedulePlatformKnowledgeIndexRebuild } from '~/server/utils/platform-search-rebuild'

import type { PlatformDocRequestBody } from '~/server/types/platform-content'

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const permissionDenied = await platformPermissionJsonResponse(event, env, { platform: ['content'] })
  if (permissionDenied) return permissionDenied

  let body: PlatformDocRequestBody
  try { body = await readRequiredBody<PlatformDocRequestBody>(event) } catch {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const result = await createPlatformDoc(db, session.user.id, {
      title: body.title ?? '', content_blocks: body.content_blocks ?? [], excerpt: body.excerpt ?? null, category: body.category ?? null, ...platformContentNavInput(body, { defaultHideFromNav: false }), seo_description: body.seo_description ?? null, seo_keywords: body.seo_keywords ?? null, canonical_url: body.canonical_url ?? null, robots: body.robots ?? null, difficulty_level: body.difficulty_level ?? null, sort_order: body.sort_order ?? 0, media: body.media, })
    schedulePlatformKnowledgeIndexRebuild(event, env, 'doc create')
    return jsonResponse(result)
  } catch (err) {
    const statusCode = typeof (err as { statusCode?: unknown })?.statusCode === 'number' ? Number((err as { statusCode: number }).statusCode) : 500
    const message = err instanceof Error ? err.message : 'Failed to create doc'
    if (statusCode >= 500) console.error('Failed to create doc:', err)
    return jsonResponse({ error: message }, { status: statusCode })
  }
})
