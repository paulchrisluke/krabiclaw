<template>
  <NuxtLink
    :to="`/dashboard/account/activity/${item.kind}/${encodeURIComponent(item.id)}`"
    class="group flex items-center gap-4 rounded-2xl border border-default bg-default p-4 no-underline transition-colors hover:bg-elevated"
    :data-testid="`account-activity-${item.kind}-${item.id}`"
  >
    <span class="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-elevated">
      <img v-if="item.imageUrl" :src="item.imageUrl" alt="" class="size-full object-cover" loading="lazy">
      <UIcon v-else :name="item.kind === 'order' ? 'i-lucide-shopping-bag' : item.kind === 'payment' ? 'i-lucide-receipt' : 'i-lucide-calendar-days'" class="size-8 text-dimmed" />
    </span>
    <span class="min-w-0 flex-1">
      <span class="block truncate text-base font-semibold text-highlighted">{{ item.title }}</span>
      <span v-if="item.organizationName" class="mt-1 block truncate text-sm text-muted">{{ item.organizationName }}</span>
      <span class="mt-1 block text-sm text-muted">{{ dateLabel }}</span>
      <span class="mt-1 block text-xs text-dimmed">{{ accountActivityStatusLabel(item.status) }}</span>
    </span>
    <UIcon name="i-lucide-chevron-right" class="size-5 shrink-0 text-dimmed group-hover:text-highlighted" />
  </NuxtLink>
</template>

<script lang="ts">
export function accountActivityStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Pending', confirmed: 'Confirmed', cancelled: 'Cancelled',
    captured: 'Paid', refunded: 'Refunded', failed: 'Failed', recovery: 'Needs attention',
    unfulfilled: 'Awaiting fulfillment', fulfilled: 'Fulfilled',
  }
  const label = labels[status]
  if (!label) throw createError({ statusCode: 502, statusMessage: 'Activity status could not be read.', fatal: true })
  return label
}
</script>

<script setup lang="ts">
import type { AccountActivityItem } from '~/shared/account-activity'
import { formatTimestamp } from '~/utils/timezone'
const props = defineProps<{ item: AccountActivityItem }>()
const dateLabel = computed(() => props.item.startsAt && props.item.timeZone
  ? formatTimestamp(props.item.startsAt, 'en', props.item.timeZone)
  : `${props.item.kind === 'order' ? 'Ordered ' : ''}${formatTimestamp(props.item.createdAt, 'en', 'UTC', { dateStyle: 'medium' })}`)
</script>
