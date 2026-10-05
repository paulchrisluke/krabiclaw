<template>
  <!--
    Airbnb's transaction list: a month chosen from a pill, then one line per
    payment — the picture, "Paid Oct 4", who and what, the amount — a total and
    Export CSV at the foot. A line opens the record it paid for.
  -->
  <DashboardIndexPanel id="earnings-transactions" title="Transactions">
    <div class="mx-auto w-full max-w-3xl pb-24">
      <UDropdownMenu :items="monthItems" :content="{ align: 'start' }" :ui="{ content: 'w-56' }">
        <UButton :label="periodLabel" trailing-icon="i-lucide-chevron-down" color="neutral" variant="soft" class="rounded-full" />
      </UDropdownMenu>

      <UAlert v-if="error" class="mt-6" color="error" :description="error.message" />
      <div v-else-if="pending && !data" class="mt-6 space-y-4"><USkeleton v-for="index in 4" :key="index" class="h-20 rounded-2xl" /></div>
      <template v-else-if="data">
        <p v-if="!rows.length" class="mt-6 text-base text-muted">No transactions in this period.</p>
        <div v-else class="mt-6 space-y-6">
          <NuxtLink v-for="row in rows" :key="row.id" :to="row.to" class="flex items-center gap-4" :data-testid="`transaction-${row.id}`">
            <span class="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-elevated">
              <img v-if="row.image_url" :src="row.image_url" alt="" class="size-full object-cover" loading="lazy">
              <UIcon v-else name="i-lucide-receipt" class="size-6 text-dimmed" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-base font-medium text-highlighted">{{ paymentStateLabel(row) }} {{ formatTimestamp(row.created_at, 'en', 'UTC', { month: 'short', day: 'numeric' }) }}</span>
              <span v-if="row.buyer_name" class="block truncate text-sm text-muted">{{ row.buyer_name }}</span>
              <span class="block truncate text-sm text-muted">{{ whenLabel(row) }}</span>
            </span>
            <span class="shrink-0 text-right">
              <span class="block text-base font-medium tabular-nums text-highlighted">{{ paymentMoney(row.captured_amount - row.refunded_amount, row.currency) }}</span>
              <span class="block text-sm text-muted">{{ row.currency }}</span>
            </span>
            <UIcon name="i-lucide-chevron-right" class="size-5 shrink-0 text-muted" />
          </NuxtLink>
        </div>
        <UButton v-if="data.next_cursor" class="mt-6" color="neutral" variant="soft" label="Show more" @click="after = data.next_cursor" />
      </template>
    </div>

    <template v-if="rows.length" #footer>
      <div class="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <p class="text-lg font-semibold text-highlighted">{{ total }}</p>
        <UButton label="Export CSV" size="lg" @click="exportCsv" />
      </div>
    </template>
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import { paymentMoney, paymentStateLabel } from '~/shared/payment-display'
import { downloadCsv, isTransactionsView, type TransactionRow } from '~/shared/earnings-display'
import { formatCalendarDate, formatTimestamp } from '~/utils/timezone'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Transactions | Krabiclaw', robots: 'noindex, nofollow' })

const route = useRoute()
const router = useRouter()
const api = useDashboardApi()
const now = new Date()
const monthKey = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
// The period is a UTC month; a report or the performance page can hand one in.
const from = ref(typeof route.query.from === 'string' ? route.query.from : `${monthKey(now)}-01`)
const through = ref(typeof route.query.through === 'string' ? route.query.through : now.toISOString().slice(0, 10))
const after = ref<string | null>(null)
const loaded = ref<TransactionRow[]>([])
watch([from, through], () => { after.value = null; void router.replace({ query: { ...route.query, from: from.value, through: through.value } }) })

const months = Array.from({ length: 12 }, (_, offset) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1)))
const monthItems = computed(() => [months.map(date => ({
  label: formatCalendarDate(date.toISOString().slice(0, 10), 'en', { month: 'long', year: 'numeric' }),
  type: 'checkbox' as const,
  checked: from.value === `${monthKey(date)}-01`,
  onSelect: () => {
    from.value = `${monthKey(date)}-01`
    through.value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
  },
}))])
const periodLabel = computed(() => from.value.slice(0, 7) === through.value.slice(0, 7)
  ? formatCalendarDate(from.value, 'en', { month: 'long', year: 'numeric' })
  : `${formatCalendarDate(from.value, 'en', { month: 'short', day: 'numeric' })} – ${formatCalendarDate(through.value, 'en', { month: 'short', day: 'numeric', year: 'numeric' })}`)

const { data, pending, error } = await useAsyncData(
  () => `earnings-transactions:${route.params.orgSlug}:${from.value}:${through.value}:${after.value ?? ''}`,
  async () => {
    const start = new Date(`${from.value}T00:00:00.000Z`), end = new Date(`${through.value}T00:00:00.000Z`)
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) throw new Error('Choose a valid period')
    end.setUTCDate(end.getUTCDate() + 1)
    const page = await api<{ payments: TransactionRow[]; next_cursor: string | null }>('/api/dashboard/payments', {
      query: { view: 'transactions', from: start.toISOString(), to: end.toISOString(), ...(after.value ? { after: after.value } : {}) },
      validate: isTransactionsView,
    })
    loaded.value = after.value ? [...loaded.value, ...page.payments] : page.payments
    return page
  },
  { lazy: true, watch: [from, through, after] },
)
// Newest first, as Airbnb lists them.
const rows = computed(() => [...loaded.value].sort((a, b) => b.created_at.localeCompare(a.created_at)))
const total = computed(() => {
  const totals = new Map<string, number>()
  for (const row of rows.value) totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.captured_amount - row.refunded_amount)
  return [...totals].map(([code, amount]) => paymentMoney(amount, code)).join(' · ')
})
function whenLabel(row: TransactionRow): string {
  if (!row.starts_at || !row.timezone) return row.title
  const start = formatTimestamp(row.starts_at, 'en', row.timezone, { month: 'short', day: 'numeric' })
  const end = row.ends_at ? formatTimestamp(row.ends_at, 'en', row.timezone, { month: 'short', day: 'numeric' }) : start
  return `${row.title} · ${start === end ? start : `${start}–${end}`}`
}
function exportCsv() {
  downloadCsv(`transactions-${String(route.params.orgSlug)}-${from.value}.csv`, ['Date', 'Status', 'Buyer', 'Item', 'Paid', 'Refunded', 'Currency', 'Payment ID'],
    rows.value.map(row => [row.created_at.slice(0, 10), paymentStateLabel(row), row.buyer_name ?? '', row.title, (row.captured_amount / 100).toFixed(2), (row.refunded_amount / 100).toFixed(2), row.currency, row.id]))
}
</script>
