<template>
  <footer class="bg-[var(--blawby-primary-dark)]" aria-labelledby="blawby-footer-heading">
    <h2 id="blawby-footer-heading" class="sr-only">Footer</h2>
    <div class="mx-auto max-w-7xl px-6 pb-8 pt-8 sm:pt-12 lg:px-8 lg:pt-16">
      <div class="xl:grid xl:grid-cols-3 xl:gap-8">
        <div class="space-y-8">
          <NuxtLink to="/" class="inline-flex no-underline" :aria-label="`${brandName} home`">
            <img v-if="footerLogo" :src="footerLogo" :alt="brandName" class="max-h-16 w-auto max-w-[248px]">
            <span v-else class="blawby-display text-2xl text-white">{{ brandName }}</span>
          </NuxtLink>
          <BlawbyRichText
            v-if="description"
            :content="description"
            class="blawby-footer-copy max-w-xl text-sm leading-6 text-gray-300"
          />
          <div v-if="socialItems.length" class="flex gap-6">
            <a
              v-for="item in socialItems"
              :key="item.id"
              :href="item.url"
              class="text-gray-400 transition hover:text-white"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span class="sr-only">{{ item.label }}</span>
              <BlawbySocialIcon :platform="item.label" class="size-6" />
            </a>
          </div>
        </div>

        <div class="mt-16 grid grid-cols-2 gap-8 xl:col-span-2 xl:mt-0">
          <div class="md:grid md:grid-cols-2 md:gap-8">
            <div>
              <h3 class="text-sm font-semibold leading-6 text-white">Services</h3>
              <ul class="mt-6 space-y-4" role="list">
                <li v-for="offering in offeringLinks" :key="offering.id">
                  <NuxtLink :to="offering.canonical_path" class="text-sm leading-6 text-gray-300 no-underline hover:text-white">
                    {{ offering.name }}
                  </NuxtLink>
                </li>
              </ul>
            </div>
            <div class="mt-10 md:mt-0">
              <h3 class="text-sm font-semibold leading-6 text-white">Support</h3>
              <BlawbyFooterLinks :items="supportItems" />
            </div>
          </div>

          <div class="md:grid md:grid-cols-2 md:gap-8">
            <div>
              <h3 class="text-sm font-semibold leading-6 text-white">Company</h3>
              <BlawbyFooterLinks :items="companyItems" />
            </div>
            <div class="mt-10 md:mt-0">
              <h3 class="text-sm font-semibold leading-6 text-white">Legal</h3>
              <BlawbyFooterLinks :items="legalItems" />
            </div>
          </div>
        </div>
      </div>

      <div class="mt-16 border-t border-white/10 pt-8 sm:mt-20 lg:mt-24">
        <p class="text-xs leading-5 text-gray-400">
          Copyright &copy; {{ year }} {{ compliance?.entity_name || brandName }}. All rights reserved.
        </p>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import type { PublicBlawbyIdentity, PublicCompliance, PublicNavigationItem, PublicOfferingLink } from '~/types/blawby'

const props = defineProps<{
  site: PublicBlawbyIdentity
  navigation: PublicNavigationItem[]
  compliance: PublicCompliance | null
  offeringLinks: PublicOfferingLink[]
}>()

const year = new Date().getFullYear()
const brandName = computed(() => props.site.brand_name || props.compliance?.entity_name || 'Blawby')
const description = computed(() => props.compliance?.footer_disclaimer || props.site.brand_description || '')
const footerLogo = computed(() => typeof props.compliance?.metadata?.logo_dark_url === 'string'
  ? props.compliance.metadata.logo_dark_url
  : props.site.logo_url)
const footerItems = computed(() => props.navigation.filter(item => item.area === 'footer'))
const socialItems = computed(() => props.navigation.filter(item => item.area === 'social' && item.url !== '/none'))

function groupItems(group: string) {
  return footerItems.value.filter(item => item.metadata?.group === group)
}

const supportItems = computed<PublicNavigationItem[]>(() => {
  const configured = groupItems('support')
  if (configured.length) return configured
  return [
    { id: 'support-consultation', area: 'footer', label: 'Request a Consultation', url: '/schedule', item_type: 'internal', sort_order: 10, metadata: { group: 'support' } },
    { id: 'support-contact', area: 'footer', label: 'Contact', url: '/contact', item_type: 'internal', sort_order: 20, metadata: { group: 'support' } },
    { id: 'support-pricing', area: 'footer', label: 'Pricing', url: '/pricing', item_type: 'internal', sort_order: 30, metadata: { group: 'support' } },
  ]
})

const companyItems = computed<PublicNavigationItem[]>(() => {
  const configured = groupItems('company')
  if (configured.length) return configured
  return [
    { id: 'company-about', area: 'footer', label: 'About', url: '/about', item_type: 'internal', sort_order: 10, metadata: { group: 'company' } },
    { id: 'company-donate', area: 'footer', label: 'Donate', url: '/donate', item_type: 'internal', sort_order: 20, metadata: { group: 'company' } },
    { id: 'company-blog', area: 'footer', label: 'Blog', url: '/blog', item_type: 'internal', sort_order: 30, metadata: { group: 'company' } },
  ]
})

const legalItems = computed<PublicNavigationItem[]>(() => {
  const configured = props.navigation.filter(item => item.area === 'legal')
  if (configured.length) return configured
  return [
    { id: 'privacy', area: 'legal', label: 'Privacy', url: '/policies/privacy', item_type: 'internal', sort_order: 10, metadata: {} },
    { id: 'terms', area: 'legal', label: 'Terms', url: '/policies/terms', item_type: 'internal', sort_order: 20, metadata: {} },
    { id: 'notices', area: 'legal', label: 'Third Party Notices', url: '/third-party-notices', item_type: 'internal', sort_order: 30, metadata: {} },
  ]
})

</script>

<style scoped>
.blawby-footer-copy :deep(.prose),
.blawby-footer-copy :deep(p),
.blawby-footer-copy :deep(a) {
  color: inherit;
  font-size: inherit;
  line-height: inherit;
}

.blawby-footer-copy :deep(a) {
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>
