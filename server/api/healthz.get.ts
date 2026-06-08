import { jsonResponse } from '~/server/utils/api-response'

export default defineEventHandler(() => {
  return jsonResponse({ ok: true })
})
