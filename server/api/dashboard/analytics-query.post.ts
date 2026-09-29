import { defineHandler, HTTPError } from 'nitro'
import { readBody } from 'nitro/h3'
import { jsonResponse } from '~/server/utils/api-response'
import { loadDashboardOrganizationAnalyticsQuery } from '~/server/utils/dashboard-org-analytics'
import type { AnalyticsQueryInput } from '~/server/utils/analytics-query'

// The same native analytics query the MCP tool exposes, in the shape the CMS sends it. Field names
// are the MCP tool's, snake_case.
export default defineHandler(async (event) => {
  const body = await readBody(event) as Record<string, unknown> | null
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HTTPError({ statusCode: 400, statusMessage: 'A query object is required' })
  return jsonResponse(await loadDashboardOrganizationAnalyticsQuery(event, {
    mode: body.mode as AnalyticsQueryInput['mode'],
    startDate: typeof body.start_date === 'string' ? body.start_date : undefined,
    endDate: typeof body.end_date === 'string' ? body.end_date : undefined,
    filters: body.filters as Record<string, unknown> | undefined,
    attributionBasis: body.attribution_basis as AnalyticsQueryInput['attributionBasis'],
    sort: body.sort as AnalyticsQueryInput['sort'],
    limit: body.limit as number | undefined,
    cursor: typeof body.cursor === 'string' ? body.cursor : undefined,
    dimensions: body.dimensions as string[] | undefined,
    metrics: body.metrics as string[] | undefined,
    outcomeEvent: typeof body.outcome_event === 'string' ? body.outcome_event : undefined,
  }))
})
