import { publishDueBlogPosts } from '~/server/utils/blog-publishing'

export default defineTask({
  meta: { name: 'blog-scheduled-publish', description: 'Publish due scheduled blog posts' },
  async run({ context }): Promise<{ result: { published: number; scheduled_revision_issues: string[]; skipped?: string } }> {
    const db = (context as { cloudflare?: { env?: { DB?: D1Database } } } | undefined)?.cloudflare?.env?.DB
    if (!db && import.meta.dev) return { result: { published: 0, scheduled_revision_issues: [], skipped: 'DB unavailable in local scheduled task context' } }
    if (!db) throw new Error('DB is required')
    return { result: await publishDueBlogPosts(db) }
  },
})
