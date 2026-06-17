<template>
  <div class="min-h-screen bg-default text-default">

    <template v-if="location">
      <!-- Sub-nav (Level 2) -->
      <SayaSubNav 
        :location-slug="slug" 
        active="qa" 
      />

      <!-- Compact Page header -->
      <header class="mx-auto max-w-7xl px-4 pt-12 pb-10 sm:px-6 lg:px-8 text-center">
        <NuxtLink :to="`/locations/${slug}`" class="saya-kicker mb-8 inline-block text-muted no-underline hover:text-default">
          ← {{ t('saya.qa_page.back_to', { title: location?.title }) }}
        </NuxtLink>
        
        <div class="flex flex-col gap-2">
          <h1 class="saya-display-md text-default">{{ t('saya.qa_page.title') }}</h1>
          <p class="text-sm text-muted">
            {{ t('saya.qa_page.subtitle', { location: location?.title }) }}
          </p>
        </div>
      </header>
    </template>


    <!-- Ask a question band -->
    <section class="border-b border-default border-t bg-elevated">
      <div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <div>
          <p class="saya-eyebrow mb-2 text-muted">{{ t('saya.qa_page.dont_see') }}</p>
          <div class="saya-display saya-italic text-3xl text-default">{{ t('saya.qa_page.ask_us') }}</div>
        </div>
        <!-- Free-tier: trigger upgrade modal; paid: link to GMB Q&A -->
        <button
          v-if="isFree"
          class="inline-flex items-center gap-2 rounded-full border border-default bg-default px-7 py-3.5 text-xs font-medium uppercase tracking-widest text-default transition hover:opacity-70"
          @click="openUpgrade('qa-writeback')"
        >
          <UIcon name="i-heroicons-lock-closed" class="size-3.5" />
          {{ t('saya.qa_page.ask_question_pro') }}
        </button>
        <a
          v-else
          :href="location?.gmb_qa_url || '#'"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center rounded-full bg-default px-7 py-3.5 text-xs font-medium uppercase tracking-widest text-inverted no-underline transition hover:opacity-80"
        >
          {{ t('saya.qa_page.ask_question') }}
        </a>
      </div>
    </section>

    <!-- Q&A list -->
    <section class="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <div v-if="sorted.length === 0" class="flex flex-col items-center justify-center rounded-3xl border border-dashed border-default bg-muted/30 py-20 text-center">
        <div class="flex size-14 items-center justify-center rounded-full bg-elevated/50 text-muted shadow-sm">
          <UIcon name="i-heroicons-question-mark-circle" class="size-7" />
        </div>
        <h3 class="mt-6 saya-display saya-italic text-3xl text-default">{{ t('saya.qa_page.no_questions_title') }}</h3>
        <p class="mt-2 max-w-sm text-sm text-muted">{{ t('saya.qa_page.no_questions_desc') }}</p>
        <div class="mt-8">
          <UButton
            v-if="isFree"
            color="primary"
            variant="soft"
            size="sm"
            class="rounded-full"
            @click="openUpgrade('qa-empty')"
          >
            Ask a question
          </UButton>
          <a
            v-else
            :href="location?.gmb_qa_url || '#'"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center rounded-full bg-primary px-6 py-2.5 text-xs font-semibold uppercase tracking-widest text-(--primary-foreground,#fff) shadow-sm transition hover:opacity-90"
          >
            Ask a question →
          </a>
        </div>
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
                <span>{{ t('saya.qa_page.asked_by', { author: q.question_author }) }}</span>
                <span>·</span>
                <span>{{ formatQaDate(q.question_date) }}</span>
                <template v-if="q.upvote_count > 0">
                  <span>·</span>
                  <span class="inline-flex items-center gap-1">
                    <UIcon name="i-heroicons-hand-thumb-up" class="size-3" />
                    {{ q.upvote_count }} {{ t('saya.qa_page.helpful') }}
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
                  {{ siteName }} · {{ t('saya.qa_page.owner') }}
                </UBadge>
                <span v-else>{{ q.answer_author }}</span>
                <span>·</span>
                <span>{{ formatQaDate(q.answer_date) }}</span>
              </div>
            </div>
          </div>

          <!-- Awaiting answer -->
          <div v-else class="ml-13 mt-4 flex items-center gap-2 text-xs text-muted">
            <UIcon name="i-heroicons-clock" class="size-3.5 opacity-50" />
            {{ t('saya.qa_page.awaiting_answer') }}
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'saya' })

const { t } = useI18n()

const route = useRoute()
const { siteId, site } = useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })
const plan = computed(() => (site as ApiValue)?.plan)
const isFree = computed(() => !plan.value || plan.value === 'free')
const { open: openUpgrade } = useUpgradeModal()

const slug = computed(() => String(route.params.slug))
const siteName = computed(() => (site as ApiValue)?.title || 'KrabiClaw')

const { location, qaList } = useBootstrap()
const { formatDate } = useLocaleDate()

const qa = qaList

const sorted = computed(() =>
  [...qa.value].sort((a, b) => {
    if (a.is_owner_answer !== b.is_owner_answer) return (b.is_owner_answer ?? 0) - (a.is_owner_answer ?? 0)
    return (b.upvote_count ?? 0) - (a.upvote_count ?? 0)
  })
)

function formatQaDate(ts: string | null) {
  if (!ts) return ''
  return formatDate(ts)
}


const config = useRuntimeConfig()
const siteUrl = config.public.siteUrl

useSeoMeta({
  title: () => `Questions and answers for ${location.value?.title} at ${siteName.value}.`,
  description: () => `Questions and answers for ${location.value?.title} at ${siteName.value}.`,
  ogImage: useSharedOgImage(),
  ogUrl: useSeoUrl(() => `/locations/${slug.value}/qa`)
})

useSchemaOrg([
  computed(() => ({
    '@type': 'FAQPage',
    name: `${location.value?.title ?? ''} Q&A`,
    mainEntity: sorted.value.filter((q: ApiValue) => q.answer).map((q: ApiValue) => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: { '@type': 'Answer', text: q.answer }
    }))
  })),
  computed(() => ({
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: siteName.value, item: `${siteUrl}/` },
      { '@type': 'ListItem', position: 2, name: 'Locations', item: `${siteUrl}/locations` },
      { '@type': 'ListItem', position: 3, name: location.value?.title ?? slug.value, item: `${siteUrl}/locations/${slug.value}` },
      { '@type': 'ListItem', position: 4, name: 'Q&A', item: `${siteUrl}/locations/${slug.value}/qa` }
    ]
  }))
])
</script>
