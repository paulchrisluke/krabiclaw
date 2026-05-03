import { defineEventHandler, toWebRequest } from 'h3'
import { getPageContent, getDraftContent } from '~/server/utils/content-management'
import { isAdminRequest } from '~/server/utils/admin-auth'
import { cloudflareEnv } from '~/server/utils/api-response'

export default defineEventHandler(async (event) => {
  const page = event.context.params?.page || 'home'
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB

  // Handle missing database in development
  if (!db) {
    return {
      content: [
        { id: '1', page, field: 'hero', content: null, hero_title: 'Take Me Away by KIKUZUKI', hero_subtitle: 'Authentic Japanese Robatayaki Experience in Krabi', hero_video_url: null, updated_at: new Date().toISOString() }
      ],
      hasDrafts: false
    }
  }

  const isAdmin = await isAdminRequest(toWebRequest(event), env)

  const publishedContent = await getPageContent(db, page)

  if (isAdmin) {
    const drafts = await getDraftContent(db, page)
    const mergedContent = [...publishedContent]
    for (const draft of drafts) {
      const index = mergedContent.findIndex(c => c.field === draft.field)
      if (index !== -1) {
        mergedContent[index] = { ...mergedContent[index], ...draft }
      } else {
        mergedContent.push(draft)
      }
    }
    return { content: mergedContent, hasDrafts: drafts.length > 0 }
  }

  return { content: publishedContent, hasDrafts: false }
})
