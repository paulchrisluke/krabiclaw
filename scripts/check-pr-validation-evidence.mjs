import { readFileSync } from 'node:fs'

function readEventPayload() {
  const eventPath = process.env.GITHUB_EVENT_PATH
  if (!eventPath) return null

  try {
    return JSON.parse(readFileSync(eventPath, 'utf8'))
  } catch (error) {
    console.error(`Unable to read pull request event payload: ${error.message}`)
    process.exit(1)
  }
}

async function readCurrentPullRequestBody(event) {
  const token = process.env.GITHUB_TOKEN
  const repository = process.env.GITHUB_REPOSITORY
  const number = event?.pull_request?.number
  if (!token || !repository || !number) return ''

  const response = await fetch(`https://api.github.com/repos/${repository}/pulls/${number}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
  })

  if (!response.ok) {
    console.warn(`Unable to fetch current pull request body: ${response.status} ${response.statusText}`)
    return ''
  }

  const pullRequest = await response.json()
  return pullRequest.body ?? ''
}

async function readPullRequestBody() {
  if (process.env.PR_BODY) return process.env.PR_BODY
  const event = readEventPayload()
  const currentBody = await readCurrentPullRequestBody(event)
  if (currentBody) return currentBody

  return event?.pull_request?.body ?? ''
}

function evidenceLine(body, label) {
  const pattern = new RegExp(`^\\s*(?:[-*]\\s*)?(?:#{1,6}\\s*)?${label}\\s*:\\s*(.+?)\\s*$`, 'im')
  return body.match(pattern)?.[1]?.trim() ?? ''
}

const body = await readPullRequestBody()
const required = ['Browser', 'Static']
const placeholderPattern = /^(?:tbd|todo|n\/a|none|not run|blocked|exact blocker\.?|manual\/playwright\/ci e2e evidence, or exact blocker\.|unit\/lint\/typecheck\/guardrail evidence, or exact blocker\.)$/i
const missing = required.filter((label) => {
  const value = evidenceLine(body, label)
  return !value || placeholderPattern.test(value)
})

if (missing.length) {
  console.error('PR descriptions must report validation evidence separately.')
  console.error('Add filled lines like:')
  console.error('- Browser: Playwright dashboard smoke passed locally; PR E2E smoke pending.')
  console.error('- Static: yarn check:pr-validation passed; targeted unit file passed.')
  console.error(`Missing or placeholder sections: ${missing.join(', ')}`)
  process.exit(1)
}

console.log('PR validation evidence includes Browser and Static sections.')
