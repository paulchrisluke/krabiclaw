import { jsonResponse } from '~/server/utils/api-response'
import { ChangelogFetchError, getRecentChanges, parseChangelogLimitQuery } from '~/server/utils/changelog'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    let prLimit: number
    try {
      prLimit = parseChangelogLimitQuery(query.limit)
    } catch (error) {
      if (!(error instanceof RangeError)) throw error
      return jsonResponse(
        { error: error.message },
        { status: 400 },
      )
    }

    const env = cloudflareEnv(event)
    const githubToken = env.GITHUB_TOKEN
    const repoOwner = env.GITHUB_REPO_OWNER || 'paulchrisluke'
    const repoName = env.GITHUB_REPO_NAME || 'krabiclaw'

    if (!githubToken) {
      return jsonResponse({ error: 'GITHUB_TOKEN not configured' }, { status: 500 })
    }

    return jsonResponse(await getRecentChanges({ githubToken, repoOwner, repoName, limit: prLimit }))
  } catch (error) {
    console.error('Failed to generate changelog:', error)
    if (error instanceof ChangelogFetchError) {
      return jsonResponse({ error: error.message }, { status: error.statusCode })
    }
    return jsonResponse({ error: 'Failed to generate changelog' }, { status: 500 })
  }
})
