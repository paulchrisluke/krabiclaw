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
        </div>

        <div v-if="offeringLinks.length" class="mt-16 xl:col-span-2 xl:mt-0">
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
import type { PublicBlawbyIdentity, PublicCompliance, PublicOfferingLink } from '~/types/blawby'

const props = defineProps<{
  site: PublicBlawbyIdentity
  compliance: PublicCompliance | null
  offeringLinks: PublicOfferingLink[]
}>()

const year = new Date().getFullYear()
const brandName = computed(() => props.site.brand_name || props.compliance?.entity_name || '')
const description = computed(() => props.compliance?.footer_disclaimer || props.site.brand_description || '')
const footerLogo = computed(() => typeof props.compliance?.metadata?.logo_dark_url === 'string'
  ? props.compliance.metadata.logo_dark_url
  : props.site.logo_url)
</script>
