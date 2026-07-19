<template>
  <PlatformButton variant="outline" size="lg" block :loading="loading" :disabled="disabled" @click="$emit('activate')">
    <PlatformGoogleIcon class="size-5" />
    {{ label }}
  </PlatformButton>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ label?: string; loading?: boolean; disabled?: boolean }>(), {
  label: 'Continue with Google',
  loading: false,
  disabled: false,
})
defineEmits<{ activate: [] }>()
</script>
