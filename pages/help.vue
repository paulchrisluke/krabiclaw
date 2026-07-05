<template>
  <div class="min-h-screen bg-default text-default">
    <PlatformHeader />

    <main class="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <div class="overflow-hidden rounded-[32px] border border-default bg-default shadow-sm">
        <section class="border-b border-default px-6 py-10 sm:px-10 sm:py-12">
          <div class="max-w-4xl">
            <span class="inline-flex items-center gap-2 rounded-full bg-emerald-500/12 px-4 py-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              <span class="size-2 rounded-full bg-emerald-500" />
              All systems normal.
            </span>

            <h1 class="mt-8 text-4xl font-bold tracking-tight text-default sm:text-5xl">KrabiClaw Support</h1>
            <p class="mt-3 text-3xl font-semibold tracking-tight text-muted sm:text-4xl">How can we help you today?</p>

            <div class="mt-8 grid gap-4 md:grid-cols-2">
              <NuxtLink
                v-for="card in routeCards"
                :key="card.to"
                :to="card.to"
                class="group rounded-3xl border border-default bg-elevated/40 p-6 no-underline transition hover:border-muted hover:bg-elevated"
              >
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <p class="text-lg font-semibold text-default">{{ card.title }}</p>
                    <p class="mt-3 text-sm leading-relaxed text-muted">{{ card.description }}</p>
                  </div>
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    class="mt-1 size-5 shrink-0 text-muted transition group-hover:text-default"
                    aria-hidden="true"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" d="M7 13 13 7M8 7h5v5" />
                  </svg>
                </div>
              </NuxtLink>
            </div>

          </div>
        </section>

        <PublicHelpChatIsland />
      </div>
    </main>

    <LazyPlatformFooter />
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { PUBLIC_SUPPORT_FAQ_ENTRIES, PUBLIC_SUPPORT_ROUTE_CARDS } from '~/utils/public-support'

definePageMeta({ layout: false })

const routeCards = PUBLIC_SUPPORT_ROUTE_CARDS
const PublicHelpChatIsland = defineAsyncComponent(() => import('~/components/platform/PublicHelpChowBot.vue'))

usePlatformPageSeo({
  path: '/help',
  title: 'Support',
  description: 'Get help with KrabiClaw, browse docs and product updates, or open a support request through ChowBot support.',
  breadcrumbs: [
    { name: 'Home', url: '/' },
    { name: 'Support', url: '/help' },
  ],
  faqItems: PUBLIC_SUPPORT_FAQ_ENTRIES.map(item => ({
    question: item.title,
    answer: item.answer,
  })),
})
</script>
