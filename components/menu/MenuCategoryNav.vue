<template>
  <div ref="navRef" class="sticky top-0 z-40 bg-default border-b border-default">
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
const navRef = ref(null)

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
