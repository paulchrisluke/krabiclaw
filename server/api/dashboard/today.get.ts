import { jsonResponse } from '~/server/utils/api-response'
import { listAgenda, todayKeyForTimeZone } from '~/server/utils/dashboard-agenda'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { finalizeRequestMetrics } from '~/server/utils/request-metrics'

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function shiftUtcDay(date: Date, days: number): string {
  return utcDateKey(new Date(date.getTime() + days * 86_400_000))
}

export default defineEventHandler(async (event) => {
  const { db, organization } = await getDashboardContext(event, { requireSite: false })
  const now = new Date()
  const common = {
    organizationSlug: organization.slug,
    principal: { memberId: organization.memberId, role: organization.role },
  }
  const [nearby, attention] = await Promise.all([
    listAgenda(db, organization.id, {
      from: shiftUtcDay(now, -1), to: shiftUtcDay(now, 1), kinds: ['reservation', 'experience_booking', 'post'], ...common,
    }),
    listAgenda(db, organization.id, {
      from: '2000-01-01', to: shiftUtcDay(now, 1), kinds: ['thread'],
      threadState: 'needs_attention', limit: 5, ...common,
    }),
  ])
  const items = nearby.items.filter(item => item.dayKey === todayKeyForTimeZone(now, item.timeZone))
  const counts = {
    reservations: items.filter(item => item.kind === 'reservation').length,
    experienceBookings: items.filter(item => item.kind === 'experience_booking').length,
    threadsNeedingAttention: attention.items.length,
    posts: items.filter(item => item.kind === 'post').length,
  }
  return jsonResponse(finalizeRequestMetrics(event, 'dashboard-today', {
    items,
    attention: [...attention.items].sort((left, right) => right.startsAt.localeCompare(left.startsAt)),
    counts,
    availableKinds: nearby.availableKinds,
    sites: nearby.sites,
    locations: nearby.locations,
    resolvedAt: now.toISOString(),
  }))
})
import { defineEventHandler } from 'h3'
