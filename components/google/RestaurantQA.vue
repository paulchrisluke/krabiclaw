<template>
  <AppSection :bg="bg" :padding="padding" v-if="qa.length > 0">
    <div v-if="showTitle" class="flex flex-col gap-4 mb-12 md:flex-row md:items-end md:justify-between border-b border-gray-200 pb-8">
      <div>
        <h2 class="text-base font-semibold text-black tracking-wide uppercase">Questions & Answers</h2>
        <p class="mt-2 text-4xl font-bold text-black italic">Common Inquiries</p>
      </div>
      <p v-if="description" class="text-gray-500 max-w-md md:text-right">{{ description }}</p>
    </div>

    <div class="grid gap-6">
      <div 
        v-for="item in displayedQA" 
        :key="item.name"
        class="bg-white border border-gray-100 rounded-3xl p-8 shadow-sm hover:shadow-md transition-shadow"
      >
        <div class="flex items-start gap-4 mb-6">
          <div class="h-10 w-10 shrink-0 rounded-full bg-stone-100 flex items-center justify-center text-stone-400 font-bold text-sm">
            Q
          </div>
          <div>
            <h3 class="text-lg font-bold text-black mb-1">{{ item.text }}</h3>
            <p class="text-[10px] text-stone-400 font-bold uppercase tracking-widest">
              Asked by {{ item.author?.displayName || 'Google Guest' }} • {{ formatDate(item.createTime) }}
            </p>
          </div>
        </div>

        <div v-if="item.topAnswer" class="flex items-start gap-4 bg-gray-50 rounded-2xl p-6">
          <div class="h-8 w-8 shrink-0 rounded-full bg-black flex items-center justify-center text-white font-bold text-xs">
            A
          </div>
          <div>
            <p class="text-gray-700 leading-relaxed text-sm mb-2">{{ item.topAnswer.text }}</p>
            <p class="text-[10px] text-stone-400 font-bold uppercase tracking-widest">
              Response from KIKUZUKI • {{ formatDate(item.topAnswer.updateTime) }}
            </p>
          </div>
        </div>
        <div v-else class="ml-14 italic text-stone-400 text-sm">
          No answer yet.
        </div>
      </div>
    </div>

    <div v-if="showViewMore && limit" class="mt-12 text-center">
      <AppButton to="/qa" variant="secondary" size="md">
        View All Questions
      </AppButton>
    </div>
  </AppSection>

  <div v-else-if="showEmptyState" class="text-center text-gray-400 p-24 bg-stone-50 rounded-3xl border border-dashed border-stone-200 m-4">
    <p class="italic">Have a question? Check out our frequently asked questions or contact us directly.</p>
  </div>
</template>

<script setup>
import AppSection from '~/components/ui/AppSection.vue'
import AppButton from '~/components/ui/AppButton.vue'

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
    default: 'gray'
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
