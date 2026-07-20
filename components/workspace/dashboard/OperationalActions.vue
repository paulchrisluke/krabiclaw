<template>
  <UCard>
    <h3 class="text-[11px] font-semibold uppercase tracking-[0.1em] text-dimmed mb-2.5">Operational actions</h3>
    <div class="grid gap-2">
      <template v-if="type === 'contact'">
        <PlatformButton block variant="outline" size="sm">Mark complete</PlatformButton>
        <PlatformButton block variant="outline" size="sm">Send review request</PlatformButton>
      </template>
      <template v-else-if="type === 'reservation'">
        <PlatformButton block variant="solid" size="sm" @click="$emit('confirm')">Confirm</PlatformButton>
        <PlatformButton block variant="outline" size="sm" @click="$emit('complete')">Mark complete</PlatformButton>
        <PlatformButton block variant="outline" size="sm">Send review request</PlatformButton>
        <PlatformButton block variant="outline" size="sm" @click="$emit('cancel')">Cancel</PlatformButton>
      </template>
      <template v-else>
        <PlatformButton block variant="solid" size="sm" @click="$emit('confirm')">Confirm</PlatformButton>
        <PlatformButton block variant="outline" size="sm" @click="$emit('complete')">Mark complete</PlatformButton>
        <PlatformButton block variant="outline" size="sm">Send review request</PlatformButton>
        <PlatformButton block variant="outline" size="sm" @click="$emit('cancel')">Cancel</PlatformButton>
      </template>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import PlatformButton from '~/components/platform/PlatformButton.vue'

defineProps<{
  type: 'contact' | 'reservation' | 'experience_booking'
}>()

defineEmits<{
  confirm: []
  complete: []
  cancel: []
}>()
</script>
