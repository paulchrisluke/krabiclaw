<template>
  <div class="min-h-screen bg-default text-default">

    <nav class="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
      <UBreadcrumb :items="breadcrumb" />
    </nav>

    <header class="mx-auto max-w-7xl px-4 py-14 text-center sm:px-6 lg:px-8">
      <p class="saya-kicker mb-6">{{ location?.title }}</p>
      <h1 class="saya-display-lg text-default">
        <em class="saya-italic">Frequently</em> asked
      </h1>
      <p class="mx-auto mt-5 max-w-md text-sm text-muted">
        Questions asked by guests on Google. Owner-answered questions are pinned to the top.
      </p>
    </header>

    <SayaSubNav :location-slug="slug" active="qa" :review-count="location?.review_count" :qa-count="qa.length" />

    <!-- Ask a question band -->
    <section class="border-b border-default border-t bg-elevated">
      <div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <div>
          <p class="saya-eyebrow mb-2 text-muted">Don't see your question?</p>
          <div class="saya-display saya-italic text-3xl text-default">Ask us — it'll show up here.</div>
        </div>
        <!-- Free-tier: trigger upgrade modal; paid: link to GMB Q&A -->
        <button
          v-if="isFree"
          class="inline-flex items-center gap-2 rounded-full border border-default bg-default px-7 py-3.5 text-xs font-medium uppercase tracking-widest text-default transition hover:opacity-70"
          @click="openUpgrade('qa-writeback')"
        >
          <UIcon name="i-heroicons-lock-closed" class="size-3.5" />
          Ask a question · Pro
        </button>
        <a
          v-else
          :href="location?.gmb_qa_url || '#'"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center rounded-full bg-default px-7 py-3.5 text-xs font-medium uppercase tracking-widest text-inverted no-underline transition hover:opacity-80"
        >
          Ask a question →
        </a>
      </div>
    </section>

    <!-- Loading -->
    <div v-if="pending" class="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <div v-for="i in 3" :key="i" class="mb-6 rounded-3xl border border-default p-9">
        <USkeleton class="mb-4 h-5 w-3/4" />
        <USkeleton class="h-4 w-full" />
        <USkeleton class="mt-2 h-4 w-2/3" />
      </div>
    </div>

    <!-- Q&A list -->
    <section class="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <div v-if="sorted.length === 0 && !pending" class="rounded-3xl border border-dashed border-default p-14 text-center">
        <div class="saya-display saya-italic text-2xl text-default">No questions yet.</div>
        <p class="mt-2 text-sm text-muted">Be the first — ask anything about the menu, hours, or the room.</p>
      </div>

      <div v-else class="flex flex-col gap-6">
        <article
          v-for="q in sorted"
          :key="q.id"
          class="rounded-3xl border border-default bg-default p-8 sm:p-9"
        >
          <!-- Question -->
          <div class="flex gap-5">
            <div class="saya-display saya-italic flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-lg text-default">Q</div>
            <div class="flex-1 min-w-0">
              <p class="text-base font-medium leading-snug text-default">{{ q.question }}</p>
              <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>Asked by {{ q.question_author }}</span>
                <span>·</span>
                <span>{{ formatDate(q.question_date) }}</span>
                <template v-if="q.upvote_count > 0">
                  <span>·</span>
                  <span class="inline-flex items-center gap-1">
                    <UIcon name="i-heroicons-hand-thumb-up" class="size-3" />
                    {{ q.upvote_count }} found this helpful
                  </span>
                </template>
              </div>
            </div>
          </div>

          <!-- Answer -->
          <div
            v-if="q.answer"
            :class="[
              'ml-13 mt-5 flex gap-5 rounded-2xl p-5',
              q.is_owner_answer ? 'border-l-4 border-primary bg-elevated' : 'bg-muted'
            ]"
          >
            <div class="saya-display saya-italic flex size-7 shrink-0 items-center justify-center rounded-full bg-default text-sm text-inverted">A</div>
            <div class="flex-1 min-w-0">
              <p class="text-sm leading-relaxed text-default">{{ q.answer }}</p>
              <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                <UBadge v-if="q.is_owner_answer" color="neutral" size="xs" class="font-semibold">
                  {{ siteName }} · Owner
                </UBadge>
                <span v-else>{{ q.answer_author }}</span>
                <span>·</span>
                <span>{{ formatDate(q.answer_date) }}</span>
              </div>
            </div>
          </div>

          <!-- Awaiting answer -->
          <div v-else class="ml-13 mt-4 flex items-center gap-2 text-xs text-muted">
            <UIcon name="i-heroicons-clock" class="size-3.5 opacity-50" />
            Awaiting answer from the team.
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'saya' })

const route = useRoute()
const { siteId, site } = useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })
const isFree = computed(() => !((site as any)?.value?.plan || (site as any)?.plan) || ((site as any)?.value?.plan || (site as any)?.plan) === 'free')
const { open: openUpgrade } = useUpgradeModal()

const slug = computed(() => String(route.params.slug))
const siteName = computed(() => (site as any)?.value?.name || (site as any)?.name || 'Saya')

const { data: locData } = await useFetch(
  () => `/api/public/sites/${siteId}/locations/${slug.value}`,
  { key: () => `loc-qa-loc-${siteId}-${slug.value}`, default: () => ({ location: null }) }
)
const location = computed(() => (locData as any).value?.location ?? null)

const { data, pending } = await useFetch(
  () => `/api/public/sites/${siteId}/locations/${slug.value}/qa`,
  { key: () => `loc-qa-${siteId}-${slug.value}`, default: () => ({ qa: [] }) }
)
const qa = computed(() => (data as any).value?.qa ?? [])

const sorted = computed(() =>
  [...qa.value].sort((a, b) => {
    if (a.is_owner_answer !== b.is_owner_answer) return (b.is_owner_answer ?? 0) - (a.is_owner_answer ?? 0)
    return (b.upvote_count ?? 0) - (a.upvote_count ?? 0)
  })
)

function formatDate(ts: string | null) {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

const breadcrumb = computed(() => [
  { label: siteName.value, to: '/' },
  { label: 'Locations', to: '/locations' },
  { label: location.value?.title || slug.value, to: `/locations/${slug.value}` },
  { label: 'Q&A' }
])

useSeoMeta({
  title: () => `Q&A · ${location.value?.title || slug.value}`,
  description: () => `Questions and answers for ${location.value?.title} at ${siteName.value}.`,
  ogUrl: () => `/locations/${slug.value}/qa`
})

useSchemaOrg([
  computed(() => ({
    '@type': 'FAQPage',
    name: `${location.value?.title ?? ''} Q&A`,
    mainEntity: sorted.value.filter((q: any) => q.answer).map((q: any) => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: { '@type': 'Answer', text: q.answer }
    }))
  })),
  computed(() => ({
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: siteName.value, item: '/' },
      { '@type': 'ListItem', position: 2, name: 'Locations', item: '/locations' },
      { '@type': 'ListItem', position: 3, name: location.value?.title ?? slug.value, item: `/locations/${slug.value}` },
      { '@type': 'ListItem', position: 4, name: 'Q&A', item: `/locations/${slug.value}/qa` }
    ]
  }))
])
</script>
