<template>
  <div class="sticky top-16 z-40 bg-(--ui-bg) border-b border-(--ui-border)">
    <div class="max-w-6xl mx-auto px-4">
      <UTabs :model-value="active" :items="tabItems" @update:model-value="handleTabChange" class="scrollbar-hide" />
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  categories: { type: Array, required: true },
  active: { type: String, required: true }
})

const emit = defineEmits(['select'])

const tabItems = computed(() => 
  props.categories.map(category => ({
    label: category.name,
    value: category.id
  }))
)

const handleTabChange = (value) => {
  emit('select', value)
  
  // Scroll to the section
  const element = document.getElementById(value)
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
