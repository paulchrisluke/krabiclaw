<template>
  <!-- Every business this account can manage; choosing one makes it the session's active organization and opens it. -->
  <DashboardLeafPanel id="account-businesses" title="Businesses" lead="Choose which business to manage, or start a new one." :footer="false">
    <div class="divide-y divide-default border-y border-default">
      <component
        :is="peer.to ? NuxtLink : 'button'"
        v-for="peer in businesses"
        :key="peer.label"
        :to="peer.to"
        :type="peer.to ? undefined : 'button'"
        class="flex w-full items-center gap-4 py-4 text-left"
        @click="peer.onSelect?.()"
      >
        <UAvatar :src="marks[peer.id ?? ''] ?? undefined" :alt="peer.label" :text="peer.label.slice(0, 1)" size="lg" class="shrink-0 rounded-xl" />
        <span class="min-w-0 flex-1 text-base font-medium text-highlighted">{{ peer.label }}</span>
        <UIcon :name="peer.active ? 'i-lucide-check' : 'i-lucide-chevron-right'" class="size-5 shrink-0 text-muted" />
      </component>
    </div>
    <UButton v-if="createAction" class="mt-6" color="neutral" variant="soft" icon="i-lucide-plus" :label="createAction.label" :to="createAction.to" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { NuxtLink } from '#components'
import { dashboardScopeHeaderModelKey } from '~/lib/components/workspace/dashboard/dashboardScopeHeaderContext'

definePageMeta({ layout: 'dashboard' })

const model = inject(dashboardScopeHeaderModelKey)!
const businesses = computed(() => model.value.peers.filter(peer => peer.label !== 'Personal'))
// Each business's mark, as Airbnb's listing rows carry their picture; the switcher itself does not load it.
type Business = { id: string; imageUrl: string | null }
const isBusinessList = (value: unknown): value is { businesses: Business[] } => isRecord(value) && Array.isArray(value.businesses) && value.businesses.every(row => isRecord(row) && typeof row.id === 'string' && (row.imageUrl === null || typeof row.imageUrl === 'string'))
const { data: marksData } = await useAsyncData('account-businesses', () => applicationFetch<{ businesses: Business[] }>('/api/account/businesses', { validate: isBusinessList }), { lazy: true })
const marks = computed(() => Object.fromEntries((marksData.value?.businesses ?? []).map(row => [row.id, row.imageUrl])))
const createAction = computed(() => model.value.createAction)
</script>
