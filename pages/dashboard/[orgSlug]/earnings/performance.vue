<template>
  <!--
    Airbnb's Performance: the year's bars with the chosen month lit, that
    month's Paid / Upcoming / Total, what it was earned on, and the monthly
    table underneath. One screen under Earnings.
  -->
  <DashboardLeafPanel id="earnings-performance" title="Performance" :footer="false">
    <UAlert v-if="error" color="error" variant="soft" title="Performance could not be loaded" :description="getErrorMessage(error, 'Performance request failed')" />
    <template v-else>
      <section>
        <div class="flex items-center justify-between gap-4">
          <div>
            <h2 class="text-xl font-semibold text-highlighted">Summary</h2>
            <p class="text-sm text-muted">Monthly view · {{ year }}</p>
          </div>
          <div class="flex items-center rounded-md ring ring-default">
            <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" square aria-label="Previous year" @click="year -= 1" />
            <UButton icon="i-lucide-chevron-right" color="neutral" variant="ghost" square aria-label="Next year" :disabled="year >= thisYear" @click="year += 1" />
          </div>
        </div>
        <USkeleton v-if="pending && !data" class="mt-6 h-56 w-full" />
        <EarningsBars v-else-if="data" class="mt-6" :months="data.months" :selected="month" :currency="data.currency" @select="month = $event" />
      </section>

      <section v-if="data" class="mt-8 rounded-3xl ring ring-default">
        <div class="p-6">
          <h3 class="text-base font-semibold text-highlighted">{{ monthTitle }}</h3>
          <dl class="mt-4 space-y-3">
            <div class="flex items-center justify-between gap-4"><dt class="flex items-center gap-2 text-sm text-muted"><span class="size-2 rounded-full bg-primary" aria-hidden="true" />Paid</dt><dd class="text-sm font-medium text-highlighted">{{ money(selected.paid - selected.refunded) }}</dd></div>
            <div class="flex items-center justify-between gap-4"><dt class="flex items-center gap-2 text-sm text-muted"><span class="size-2 rounded-full ring-2 ring-inset ring-primary" aria-hidden="true" />Refunded</dt><dd class="text-sm font-medium text-highlighted">{{ money(selected.refunded) }}</dd></div>
          </dl>
          <div class="mt-4 flex items-center justify-between gap-4 border-t border-default pt-4"><p class="text-sm font-semibold text-highlighted">Total ({{ data.currency ?? 'USD' }})</p><p class="text-sm font-semibold text-highlighted">{{ money(selected.paid - selected.refunded) }}</p></div>
        </div>
        <NuxtLink :to="{ path: `/dashboard/${route.params.orgSlug}/earnings/transactions`, query: { from: `${month}-01`, through: lastDayOf(month) } }" class="flex items-center justify-between gap-4 border-t border-default px-6 py-4">
          <span class="text-sm font-semibold text-highlighted">Paid breakdown</span>
          <UIcon name="i-lucide-chevron-right" class="size-5 text-muted" />
        </NuxtLink>
      </section>

      <section v-if="data" class="mt-10">
        <h2 class="text-xl font-semibold text-highlighted">Earnings by offering</h2>
        <p class="text-sm text-muted">{{ monthTitle }}</p>
        <div v-if="data.items.length" class="mt-4 space-y-5">
          <div v-for="item in data.items" :key="item.title" class="flex items-center gap-4">
            <span class="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-elevated">
              <img v-if="item.imageUrl" :src="item.imageUrl" alt="" class="size-full object-cover">
              <UIcon v-else name="i-lucide-package" class="size-5 text-dimmed" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="flex items-center justify-between gap-4">
                <span class="truncate text-sm font-medium text-highlighted">{{ item.title }}</span>
                <span class="shrink-0 text-sm"><span class="text-muted">{{ share(item.paid) }}</span> <span class="ml-2 font-semibold text-highlighted">{{ money(item.paid) }}</span></span>
              </span>
              <span class="mt-2 block h-1 w-full rounded-full bg-elevated"><span class="block h-1 rounded-full bg-primary" :style="{ width: share(item.paid) }" /></span>
            </span>
          </div>
        </div>
        <p v-else class="mt-4 text-sm text-muted">Nothing was earned in {{ monthTitle }}.</p>
        <p class="mt-4 text-xs text-muted">Includes paid earnings for the selected period.</p>
      </section>

      <section v-if="data" class="mt-10">
        <h2 class="text-xl font-semibold text-highlighted">Monthly earnings</h2>
        <table class="mt-4 w-full text-left text-sm">
          <thead class="text-muted"><tr><th class="pb-3 font-medium">Date</th><th class="pb-3 text-right font-medium">Paid</th><th class="pb-3 text-right font-medium">Refunded</th><th class="pb-3 text-right font-medium">Total ({{ data.currency ?? 'USD' }})</th></tr></thead>
          <tbody class="divide-y divide-default border-y border-default">
            <tr v-for="row in data.months" :key="row.month" :class="row.month === month ? 'bg-elevated/50' : ''">
              <td class="py-3 text-highlighted"><button type="button" class="hover:underline" @click="month = row.month">{{ formatCalendarDate(`${row.month}-01`, 'en', { month: 'long', year: 'numeric' }) }}</button></td>
              <td class="py-3 text-right text-muted">{{ money(row.paid) }}</td>
              <td class="py-3 text-right text-muted">{{ money(row.refunded) }}</td>
              <td class="py-3 text-right font-semibold text-highlighted">{{ money(row.paid - row.refunded) }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import EarningsBars from '~/components/dashboard/EarningsBars.vue'
import { paymentMoney } from '~/shared/payment-display'
import { isEarningsPerformance, type EarningsPerformance } from '~/shared/earnings-display'
import { formatCalendarDate } from '~/utils/timezone'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Performance | Krabiclaw', robots: 'noindex, nofollow' })

const route = useRoute()
const router = useRouter()
const api = useDashboardApi()
const now = new Date()
const thisYear = now.getUTCFullYear()
const initial = typeof route.query.month === 'string' && /^\d{4}-\d{2}$/.test(route.query.month) ? route.query.month : `${thisYear}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
const month = ref(initial)
const year = ref(Number(initial.slice(0, 4)))
// Choosing a year keeps the same month number; choosing a month follows its year. The month rides in the URL.
watch(year, (next) => { month.value = `${next}-${month.value.slice(5)}` })
watch(month, (next) => { year.value = Number(next.slice(0, 4)); void router.replace({ query: { ...route.query, month: next } }) })

const { data, pending, error } = await useAsyncData(
  () => `earnings-performance:${route.params.orgSlug}:${year.value}:${month.value}`,
  () => api<EarningsPerformance>('/api/dashboard/payments', { query: { view: 'performance', year: year.value, month: month.value }, validate: isEarningsPerformance }),
  { lazy: true, watch: [month] },
)
const money = (amount: number) => paymentMoney(amount, data.value?.currency ?? 'USD')
const selected = computed(() => data.value?.months.find(row => row.month === month.value) ?? { month: month.value, paid: 0, refunded: 0 })
const monthTitle = computed(() => formatCalendarDate(`${month.value}-01`, 'en', { month: 'long', year: 'numeric' }))
const monthTotal = computed(() => data.value?.items.reduce((sum, item) => sum + item.paid, 0) ?? 0)
const share = (paid: number) => `${monthTotal.value ? Math.round((paid / monthTotal.value) * 1000) / 10 : 0}%`
function lastDayOf(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10)
}
</script>
