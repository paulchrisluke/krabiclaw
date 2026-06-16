#!/usr/bin/env node

const baseUrlIndex = process.argv.indexOf('--base-url')
const hasBaseUrlFlag = baseUrlIndex !== -1
const baseUrlArg = hasBaseUrlFlag ? process.argv[baseUrlIndex + 1] : undefined

if (
  hasBaseUrlFlag
  && (
    baseUrlArg === undefined
    || !baseUrlArg.trim()
    || baseUrlArg.startsWith('--')
  )
) {
  console.error('--base-url requires a non-empty URL value')
  process.exit(1)
}

const BASE_URL = (baseUrlArg ?? process.env.MCP_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const EXPECT_CIMD = process.env.MCP_EXPECT_CIMD === '1'

let failed = false

function pass(message) {
  console.log(`ok  ${message}`)
}

function fail(message, detail) {
  failed = true
  console.error(`not ok  ${message}`)
  if (detail) console.error(typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2))
}

async function getJson(path) {
  const res = await fetch(`${BASE_URL}${path}`)
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    fail(`${path} returned ${res.status}`, body)
  }
  return body
}

async function main() {
  console.log(`Checking MCP OAuth registration metadata at ${BASE_URL}`)

  const authServer = await getJson('/.well-known/oauth-authorization-server')
  const openid = await getJson('/.well-known/openid-configuration')

  for (const [label, metadata] of [
    ['oauth-authorization-server', authServer],
    ['openid-configuration', openid],
  ]) {
    if (typeof metadata?.authorization_endpoint === 'string') pass(`${label} has authorization_endpoint`)
    else fail(`${label} missing authorization_endpoint`, metadata)

    if (typeof metadata?.token_endpoint === 'string') pass(`${label} has token_endpoint`)
    else fail(`${label} missing token_endpoint`, metadata)

    if (EXPECT_CIMD) {
      if (metadata?.client_id_metadata_document_supported === true) pass(`${label} advertises CIMD`)
      else fail(`${label} does not advertise CIMD`, metadata)
    } else {
      if (typeof metadata?.registration_endpoint === 'string') pass(`${label} advertises DCR registration_endpoint`)
      else fail(`${label} missing DCR registration_endpoint`, metadata)

      if (metadata?.client_id_metadata_document_supported !== true) pass(`${label} does not advertise CIMD on DCR app`)
      else fail(`${label} advertises CIMD unexpectedly`, metadata)
    }
  }

  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
