<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-3xl font-bold text-(--ui-text-highlighted)">Insights</h1>
      <p class="text-stone-400 mt-2">Performance metrics and analytics for your website.</p>
    </div>

    <!-- Stat Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      <UCard>
        <div class="p-6">
          <div class="text-sm text-stone-400 mb-2">Total clicks</div>
          <div class="text-2xl font-bold text-(--ui-text-highlighted)">
            {{ gscData?.totals?.clicks ?? '—' }}
          </div>
        </div>
      </UCard>
      <UCard>
        <div class="p-6">
          <div class="text-sm text-stone-400 mb-2">Total impressions</div>
          <div class="text-2xl font-bold text-(--ui-text-highlighted)">
            {{ gscData?.totals?.impressions ?? '—' }}
          </div>
        </div>
      </UCard>
      <UCard>
        <div class="p-6">
          <div class="text-sm text-stone-400 mb-2">Average position</div>
          <div class="text-2xl font-bold text-(--ui-text-highlighted)">
            {{ gscData?.totals?.position ? formatPosition(gscData.totals.position) : '—' }}
          </div>
        </div>
      </UCard>
      <UCard>
        <div class="p-6">
          <div class="text-sm text-stone-400 mb-2">Sessions this week</div>
          <div class="text-2xl font-bold text-(--ui-text-highlighted)">
            {{ analyticsData?.sessions ?? '—' }}
          </div>
        </div>
      </UCard>
    </div>

    <!-- Top Search Queries -->
    <div class="bg-(--ui-bg) rounded-3xl border border-stone-200 p-8">
      <h2 class="text-xl font-bold text-(--ui-text-highlighted) mb-6">Top Search Queries</h2>
      <div v-if="gscData?.rows?.length" class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-stone-100">
              <th class="text-left text-sm font-medium text-stone-400 pb-3">Query</th>
              <th class="text-right text-sm font-medium text-stone-400 pb-3">Clicks</th>
              <th class="text-right text-sm font-medium text-stone-400 pb-3">Impressions</th>
              <th class="text-right text-sm font-medium text-stone-400 pb-3">Position</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in sortedGscRows" :key="row.query" class="border-b border-stone-50">
              <td class="py-3 text-sm text-(--ui-text-highlighted)">{{ row.query }}</td>
              <td class="py-3 text-sm text-(--ui-text-highlighted) text-right">{{ row.clicks }}</td>
              <td class="py-3 text-sm text-(--ui-text-highlighted) text-right">{{ row.impressions }}</td>
              <td class="py-3 text-sm text-(--ui-text-highlighted) text-right">{{ formatPosition(row.position) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="text-center py-8 text-stone-400">
        No data yet
      </div>
      <div class="mt-4 text-xs text-stone-400">
        Powered by Google Search Console
      </div>
    </div>

    <!-- Top Pages -->
    <div class="bg-(--ui-bg) rounded-3xl border border-stone-200 p-8">
      <h2 class="text-xl font-bold text-(--ui-text-highlighted) mb-6">Top Pages</h2>
      <div v-if="analyticsData?.topPages?.length" class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-stone-100">
              <th class="text-left text-sm font-medium text-stone-400 pb-3">Page</th>
              <th class="text-right text-sm font-medium text-stone-400 pb-3">Sessions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="page in analyticsData.topPages" :key="page.path" class="border-b border-stone-50">
              <td class="py-3 text-sm text-(--ui-text-highlighted)">{{ page.path }}</td>
              <td class="py-3 text-sm text-(--ui-text-highlighted) text-right">{{ page.sessions }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="text-center py-8 text-stone-400">
        No data yet
      </div>
      <div class="mt-4 text-xs text-stone-400">
        Powered by Google Analytics
      </div>
    </div>

    <!-- Traffic Sources -->
    <div class="bg-(--ui-bg) rounded-3xl border border-stone-200 p-8">
      <h2 class="text-xl font-bold text-(--ui-text-highlighted) mb-6">Traffic Sources</h2>
      <div v-if="analyticsData?.sources?.length" class="space-y-3">
        <div v-for="source in analyticsData.sources" :key="source.name" class="flex justify-between items-center py-2 border-b border-stone-50">
          <span class="text-sm text-(--ui-text-highlighted)">{{ source.name }}</span>
          <span class="text-sm font-medium text-(--ui-text-highlighted)">{{ source.sessions }}</span>
        </div>
      </div>
      <div v-else class="text-center py-8 text-stone-400">
        No data yet
      </div>
      <div class="mt-4 text-xs text-stone-400">
        Powered by Google Analytics
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'dashboard' })

const { data: gscData } = await useFetch('/api/dashboard/insights/search-console', {
  key: 'search-console-data'
})

const { data: analyticsData } = await useFetch('/api/dashboard/insights/analytics', {
  key: 'analytics-data'
})

const sortedGscRows = computed(() => {
  if (!gscData.value?.rows) return []
  return [...gscData.value.rows].sort((a, b) => b.clicks - a.clicks)
})

const formatPosition = (position) => {
  return typeof position === 'number' ? position.toFixed(1) : position
}

useSeoMeta({ title: 'Insights | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
