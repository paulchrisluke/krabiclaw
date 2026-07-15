// Read-only diagnostic: reports a breakdown of the platform knowledge corpus by record
// type before any surface-expansion or upload happens, plus the raw static config array
// lengths for comparison. Numeric counts only, no content — safe to leave unauthenticated.
// Added to test whether static FAQ/route/page/dashboard entries (from
// config/platform-knowledge.ts) actually make it into buildPlatformKnowledgeDocuments()'s
// output at all, since every search result seen in production so far has been type
// 'doc' or 'blog' (DB-driven) — never 'faq'/'route'/'platform_page'/'dashboard_route'.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
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
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    return jsonResponse({ error: 'Failed to build corpus', detail, staticCounts }, { status: 500 })
  }
})
