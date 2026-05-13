<template>
  <AppSection :bg="bg" :padding="padding">
    <div v-if="showTitle" class="flex flex-col gap-4 mb-12 md:flex-row md:items-end md:justify-between border-b border-default pb-8">
      <div>
        <h2 class="text-base font-semibold text-default tracking-wide uppercase">Questions & Answers</h2>
        <p class="mt-2 text-4xl font-bold text-default italic">Common Inquiries</p>
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
              Asked by {{ item.author?.displayName || 'Google Guest' }} • {{ formatDate(item.createTime) }}
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
              Response from Restaurant • {{ formatDate(item.topAnswer.updateTime) }}
            </p>
          </div>
        </div>
        <div v-else class="ml-14 italic text-muted text-sm">
          No answer yet.
        </div>
      </div>

      <!-- Placeholder Q&A cards when no items -->
      <template v-if="qa.length === 0 && showEmptyState">
        <div v-for="i in 3" :key="`placeholder-${i}`" class="bg-default border border-default rounded-3xl p-8 shadow-sm">
          <div class="flex items-start gap-4 mb-6">
            <div class="h-10 w-10 shrink-0 rounded-full bg-muted flex items-center justify-center text-muted font-bold text-sm">
              Q
            </div>
            <div class="flex-1">
              <div class="h-6 bg-muted rounded animate-pulse mb-2"></div>
              <div class="h-4 bg-muted rounded animate-pulse w-32"></div>
            </div>
          </div>
          <div class="flex items-start gap-4 bg-muted rounded-2xl p-6">
            <div class="h-8 w-8 shrink-0 rounded-full bg-inverted animate-pulse flex items-center justify-center text-inverted font-bold text-xs">
              A
            </div>
            <div class="flex-1 space-y-2">
              <div class="h-3 bg-muted rounded animate-pulse"></div>
              <div class="h-3 bg-muted rounded animate-pulse w-4/5"></div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <div v-if="showViewMore && limit && qa.length > limit" class="mt-12 text-center">
      <UButton to="/qa" color="neutral" variant="outline" size="xl">
        View All Q&A
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

const displayedQA = computed(() => {
  return props.limit ? props.qa.slice(0, props.limit) : props.qa
})

const formatDate = (dateString) => {
  if (!dateString) return ''
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}
</script>
