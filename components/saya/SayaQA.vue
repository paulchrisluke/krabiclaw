<template>
  <AppSection :bg="bg" :padding="padding">
    <div v-if="showTitle" class="flex flex-col gap-4 mb-12 md:flex-row md:items-end md:justify-between border-b border-default pb-8">
      <div>
        <h2 class="text-base font-semibold text-default tracking-wide uppercase">{{ $t('saya.qa.title') }}</h2>
        <p class="mt-2 text-4xl font-bold text-default italic">{{ $t('saya.qa.subtitle') }}</p>
      </div>
      <p v-if="description" class="text-muted max-w-md md:text-right">{{ description }}</p>
    </div>

    <div class="grid gap-6">
      <!-- Real Q&A items -->
      <div 
        v-for="item in displayedQA" 
        :key="item.name"
        class="bg-default border border-default rounded-3xl p-8 shadow-sm hover:shadow-md transition-shadow"
      >
        <div class="flex items-start gap-4 mb-6">
          <div class="h-10 w-10 shrink-0 rounded-full bg-inverted flex items-center justify-center text-inverted font-bold text-sm">
            Q
          </div>
          <div>
            <h3 class="text-lg font-bold text-default mb-1">{{ item.text }}</h3>
            <p class="text-[10px] text-muted font-bold uppercase tracking-widest">
              {{ $t('saya.qa.asked_by', { author: item.author?.displayName || $t('saya.qa.google_guest'), date: formatDate(item.createTime) }) }}
            </p>
          </div>
        </div>

        <div v-if="item.topAnswer" class="flex items-start gap-4 bg-muted rounded-2xl p-6">
          <div class="h-8 w-8 shrink-0 rounded-full bg-inverted flex items-center justify-center text-inverted font-bold text-xs">
            A
          </div>
          <div>
            <p class="text-default leading-relaxed text-sm mb-2">{{ item.topAnswer.text }}</p>
            <p class="text-[10px] text-muted font-bold uppercase tracking-widest">
              {{ $t('saya.qa.response_from_restaurant', { date: formatDate(item.topAnswer.updateTime) }) }}
            </p>
          </div>
        </div>
        <div v-else class="ml-14 italic text-muted text-sm">
          {{ $t('saya.qa.no_answer') }}
        </div>
      </div>

      <!-- Placeholder Q&A cards when no items -->
      <div v-if="qa.length === 0 && showEmptyState" class="flex flex-col items-center justify-center rounded-3xl border border-dashed border-default bg-muted/20 py-20 text-center">
        <div class="flex size-14 items-center justify-center rounded-full bg-elevated/50 text-muted shadow-sm">
          <UIcon name="i-heroicons-question-mark-circle" class="size-7" />
        </div>
        <h3 class="mt-6 saya-display saya-italic text-3xl text-default">{{ $t('saya.qa.empty_title') }}</h3>
        <p class="mt-2 max-w-sm text-sm text-muted">{{ $t('saya.qa.empty_prompt') }}</p>
      </div>
    </div>

    <div v-if="showViewMore && limit && qa.length > limit" class="mt-12 text-center">
      <UButton to="/qa" color="primary" variant="outline" size="xl">
        {{ $t('saya.qa.view_all') }}
      </UButton>
    </div>
  </AppSection>
</template>

<script setup>
import AppSection from '~/components/ui/AppSection.vue'
import { UButton } from '#components'

const props = defineProps({
  qa: {
    type: Array,
    default: () => []
  },
  limit: {
    type: Number,
    default: null
  },
  bg: {
    type: String,
    default: 'neutral'
  },
  padding: {
    type: String,
    default: 'lg'
  },
  showTitle: {
    type: Boolean,
    default: true
  },
  description: {
    type: String,
    default: null
  },
  showViewMore: {
    type: Boolean,
    default: false
  },
  showEmptyState: {
    type: Boolean,
    default: true
  }
})

const { locale } = useI18n()

const displayedQA = computed(() => {
  return props.limit ? props.qa.slice(0, props.limit) : props.qa
})

const formatDate = (dateString) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(date)
}
</script>
