<template>
  <section v-if="people.length" class="bg-[var(--blawby-accent-200)] pb-16" data-parity-section="team">
    <div class="mx-auto max-w-7xl px-6 lg:px-8">
      <ul class="-mt-12 space-y-12 divide-y divide-gray-200" role="list">
        <li v-for="person in people" :key="`${person.first_name}-${person.last_name}`" class="flex flex-col gap-10 pt-12 sm:flex-row">
          <img v-if="person.media[0]?.public_url" :src="person.media[0].public_url" :alt="`${person.first_name} ${person.last_name}`" width="640" height="480" loading="lazy" class="w-2/5 flex-none rounded-2xl object-cover">
          <div class="max-w-xl flex-auto">
            <h3 class="blawby-display text-3xl font-bold text-[var(--blawby-primary)] sm:text-4xl">{{ person.first_name }} {{ person.last_name }}</h3>
            <p v-if="person.title" class="text-base leading-7 text-gray-600">{{ person.title }}</p>
            <div v-if="person.bio" class="mt-6 text-base leading-7 text-[var(--blawby-primary)]">
              <div class="flex items-start gap-3">{{ person.bio }}</div>
            </div>
            <BlawbyButton v-if="person.url" :to="person.url" class="mt-6">
              <svg class="-ml-0.5 mr-2 size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.5 4.5h9A4.5 4.5 0 0 1 21 9v3a4.5 4.5 0 0 1-4.5 4.5h-4.86L7.2 20.2a.75.75 0 0 1-1.2-.6v-3.35A4.5 4.5 0 0 1 3 12V9a4.5 4.5 0 0 1 4.5-4.5Z" /></svg>
              Request a Consultation
            </BlawbyButton>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'
import { blockText, blockTextOrNull, blockRecords } from '~/utils/tenant-page-block-data'
// People only. The feature cards that used to ride along in this section are
// their own block and their own component now, so a page can show either
// without the other.
const props = defineProps<{ block: TenantPageBlock; page: PublicTenantPage }>()

/** One slot spelling for every grid: `items.<index>.image`. */
function itemMedia(index: number) {
  return props.block.media.filter(asset => asset.slot === `items.${index}.image`)
}

const people = computed(() => blockRecords(props.block.data.items).map((item, index) => ({
  first_name: blockText(item.first_name),
  last_name: blockText(item.last_name),
  title: blockTextOrNull(item.title),
  bio: blockTextOrNull(item.bio),
  url: blockTextOrNull(item.url),
  media: itemMedia(index),
})).filter(person => person.first_name || person.last_name))
</script>
