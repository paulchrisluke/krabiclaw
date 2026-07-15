// Read-only diagnostic: reports a breakdown of the platform knowledge corpus by record
// type before any surface-expansion or upload happens, plus the raw static config array
// lengths for comparison. Secret-gated like the other server/api/internal/search/* routes —
// even though the counts alone are low-sensitivity, this still triggers a real D1 query
// (buildPlatformKnowledgeDocuments) on every request and shouldn't be a public,
// unauthenticated way to do that.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { validateInternalRequest } from '~/server/utils/internal-secret'
import { buildPlatformKnowledgeDocuments } from '~/server/utils/public-search'
import {
  PLATFORM_KNOWLEDGE_FAQ_ENTRIES,
  PLATFORM_KNOWLEDGE_ROUTE_ENTRIES,
  PLATFORM_KNOWLEDGE_PAGE_ENTRIES,
  PLATFORM_DASHBOARD_ROUTE_ENTRIES,
} from '~/config/platform-knowledge'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  if (!env.db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const validation = await validateInternalRequest(event, env)
  if (!validation.ok) return jsonResponse({ error: validation.error }, { status: validation.status })

  const staticCounts = {
    faqEntries: PLATFORM_KNOWLEDGE_FAQ_ENTRIES.length,
    routeEntries: PLATFORM_KNOWLEDGE_ROUTE_ENTRIES.length,
    pageEntries: PLATFORM_KNOWLEDGE_PAGE_ENTRIES.length,
    dashboardEntries: PLATFORM_DASHBOARD_ROUTE_ENTRIES.length,
  }

  try {
    const baseRecords = await buildPlatformKnowledgeDocuments(env.db)
    const byType: Record<string, number> = {}
    for (const record of baseRecords) {
      byType[record.type] = (byType[record.type] ?? 0) + 1
    }
    return jsonResponse({ ok: true, totalBaseRecords: baseRecords.length, byType, staticCounts })
  } catch (error) {
    console.error('Failed to build corpus stats:', error)
    return jsonResponse({ error: 'Failed to build corpus' }, { status: 500 })
  }
})
