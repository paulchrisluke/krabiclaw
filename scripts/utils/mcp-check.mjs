// Shared harness for the yarn test:mcp:* checks: the target, its credentials,
// and ok/not ok reporting that sets the exit status.
import { parseArgs } from 'node:util'
import { credentialSession } from './e2e-auth.mjs'
import { mcpRequest, mcpToolCall } from './mcp-request.mjs'

const { values: args } = parseArgs({
  options: {
    'base-url': { type: 'string' },
    'organization-id': { type: 'string' },
    'location-id': { type: 'string' },
    'user-id': { type: 'string' },
  },
})
for (const [name, value] of Object.entries(args)) {
  if (!value) throw new Error(`--${name} requires a non-empty value`)
}

export const BASE_URL = (args['base-url'] ?? process.env.MCP_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
export const ORGANIZATION_ID = args['organization-id'] ?? process.env.MCP_ORGANIZATION_ID
export const LOCATION_ID = args['location-id'] ?? process.env.MCP_LOCATION_ID
const USER_ID = args['user-id'] ?? process.env.MCP_USER_ID

const { hostname } = new URL(BASE_URL)
const credentialLogin = hostname === 'localhost' || hostname === '127.0.0.1' || process.env.MCP_CREDENTIAL_LOGIN === '1'
export const credentialsConfigured = Boolean(process.env.MCP_BEARER_TOKEN) || credentialLogin

let failed = false

export function pass(message) {
  console.log(`ok  ${message}`)
}

export function fail(message, detail) {
  failed = true
  console.error(`not ok  ${message}`)
  if (detail) console.error(typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2))
}

export function skip(message) {
  console.log(`skip  ${message}`)
}

export function expectValue(label, condition, detail) {
  if (condition) pass(label)
  else fail(label, detail)
}

export function expectStatus(label, response, expected = 200) {
  if (response.status === expected) pass(label)
  else fail(`${label}: expected ${expected}, got ${response.status}`, response.body)
}

export function finish() {
  process.exit(failed ? 1 : 0)
}

export function run(main) {
  main().then(finish, (error) => {
    console.error(error)
    process.exit(1)
  })
}

// A bearer token, or a Better Auth credential session locally or through a
// tunnel with MCP_CREDENTIAL_LOGIN=1.
export async function authHeaders() {
  if (process.env.MCP_BEARER_TOKEN) return { authorization: `Bearer ${process.env.MCP_BEARER_TOKEN}` }
  if (!credentialLogin) throw new Error('Set MCP_BEARER_TOKEN for remote checks, or MCP_CREDENTIAL_LOGIN=1 for a credentialed tunnel.')
  return credentialSession(BASE_URL, { userId: USER_ID, organizationId: ORGANIZATION_ID })
}

export function request(method, params = {}, headers = {}, options = {}) {
  return mcpRequest(BASE_URL, method, params, headers, options)
}

export function mcp(headers, name, args = {}) {
  return mcpToolCall(BASE_URL, headers, name, args)
}

// structuredContent when the tool returns it, else the first text content,
// parsed when it is JSON.
export function toolData(body) {
  if (body?.result?.structuredContent) return body.result.structuredContent
  const text = body?.result?.content?.[0]?.text
  if (!text) return body
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
