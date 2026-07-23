import { readFileSync } from 'node:fs'

function readPullRequestBody() {
  if (process.env.PR_BODY) return process.env.PR_BODY
  const eventPath = process.env.GITHUB_EVENT_PATH
  if (!eventPath) return ''

  try {
    const event = JSON.parse(readFileSync(eventPath, 'utf8'))
    return event.pull_request?.body ?? ''
  } catch (error) {
    console.error(`Unable to read pull request event payload: ${error.message}`)
    process.exit(1)
  }
}

function evidenceLine(body, label) {
  const pattern = new RegExp(`^\\s*(?:[-*]\\s*)?(?:#{1,6}\\s*)?${label}\\s*:\\s*(.+?)\\s*$`, 'im')
  return body.match(pattern)?.[1]?.trim() ?? ''
}

const body = readPullRequestBody()
const required = ['Browser', 'Static']
const placeholderPattern = /^(?:tbd|todo|n\/a|none|not run|manual\/playwright\/ci e2e evidence, or exact blocker\.|unit\/lint\/typecheck\/guardrail evidence, or exact blocker\.)$/i
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
