<template>
  <PlatformButton variant="outline" size="lg" block :disabled="disabled" @click="$emit('activate')">
    <UIcon name="i-simple-icons-whatsapp" class="size-5" />
    {{ label }}
  </PlatformButton>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ label?: string; disabled?: boolean }>(), {
  label: 'Continue with WhatsApp',
  disabled: false,
})
defineEmits<{ activate: [] }>()
</script>
