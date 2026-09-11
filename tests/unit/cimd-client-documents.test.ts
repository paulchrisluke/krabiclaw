import assert from 'node:assert/strict'
import test from 'node:test'
import { validateCimdMetadata } from '@better-auth/cimd'

/**
 * The two Client ID Metadata Documents that reach production, reproduced from
 * what each vendor publishes today.
 *
 * @better-auth/cimd@1.7.0-beta.10 rejected Claude's with `grant_types must be a
 * subset of ["authorization_code", "refresh_token"]`, because Claude advertises
 * `urn:ietf:params:oauth:grant-type:jwt-bearer` as well. No MCP or CIMD spec
 * requires that containment, and no Claude user could connect while it stood —
 * krabiclaw.com advertises no `registration_endpoint`, so CIMD is the only
 * client registration path we offer and there was nothing to fall back to.
 *
 * Upstream dropped the check. These assertions exist so a later dependency bump
 * that reinstates it fails here rather than in a customer's browser.
 */

const CLAUDE_CLIENT_ID = 'https://claude.ai/oauth/mcp-oauth-client-metadata'
const CHATGPT_CLIENT_ID = 'https://chatgpt.com/oauth/client.json'

test('Claude\'s published client metadata document is accepted', () => {
  const result = validateCimdMetadata(CLAUDE_CLIENT_ID, {
    client_id: CLAUDE_CLIENT_ID,
    client_name: 'Claude',
    client_uri: 'https://claude.ai',
    redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
    grant_types: [
      'authorization_code',
      'refresh_token',
      'urn:ietf:params:oauth:grant-type:jwt-bearer',
    ],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  })

  assert.equal(result.error, undefined)
  assert.equal(result.valid, true)
})

test('ChatGPT\'s published client metadata document is accepted', () => {
  const result = validateCimdMetadata(CHATGPT_CLIENT_ID, {
    client_id: CHATGPT_CLIENT_ID,
    client_name: 'ChatGPT',
    redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  })

  assert.equal(result.error, undefined)
  assert.equal(result.valid, true)
})

test('a client_secret in a metadata document is still refused', () => {
  const result = validateCimdMetadata(CHATGPT_CLIENT_ID, {
    client_id: CHATGPT_CLIENT_ID,
    client_name: 'ChatGPT',
    redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'],
    client_secret: 'not-allowed-in-a-public-document',
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  })

  assert.equal(result.valid, false)
})
