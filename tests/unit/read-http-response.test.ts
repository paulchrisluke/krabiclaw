import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, request } from 'node:http'
import { readHttpResponse } from '../../scripts/utils/read-http-response.mjs'

test('readHttpResponse rejects a truncated response without waiting for a request timeout', { timeout: 1_000 }, async (t) => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-length': '10' })
    response.flushHeaders()
    response.write('abc')
    setTimeout(() => response.destroy(), 10)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  t.after(() => server.close())

  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const responsePromise = new Promise((resolve, reject) => {
    const clientRequest = request(`http://127.0.0.1:${address.port}`, response => {
      resolve(readHttpResponse(response, 'truncated test response'))
    })
    clientRequest.once('error', reject)
    clientRequest.end()
  })

  const startedAt = Date.now()
  await assert.rejects(responsePromise, /Incomplete HTTP response|aborted|premature/i)
  assert.ok(Date.now() - startedAt < 500)
})
