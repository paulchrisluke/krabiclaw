import { getHeader } from 'h3'
import { isPreviewContext } from '~/server/utils/tenant-hosts'

export const PRIVATE_CLIENT_TEST_KEY_ID = 'krabiclaw-cimd-e2e-rs256'

export default defineEventHandler((event) => {
  const host = getHeader(event, 'host') || ''
  if (!import.meta.dev && !isPreviewContext(host)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden in production' })
  }

  return {
    keys: [{
      kty: 'RSA',
      use: 'sig',
      alg: 'RS256',
      kid: PRIVATE_CLIENT_TEST_KEY_ID,
      n: '0PJUgpQ_Fg1ArCJcwrncgB9r8EX2UVD7pvpNJN8d_E6n4c_yQ_LVC0jyzdAlWnRFXE2THja5mSMQ7ddEYBznURS563ki2qHbMxkkhsIvzR3BeWWOe_qhqWenjFx5le5VFZIg1kcUZ0nzR4IM8gX1BJSEERZUkydY5K584rv3dVVdWWhUwux1ES0gEqpjQle9iiRPQ6lU8lSpYLEI02rkjvtF7HB5wKtnr1wsTOA5hWLwaKnFKN-G4v5ITO0cFys9bN6024YL8bj4N7HvPA-uxDM7AjxHZkAZ9PE90v85QS3r49AysOQIOxM7pq9i3su_5kECwCcZuG9gddOGUOs1fw',
      e: 'AQAB',
    }],
  }
})
