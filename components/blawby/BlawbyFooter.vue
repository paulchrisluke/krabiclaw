<template>
  <footer class="border-t border-[var(--blawby-border)] bg-[var(--blawby-primary)] text-white">
    <div class="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
      <div>
        <p class="font-display text-2xl">{{ brandName }}</p>
        <p v-if="description" class="mt-4 max-w-xl text-sm leading-7 text-white/75">{{ description }}</p>
        <p v-if="compliance?.footer_disclaimer" class="mt-5 max-w-xl text-xs leading-6 text-white/60">
          {{ stripHtml(compliance.footer_disclaimer) }}
        </p>
      </div>

      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--blawby-accent)]">Explore</p>
        <nav class="mt-5 flex flex-col gap-3 text-sm" aria-label="Footer navigation">
          <NuxtLink
            v-for="item in footerItems"
            :key="item.id"
            :to="item.url"
            class="text-white/75 no-underline hover:text-white"
          >
            {{ item.label }}
          </NuxtLink>
        </nav>
      </div>

      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--blawby-accent)]">Legal</p>
        <nav class="mt-5 flex flex-col gap-3 text-sm" aria-label="Legal navigation">
          <NuxtLink
            v-for="item in legalItems"
            :key="item.id"
            :to="item.url"
            class="text-white/75 no-underline hover:text-white"
          >
            {{ item.label }}
          </NuxtLink>
        </nav>
        <p v-if="compliance?.nonprofit_status" class="mt-6 text-xs text-white/60">{{ compliance.nonprofit_status }}</p>
        <div v-if="documentLinks.length" class="mt-6 flex flex-col gap-3 text-xs">
          <a
            v-for="document in documentLinks"
            :key="document.id"
            :href="document.url"
            class="text-white/70 underline-offset-4 hover:text-white hover:underline"
          >
            {{ document.label || document.file_name || 'Legal document' }}
          </a>
        </div>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import type { PublicCompliance, PublicNavigationItem } from '~/types/blawby'

const props = defineProps<{
  site: { brand_name?: string | null; brand_description?: string | null } | null
  navigation: PublicNavigationItem[]
  compliance: PublicCompliance | null
}>()

const brandName = computed(() => props.site?.brand_name || props.compliance?.entity_name || 'Blawby')
const description = computed(() => props.site?.brand_description || props.compliance?.service_area || '')
const footerItems = computed(() => props.navigation.filter(item => item.area === 'footer'))
type DocumentLink = NonNullable<PublicCompliance['documents'][number]> & { url: string }

const documentLinks = computed(() =>
  props.compliance?.documents.filter((document): document is DocumentLink => Boolean(document.url)) ?? []
)
const legalItems = computed(() => {
  const configured = props.navigation.filter(item => item.area === 'legal')
  if (configured.length) return configured
  return [
    { id: 'privacy', area: 'legal', label: 'Privacy Policy', url: '/policies/privacy', item_type: 'internal', sort_order: 10, metadata: {} },
    { id: 'terms', area: 'legal', label: 'Terms', url: '/policies/terms', item_type: 'internal', sort_order: 20, metadata: {} },
    { id: 'notices', area: 'legal', label: 'Third-Party Notices', url: '/third-party-notices', item_type: 'internal', sort_order: 30, metadata: {} },
  ] as PublicNavigationItem[]
})

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}
</script>
