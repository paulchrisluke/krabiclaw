<template>
  <div ref="navRef" class="sticky top-0 z-40 bg-default border-b border-default">
    <div class="max-w-6xl mx-auto px-4">
      <!-- Native replacement for UTabs — this is a scroll-to-anchor category
           nav, not a tab panel switcher, so a plain button row + aria-current
           is a better semantic fit than faking the ARIA tablist pattern. -->
      <nav class="flex gap-1 overflow-x-auto scrollbar-hide" aria-label="Menu categories">
        <button
          v-for="category in categories"
          :key="category.id"
          type="button"
          :aria-current="active === category.id ? 'true' : undefined"
          class="shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors"
          :class="active === category.id ? 'border-(--brand-color) text-default' : 'border-transparent text-muted hover:text-default'"
          @click="handleTabChange(category.id)"
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
const navRef = ref(null)

const handleTabChange = (value) => {
  emit('select', value)
  
  // Scroll to the section
  const element = document.getElementById(value)
  if (element) {
    const headerOffset = navRef.value?.getBoundingClientRect().bottom ?? 0
    const elementPosition = element.getBoundingClientRect().top
    const offsetPosition = elementPosition + window.pageYOffset - headerOffset

    window.scrollTo({
      top: offsetPosition,
      behavior: 'smooth'
    })
  }
}
</script>
