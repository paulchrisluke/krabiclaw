// GET /api/changelog - Auto-generated changelog from GitHub merged PRs
import { jsonResponse } from '~/server/utils/api-response'

const DEFAULT_PR_LIMIT = 50
const MAX_PR_LIMIT = 100

interface GitHubPR {
  number: number
  title: string
  body: string | null
  user: {
    login: string
  }
  merged_at: string | null
  closed_at: string | null
  html_url: string
}

export default defineEventHandler(async (event) => {
  try {
    const env = cloudflareEnv(event)
    const query = getQuery(event)
    const requestedLimit = Number.parseInt(String(query.limit || ''), 10)
    const prLimit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(requestedLimit, MAX_PR_LIMIT))
      : DEFAULT_PR_LIMIT

    const githubToken = env.GITHUB_TOKEN
    const repoOwner = env.GITHUB_REPO_OWNER || 'paulchrisluke'
    const repoName = env.GITHUB_REPO_NAME || 'kikuzuki-thailand-marketing'

    if (!githubToken) {
      return jsonResponse({ error: 'GITHUB_TOKEN not configured' }, { status: 500 })
    }

    // Fetch merged PRs from GitHub
    const response = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/pulls?state=closed&sort=updated&direction=desc&per_page=${Math.min(prLimit * 2, 100)}`,
      {
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('GitHub API error:', response.status, errorText)
      return jsonResponse({ error: `GitHub API error: ${response.status}` }, { status: 500 })
    }

    const pullRequests = (await response.json()) as GitHubPR[]

    // Filter for merged PRs only and slice to requested limit
    const mergedPRs = pullRequests.filter(pr => pr.merged_at !== null).slice(0, prLimit)

    // Categorize PRs by type based on title
    const categorized: Record<string, Array<{ number: number; title: string; body: string | null; author: string; mergedAt: string; url: string; type: string; scope: string | null; description: string }>> = {
      feat: [],
      fix: [],
      chore: [],
      docs: [],
      style: [],
      refactor: [],
      perf: [],
      test: [],
      build: [],
      ci: [],
      other: []
    }

    for (const pr of mergedPRs) {
      const match = pr.title.match(/^(feat|fix|chore|docs|style|refactor|perf|test|build|ci)(\(.+\))?:\s*(.+)/)
      if (match) {
        const [, type, scope, description] = match
        if (type && categorized[type]) {
          categorized[type].push({
            number: pr.number,
            title: pr.title,
            body: pr.body,
            author: pr.user.login,
            mergedAt: pr.merged_at!,
            url: pr.html_url,
            type,
            scope: scope?.replace(/[()]/g, '') || null,
            description: description || ''
          })
        }
      } else {
        if (categorized.other) {
          categorized.other.push({
            number: pr.number,
            title: pr.title,
            body: pr.body,
            author: pr.user.login,
            mergedAt: pr.merged_at!,
            url: pr.html_url,
            type: 'other',
            scope: null,
            description: pr.title
          })
        }
      }
    }

    return jsonResponse({
      commits: categorized,
      total: mergedPRs.length,
      lastUpdated: mergedPRs[0]?.merged_at || null,
      limit: prLimit
    })
  } catch (error) {
    console.error('Failed to generate changelog:', error)
    return jsonResponse({ error: 'Failed to generate changelog' }, { status: 500 })
  }
})
