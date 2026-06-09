#!/usr/bin/env node
// Mints a Google refresh token with business.manage + userinfo.email scopes.
// Run: node scripts/get-google-refresh-token.mjs
//
// PREREQUISITE: In Google Cloud Console → APIs & Services → OAuth 2.0 Client IDs,
// add http://localhost:3000/callback as an authorized redirect URI (can remove after).

import http from 'http'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnvFile(filename) {
  try {
    const content = readFileSync(join(__dirname, '..', filename), 'utf-8')
    const env = {}
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      let val = trimmed.slice(eq + 1)
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'")
      }
      env[trimmed.slice(0, eq)] = val
    }
    return env
  } catch {
    return null
  }
}

const env = loadEnvFile('.env.production') || loadEnvFile('.env')
if (!env) {
  console.error('Could not load .env.production or .env')
  process.exit(1)
}

const CLIENT_ID = env.GOOGLE_CLIENT_ID
const CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET
const REDIRECT_URI = 'http://localhost:3000/callback'

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in env file')
  process.exit(1)
}

const SCOPES = [
  'https://www.googleapis.com/auth/business.manage',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
authUrl.searchParams.set('client_id', CLIENT_ID)
authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
authUrl.searchParams.set('response_type', 'code')
authUrl.searchParams.set('scope', SCOPES)
authUrl.searchParams.set('access_type', 'offline')
authUrl.searchParams.set('prompt', 'consent')

console.log('\n=== Google Refresh Token Minter ===\n')
console.log('PREREQUISITE: Add to Google Cloud Console → Credentials → OAuth 2.0 Client IDs → Authorized redirect URIs:')
console.log('  http://localhost:3000/callback\n')
console.log('Then visit this URL in your browser:\n')
console.log(authUrl.toString())
console.log('\nWaiting for callback on http://localhost:3000/callback ...\n')

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3000')
  if (url.pathname !== '/callback') {
    res.writeHead(404)
    res.end('Not found')
    return
  }

  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error) {
    res.writeHead(400, { 'content-type': 'text/html' })
    res.end(`<h1>Error: ${error}</h1>`)
    console.error('OAuth error:', error)
    server.close()
    process.exit(1)
  }

  if (!code) {
    res.writeHead(400, { 'content-type': 'text/html' })
    res.end('<h1>No code received</h1>')
    server.close()
    process.exit(1)
  }

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    })

    const tokens = await tokenResponse.json()

    if (!tokenResponse.ok) {
      res.writeHead(500, { 'content-type': 'text/html' })
      res.end(`<h1>Token exchange failed</h1><pre>${JSON.stringify(tokens, null, 2)}</pre>`)
      console.error('Token exchange failed:', tokens)
      server.close()
      process.exit(1)
    }

    if (!tokens.refresh_token) {
      res.writeHead(400, { 'content-type': 'text/html' })
      res.end('<h1>No refresh_token returned</h1><p>Make sure the OAuth client has not already been authorized (revoke access first at myaccount.google.com/permissions) and that prompt=consent is set.</p>')
      console.error('No refresh_token in response. Revoke access at https://myaccount.google.com/permissions and try again.')
      server.close()
      process.exit(1)
    }

    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<h1>Success! Check your terminal.</h1>')

    console.log('\n=== SUCCESS ===')
    console.log('\nGOOGLE_REFRESH_TOKEN=' + tokens.refresh_token)
    console.log('\nNow run:')
    console.log(`  # Update wrangler secret:`)
    console.log(`  echo "${tokens.refresh_token}" | wrangler secret put GOOGLE_REFRESH_TOKEN --name krabiclaw`)
    console.log(`  # Update GitHub secret:`)
    console.log(`  gh secret set GOOGLE_REFRESH_TOKEN --body "${tokens.refresh_token}" --repo paulchrisluke/krabiclaw`)
    console.log('\nAlso add GOOGLE_REFRESH_TOKEN=<value> to .env and .env.production\n')

    server.close()
    process.exit(0)
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/html' })
    res.end(`<h1>Error</h1><pre>${e.message}</pre>`)
    console.error('Error:', e)
    server.close()
    process.exit(1)
  }
})

server.listen(3000, () => {
  console.log('Listening on http://localhost:3000 ...')
})
