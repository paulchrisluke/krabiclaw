<template>
  <div class="sticky top-16 z-40 bg-white border-b border-gray-200">
    <div class="max-w-6xl mx-auto px-4">
      <nav class="flex gap-0 overflow-x-auto scrollbar-hide" aria-label="Menu categories">
        <button
          v-for="category in categories"
          :key="category.id"
          @click="scrollToCategory(category.id)"
          :class="[
            'flex-shrink-0 px-4 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
            active === category.id
              ? 'border-black text-black'
              : 'border-transparent text-gray-500 hover:text-black'
          ]"
        >
          {{ category.name }}
        </button>
      </nav>
    </div>
  </div>
</template>

<script setup>
defineProps({
  categories: { type: Array, required: true },
  active: { type: String, required: true }
})

const emit = defineEmits(['select'])

const scrollToCategory = (categoryId) => {
  emit('select', categoryId)
  
  // Scroll to the section
  const element = document.getElementById(categoryId)
  if (element) {
    // Account for fixed header height (64px)
    const headerOffset = 64
    const elementPosition = element.getBoundingClientRect().top
    const offsetPosition = elementPosition + window.pageYOffset - headerOffset

    window.scrollTo({
      top: offsetPosition,
      behavior: 'smooth'
    })
  }
}
</script>
