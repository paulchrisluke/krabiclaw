import { processQueuedTranslationJobs } from '~/server/utils/translation-processor'

interface TranslationTaskContext {
  cloudflare?: {
    env?: ApiRecord
  }
}

type TranslationTaskResult = Awaited<ReturnType<typeof processQueuedTranslationJobs>> & {
  skipped: string | null
}

export default defineTask({
  meta: {
    name: 'translation-jobs:process',
    description: 'Process queued restaurant site translation jobs'
  },
  async run({ context }) {
    const taskContext = context as TranslationTaskContext | undefined
    const env = taskContext?.cloudflare?.env ?? {}
    const db = env.DB
    if (!db && import.meta.dev) {
      const result: TranslationTaskResult = {
        processed_jobs: 0,
        results: [],
        skipped: 'DB unavailable in local scheduled task context',
      }
      return {
        result
      }
    }
    if (!db) throw new Error('DB is required')

    const processed = await processQueuedTranslationJobs(db, env, {
      limit: 3,
      batchesPerJob: 2,
    })
    const result: TranslationTaskResult = { ...processed, skipped: null }
    return { result }
  }
})
