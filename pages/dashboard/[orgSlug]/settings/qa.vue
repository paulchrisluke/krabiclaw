<template>
  <DashboardIndexPanel id="organization-qa" title="Reviews and Q&A">
    <UTabs v-model="tab" :items="tabs" class="w-full">
      <template #qa>
        <QaList class="mt-4" />
      </template>
      <template #reviews>
        <TestimonialList class="mt-4" />
      </template>
    </UTabs>
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import QaList from '~/components/dashboard/QaList.vue'
import TestimonialList from '~/components/dashboard/TestimonialList.vue'

// A row on Menu, nested under it so Menu is both its pane and its Back; the URL stays `/qa`.
definePageMeta({ layout: 'dashboard', path: '/dashboard/:orgSlug/qa' })

const route = useRoute()


// One surface for the trust content a guest reads: the questions a tenant
// answers and the reviews they import or enter. Two tables, one card.
const tabs = [
  { label: 'Q&A', slot: 'qa' as const, value: 'qa' },
  { label: 'Reviews', slot: 'reviews' as const, value: 'reviews' },
]
// The open tab lives in the URL, so a review notification can land on Reviews.
const router = useRouter()
const tab = computed({
  get: () => (route.query.tab === 'reviews' ? 'reviews' : 'qa'),
  set: (value: string | number) => { void router.replace({ query: { ...route.query, tab: value === 'reviews' ? 'reviews' : undefined } }) },
})

useSeoMeta({ title: 'Reviews and Q&A | KrabiClaw', robots: 'noindex, nofollow' })
</script>
