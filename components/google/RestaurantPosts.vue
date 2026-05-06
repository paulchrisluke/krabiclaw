<template>
  <AppSection :bg="bg" :padding="padding">
    <div v-if="showTitle" class="flex flex-col gap-4 mb-12 md:flex-row md:items-end md:justify-between border-b border-gray-200 pb-8">
      <div>
        <h2 class="text-base font-semibold text-black tracking-wide uppercase">Latest Updates</h2>
        <p class="mt-2 text-4xl font-bold text-black italic">News & Events</p>
      </div>
      <p v-if="description" class="text-gray-500 max-w-md md:text-right">{{ description }}</p>
    </div>

    <div :class="['grid gap-8', layoutClass]">
      <!-- Real posts -->
      <article 
        v-for="post in displayedPosts" 
        :key="post.name" 
        :id="post.name"
        class="flex flex-col bg-white border border-gray-100 rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 group"
      >
        <div class="aspect-[4/5] overflow-hidden bg-stone-100 relative">
          <template v-if="post.media?.[0]">
            <video 
              v-if="post.media[0].mediaFormat === 'VIDEO'"
              :src="post.media[0].googleUrl"
              autoplay
              muted
              loop
              playsinline
              class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            <img 
              v-else
              :src="post.media[0].googleUrl" 
              :alt="post.title || 'Restaurant update'" 
              class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          </template>
          <div v-else class="w-full h-full flex items-center justify-center text-stone-300 italic text-xs">
            No preview available
          </div>
          
          <!-- Type Badge Overlay -->
          <div class="absolute top-4 left-4 flex gap-2">
            <UBadge v-if="post.event" color="neutral" variant="solid" size="xs" class="bg-white/90 backdrop-blur shadow-sm text-black">Event</UBadge>
            <UBadge v-else-if="post.offer" color="neutral" variant="solid" size="xs" class="bg-white/90 backdrop-blur shadow-sm text-black">Offer</UBadge>
            <UBadge v-else color="neutral" variant="solid" size="xs" class="bg-white/90 backdrop-blur shadow-sm text-black">Update</UBadge>
          </div>
        </div>
        
        <div class="p-8 flex flex-col flex-grow">
          <time :datetime="post.createTime" class="text-[10px] text-stone-400 font-bold uppercase tracking-widest mb-3">
            {{ formatDate(post.createTime) }}
          </time>
          <h3 class="text-xl font-bold text-gray-900 mb-3 leading-tight">{{ post.title || 'Business Update' }}</h3>
          
          <div :class="['text-gray-600 text-sm leading-relaxed mb-6 flex-grow', { 'line-clamp-3': limit }]">
            {{ post.summary }}
          </div>

          <!-- Special Tags for full view -->
          <div v-if="!limit" class="space-y-4 mb-6">
            <div v-if="post.event" class="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs">
              <p class="font-bold text-blue-900 mb-1">Event Details:</p>
              <p class="text-blue-700">{{ post.event.title }} • {{ formatDate(post.event.startDate) }}</p>
            </div>
            <div v-if="post.offer" class="bg-green-50 border border-green-100 rounded-xl p-4 text-xs">
              <p class="font-bold text-green-900 mb-1">Special Offer:</p>
              <p class="text-green-700">{{ post.offer.title }} <span v-if="post.offer.couponCode">• Code: {{ post.offer.couponCode }}</span></p>
            </div>
          </div>

          <NuxtLink 
            v-if="limit"
            :to="'/posts#' + post.name" 
            class="inline-flex items-center gap-2 text-sm font-bold text-black group/link"
          >
            <span>Read Full Story</span>
            <span class="transition-transform group-hover/link:translate-x-1">→</span>
          </NuxtLink>
          
          <UButton 
            v-else-if="post.callToAction"
            :to="post.callToAction.url"
            variant="solid"
            color="primary"
            size="md"
            class="self-start"
          >
            {{ post.callToAction.actionType.replace('_', ' ') }}
          </UButton>
        </div>
      </article>

      <!-- Placeholder cards when no posts -->
      <template v-if="posts.length === 0 && showEmptyState">
        <div v-for="i in (limit || 3)" :key="`placeholder-${i}`" class="flex flex-col bg-white border border-gray-100 rounded-3xl overflow-hidden">
          <div class="aspect-[4/5] bg-stone-100 flex items-center justify-center">
            <span class="text-stone-300 text-xs font-medium text-center px-4">News from<br>Google Business</span>
          </div>
          <div class="p-8 flex flex-col flex-grow">
            <div class="h-3 bg-stone-200 rounded animate-pulse mb-3"></div>
            <div class="h-6 bg-stone-200 rounded animate-pulse mb-4"></div>
            <div class="flex-1 space-y-2">
              <div class="h-3 bg-stone-200 rounded animate-pulse"></div>
              <div class="h-3 bg-stone-200 rounded animate-pulse w-4/5"></div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <div v-if="showViewMore && limit && posts.length > 0" class="mt-12 text-center">
      <UButton to="/posts" variant="outline" size="md">
        View All Updates
      </UButton>
    </div>
  </AppSection>
</template>

<script setup>
import AppSection from '~/components/ui/AppSection.vue'
import { UButton } from '#components'

const props = defineProps({
  posts: {
    type: Array,
    default: () => []
  },
  limit: {
    type: Number,
    default: null
  },
  bg: {
    type: String,
    default: 'white'
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

const displayedPosts = computed(() => {
  return props.limit ? props.posts.slice(0, props.limit) : props.posts
})

const layoutClass = computed(() => {
  if (props.limit === 3) return 'md:grid-cols-3'
  if (props.limit === 2) return 'md:grid-cols-2'
  if (!props.limit) return 'md:grid-cols-2 lg:grid-cols-3'
  return 'grid-cols-1'
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
