import { jsonResponse } from '~/server/utils/api-response'
import { ChangelogFetchError, DEFAULT_CHANGELOG_LIMIT, getRecentChanges, MAX_CHANGELOG_LIMIT } from '~/server/utils/changelog'

export default defineEventHandler(async (event) => {
  try {
    const env = cloudflareEnv(event)
    const query = getQuery(event)
    const requestedLimit = Number.parseInt(String(query.limit || ''), 10)
    const prLimit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(requestedLimit, MAX_CHANGELOG_LIMIT))
      : DEFAULT_CHANGELOG_LIMIT

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
