import assert from 'node:assert/strict'
import test from 'node:test'
import { createCimdResolver } from '@better-auth/cimd'

function resolverContext() {
  return {
    context: {
      getPlugin: () => ({ options: {} }),
      adapter: {
        create: async ({ data }: { data: Record<string, unknown> }) => data,
        findOne: async () => null,
      },
    },
  }
}

test('CIMD follows a validated metadata redirect in manual mode', async () => {
  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string, redirect?: RequestRedirect }> = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), redirect: init?.redirect })
    if (calls.length === 1) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/oauth-client-metadata.json' },
      })
    }
    return Response.json({
      client_id: 'https://client.example/oauth-client',
      redirect_uris: ['https://client.example/oauth/callback'],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code'],
      response_types: ['code'],
    })
  }

  try {
    const client = await createCimdResolver()(
      resolverContext() as never,
      'https://client.example/oauth-client',
      null,
    )

    assert.equal(client?.clientId, 'https://client.example/oauth-client')
    assert.deepEqual(calls, [
      { url: 'https://client.example/oauth-client', redirect: 'manual' },
      { url: 'https://client.example/oauth-client-metadata.json', redirect: 'manual' },
    ])
  }
  finally {
    globalThis.fetch = originalFetch
  }
})

test('CIMD rejects redirects to private addresses before fetching them', async () => {
  const originalFetch = globalThis.fetch
  const calls: string[] = []
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    return new Response(null, {
      status: 302,
      headers: { Location: 'http://127.0.0.1/metadata' },
    })
  }

  try {
    await assert.rejects(
      createCimdResolver()(
        resolverContext() as never,
        'https://client.example/oauth-client',
        null,
      ),
      (error: unknown) => {
        const body = (error as { body?: { error_description?: string } }).body
        return body?.error_description?.startsWith('Metadata document redirect rejected:') === true
      },
    )
    assert.deepEqual(calls, ['https://client.example/oauth-client'])
  }
  finally {
    globalThis.fetch = originalFetch
  }
})
