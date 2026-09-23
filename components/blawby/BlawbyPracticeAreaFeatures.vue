<template>
  <section class="relative overflow-hidden pb-20 pt-2" data-parity-section="features">
    <div class="blawby-container">
      <div class="grid grid-cols-1 gap-x-8 gap-y-16 lg:grid-cols-2 lg:items-start lg:gap-y-0">
        <div class="lg:pr-4">
          <div class="grid max-w-2xl gap-y-6">
            <button
              v-for="(feature, index) in features"
              :key="index"
              type="button"
              :aria-current="index === selected ? 'true' : undefined"
              class="relative flex cursor-pointer items-start pl-4 text-left focus:outline-none"
              :class="index === selected ? 'text-[var(--blawby-primary)]' : 'text-gray-500 hover:text-gray-700'"
              @click="selected = index"
            >
              <span class="flex h-full flex-col items-center pr-4 pt-1">
                <BlawbyFeatureIcon
                  :name="feature.icon"
                  class="size-5 shrink-0"
                  :class="index === selected ? 'text-[var(--blawby-accent)]' : 'text-gray-600'"
                />
                <span
                  class="mt-1 w-0.5 bg-[var(--blawby-accent)] transition-all duration-500 ease-in-out"
                  :class="index === selected ? 'h-full' : 'h-0'"
                />
              </span>
              <span class="grow">
                <span class="font-semibold" :class="index === selected ? 'text-[var(--blawby-primary)]' : 'text-gray-500'">{{ feature.title }}.</span>
                {{ ' ' }}
                <span>{{ feature.description }}</span>
              </span>
            </button>
          </div>
        </div>
        <!--
          The picture belongs to the feature being read, but the button belongs
          to the block, so it shows whether or not that feature has a picture.
          They were one element, and selecting a feature with no image took the
          button away with it.
        -->
        <div v-if="activeImage || (ctaLabel && ctaUrl)" class="relative max-w-2xl">
          <img
            v-if="activeImage"
            :src="activeImage.public_url!"
            :alt="activeImage.alt_text ?? ''"
            width="2432"
            height="1442"
            loading="lazy"
            class="w-full rounded-xl object-cover"
          >
          <div
            v-if="ctaLabel && ctaUrl"
            class="flex flex-col items-center"
            :class="activeImage ? 'absolute inset-0 justify-end p-8 pb-16' : 'pt-8'"
          >
            <BlawbyButton :to="ctaUrl" class="gap-2">
              <BlawbyFeatureIcon name="ChatBubbleLeftRightIcon" class="size-5" />
              {{ ctaLabel }}
            </BlawbyButton>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { TenantPageMedia } from '~/utils/tenant-page-blocks'

// The practice-area features: an icon-led list of what the firm does in this
// area, beside the picture belonging to whichever one the reader is on. It is
// the layout the firm's pages carried before the offering model was removed,
// when these features went unrendered entirely.
const props = defineProps<{
  features: Array<{ title: string; description: string; icon: string; media: TenantPageMedia[] }>
  ctaLabel?: string | null
  ctaUrl?: string | null
}>()

const selected = ref(0)

/** The picture of the feature being read, or none when that feature has none. */
const activeImage = computed(() => props.features[selected.value]?.media.find(asset => asset.public_url) ?? null)
</script>
