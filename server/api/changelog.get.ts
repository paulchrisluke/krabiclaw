// GET /api/changelog - Auto-generated changelog from git commits
import { exec } from 'child_process'
import { promisify } from 'util'
import { jsonResponse } from '~/server/utils/api-response'

const execPromise = promisify(exec)

export default defineEventHandler(async (event) => {
  try {
    // Get git log with conventional commits
    const { stdout: gitLog } = await execPromise('git log --pretty=format:"%H%x1E%s%x1E%an%x1E%ad" --date=iso', {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout: 10000,
      maxBuffer: 1024 * 1024
    })

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

    // Get actual last commit timestamp
    const { stdout: lastCommitDate } = await execPromise('git log -1 --format=%cI', {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout: 5000
    })

    return jsonResponse({
      commits: categorized,
      total: commits.length,
      lastUpdated: lastCommitDate.trim()
    })
  } catch (error) {
    console.error('Failed to generate changelog:', error)
    return jsonResponse({ error: 'Failed to generate changelog' }, { status: 500 })
  }
})
