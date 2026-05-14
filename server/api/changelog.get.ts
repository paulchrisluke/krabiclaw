// GET /api/changelog - Auto-generated changelog from git commits
import { exec } from 'child_process'
import { promisify } from 'util'
import { jsonResponse } from '~/server/utils/api-response'

const execPromise = promisify(exec)
const DEFAULT_COMMIT_LIMIT = 200
const MAX_COMMIT_LIMIT = 1000

interface ExecErrorLike {
  stack?: string
  stderr?: string
  message?: string
}

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const requestedLimit = Number.parseInt(String(query.limit || ''), 10)
    const commitLimit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(requestedLimit, MAX_COMMIT_LIMIT))
      : DEFAULT_COMMIT_LIMIT

    try {
      const { stdout: insideWorkTree } = await execPromise('git rev-parse --is-inside-work-tree', {
        cwd: process.cwd(),
        encoding: 'utf-8',
        timeout: 5000,
        maxBuffer: 256 * 1024
      })

      if (insideWorkTree.trim() !== 'true') {
        return jsonResponse({ error: 'not a git repository' }, { status: 400 })
      }
    } catch (err) {
      const execError = err as ExecErrorLike
      console.error('Failed git repository check:', execError.stack ?? execError.message ?? err)
      return jsonResponse({ error: 'not a git repository' }, { status: 400 })
    }

    let gitLog = ''
    try {
      const result = await execPromise(
        `git log --max-count=${commitLimit} --pretty=format:"%H%x1E%s%x1E%an%x1E%cI" --date=iso-strict`,
        {
          cwd: process.cwd(),
          encoding: 'utf-8',
          timeout: 30000,
          maxBuffer: 4 * 1024 * 1024
        }
      )
      gitLog = result.stdout
    } catch (err) {
      const execError = err as ExecErrorLike
      const gitError = execError.stderr ?? execError.message ?? 'git log failed'
      console.error('Failed to execute git log:', execError.stack ?? execError.message ?? err)
      return jsonResponse({ error: `Failed to generate changelog: ${String(gitError).trim()}` }, { status: 500 })
    }

    const commits = gitLog.trim().split('\n').map(line => {
      const parts = line.split('\x1E')
      if (parts.length < 4) return null
      const [hash, message, author, date] = parts
      return { hash, message, author, date }
    }).filter(Boolean) as Array<{ hash: string; message: string; author: string; date: string }>

    // Categorize commits by type
    const categorized: Record<string, Array<{ hash: string; message: string; author: string; date: string; type: string; scope: string | null; description: string }>> = {
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

    for (const commit of commits) {
      const match = commit.message.match(/^(feat|fix|chore|docs|style|refactor|perf|test|build|ci)(\(.+\))?:\s*(.+)/)
      if (match) {
        const [, type, scope, description] = match
        if (type && categorized[type]) {
          categorized[type].push({
            ...commit,
            type,
            scope: scope?.replace(/[()]/g, '') || null,
            description: description || ''
          })
        }
      } else {
        if (categorized.other) {
          categorized.other.push({
            ...commit,
            type: 'other',
            scope: null,
            description: commit.message
          })
        }
      }
    }

    return jsonResponse({
      commits: categorized,
      total: commits.length,
      lastUpdated: commits[0]?.date || null,
      limit: commitLimit
    })
  } catch (error) {
    console.error('Failed to generate changelog:', error)
    return jsonResponse({ error: 'Failed to generate changelog' }, { status: 500 })
  }
})
