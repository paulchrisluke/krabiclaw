<template>
  <footer class="bg-[var(--blawby-primary-dark)]" aria-labelledby="blawby-footer-heading">
    <h2 id="blawby-footer-heading" class="sr-only">Footer</h2>
    <div class="mx-auto max-w-7xl px-6 pb-8 pt-8 sm:pt-12 lg:px-8 lg:pt-16">
      <div class="xl:grid xl:grid-cols-3 xl:gap-8">
        <div class="space-y-8">
          <NuxtLink v-if="brandName || footerLogo" to="/" class="inline-flex no-underline" :aria-label="`${brandName} home`">
            <img v-if="footerLogo" :src="footerLogo" :alt="brandName" loading="lazy" decoding="async" class="max-h-16 w-auto max-w-[248px]">
            <span v-else class="blawby-display text-2xl text-white">{{ brandName }}</span>
          </NuxtLink>
          <BlawbyRichText
            v-if="description"
            :content="description"
            class="blawby-footer-copy max-w-xl text-sm leading-6 text-gray-300"
          />
          <ul v-if="documents.length" class="flex flex-wrap gap-x-4 gap-y-2 text-sm" role="list">
            <li v-for="document in documents" :key="document.asset_id">
              <a :href="document.public_url!" class="blawby-footer-link" target="_blank" rel="noopener">{{ document.alt_text || document.file_name || 'Document' }}</a>
            </li>
          </ul>
        </div>

        <div class="mt-16 grid grid-cols-2 gap-8 md:grid-cols-4 xl:col-span-2 xl:mt-0">
          <div v-if="offeringLinks.length">
            <h3 class="text-sm font-semibold leading-6 text-white">Services</h3>
            <ul class="mt-6 space-y-4" role="list">
              <li v-for="offering in offeringLinks" :key="offering.id">
                <NuxtLink :to="offering.canonical_path" class="blawby-footer-link text-sm leading-6 no-underline">
                  {{ offering.name }}
                </NuxtLink>
              </li>
            </ul>
          </div>
          <div v-for="group in footerGroups" :key="group.label" v-show="group.items.length">
            <h3 class="text-sm font-semibold leading-6 text-white">{{ group.label }}</h3>
            <ul class="mt-6 space-y-4" role="list">
              <li v-for="item in group.items" :key="item.id">
                <NuxtLink :to="item.path" class="blawby-footer-link text-sm leading-6 no-underline">{{ item.label }}</NuxtLink>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div class="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-8 sm:mt-20 lg:mt-24">
        <p class="text-xs leading-5 text-gray-400">
          Copyright &copy; {{ year }} {{ compliance?.entity_name || brandName }}. All rights reserved.
        </p>
        <button type="button" class="blawby-footer-link text-xs underline" @click="showZarazConsentModal">
          Cookie preferences
        </button>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import type { PublicBlawbyIdentity, PublicBlawbyPageLink, PublicCompliance, PublicOfferingLink } from '~/types/blawby'
import { showZarazConsentModal } from '~/utils/zaraz-consent'

const props = defineProps<{
  site: PublicBlawbyIdentity
  compliance: PublicCompliance | null
  offeringLinks: PublicOfferingLink[]
  pageLinks: PublicBlawbyPageLink[]
}>()

const year = new Date().getFullYear()
const brandName = computed(() => props.site.brand_name || props.compliance?.entity_name || '')
const description = computed(() => props.compliance?.footer_disclaimer || props.site.brand_description || '')
const documents = computed(() => props.compliance?.media.filter(item => item.slot === 'document' && item.public_url) ?? [])
const footerLogo = computed(() => props.site.media.find(item => item.slot === 'logo_dark')?.public_url
  || props.site.media.find(item => item.slot === 'logo')?.public_url
  || null)
const pageLabels: Record<string, string> = {
  '/schedule': 'Request a Consultation', '/contact': 'Contact', '/pricing': 'Pricing',
  '/about': 'About', '/donate': 'Donate', '/blog': 'Blog',
  '/policies/privacy': 'Privacy', '/policies/terms': 'Terms',
  '/third-party-notices': 'Third Party Notices',
}
function linksFor(paths: string[]) {
  const byPath = new Map(props.pageLinks.map(item => [item.path, item]))
  return paths.flatMap(path => {
    const item = byPath.get(path)
    return item ? [{ ...item, label: pageLabels[path]! }] : []
  })
}
const footerGroups = computed(() => [
  { label: 'Support', items: linksFor(['/schedule', '/contact', '/pricing']) },
  { label: 'Company', items: linksFor(['/about', '/donate', '/blog']) },
  { label: 'Legal', items: linksFor(['/policies/privacy', '/policies/terms', '/third-party-notices']) },
])
</script>

<style scoped>
.blawby-footer-link {
  color: #d1d5db;
}

.blawby-footer-link:hover {
  color: #fff;
}
</style>
