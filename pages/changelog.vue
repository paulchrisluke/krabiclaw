<template>
  <div class="container mx-auto px-4 py-16">
    <div class="max-w-3xl mx-auto">
      <h1 class="text-4xl font-bold text-default mb-6">Changelog</h1>
      <p class="text-lg text-muted mb-12">Latest updates and improvements to KrabiClaw</p>

      <div v-if="loading" class="text-center py-12">
        <p class="text-muted">Loading changelog...</p>
      </div>

      <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-6" role="alert">
        <p class="text-red-600">{{ error }}</p>
      </div>

      <div v-else class="space-y-8">
        <div v-for="(commits, type) in changelog.commits" :key="type" class="bg-elevated rounded-2xl shadow-sm border border-default p-8">
          <div class="flex items-center gap-4 mb-4">
            <span :class="getBadgeClass(type)" class="text-white px-3 py-1 rounded-full text-sm font-medium capitalize">{{ type }}</span>
            <span class="text-muted text-sm">{{ commits.length }} commits</span>
          </div>
          <div v-for="commit in commits" :key="commit.number" class="mb-4 last:mb-0">
            <h3 class="text-lg font-semibold text-default mb-1">
              <a :href="commit.url" target="_blank" rel="noopener" class="hover:underline">{{ commit.description }}</a>
            </h3>
            <p class="text-sm text-muted">
              {{ commit.author }}<span v-if="commit.mergedAt"> ·</span>
              <NuxtTime v-if="commit.mergedAt" :datetime="commit.mergedAt" locale="en-US" year="numeric" month="long" day="numeric" time-zone="UTC" />
              <span v-if="commit.scope" class="ml-2 text-muted">({{ commit.scope }})</span>
            </p>
          </div>
        </div>

        <div class="text-center text-sm text-muted">
          <span v-if="changelog.lastUpdated">Last updated:</span>
          <NuxtTime v-if="changelog.lastUpdated" :datetime="changelog.lastUpdated" locale="en-US" year="numeric" month="long" day="numeric" time-zone="UTC" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'platform' })

const changelog = ref({ commits: {}, total: 0, lastUpdated: '' })
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    const response = await $fetch('/api/changelog')
    changelog.value = response
  } catch {
    error.value = 'Failed to load changelog'
  } finally {
    loading.value = false
  }
})


function getBadgeClass(type) {
  const classes = {
    feat: 'bg-(--kc-coral)',
    fix: 'bg-(--kc-teal)',
    chore: 'bg-(--kc-navy)',
    docs: 'bg-purple-500',
    style: 'bg-pink-500',
    refactor: 'bg-blue-500',
    perf: 'bg-green-500',
    test: 'bg-yellow-500',
    build: 'bg-orange-500',
    ci: 'bg-gray-500',
    other: 'bg-gray-400'
  }
  return classes[type] || classes.other
}

usePlatformPageSeo({
  path: '/changelog',
  title: 'Changelog',
  description: 'Latest updates and improvements to KrabiClaw business website builder.',
  pageType: 'CollectionPage',
  breadcrumbs: [
    { name: 'Home', url: '/' },
    { name: 'Changelog', url: '/changelog' },
  ],
})
</script>
