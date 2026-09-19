<template>
  <div class="space-y-8">
    <p class="text-base text-muted">Choose how the dashboard appears for you.</p>
    <URadioGroup
      v-model="selectedPreference"
      legend="Theme"
      :items="themeOptions"
      value-key="value"
      size="xl"
      variant="card"
    />
    <div class="flex items-center justify-between gap-4 border-t border-default pt-4">
      <UButton color="neutral" variant="ghost" label="Cancel" @click="cancel" />
      <UButton label="Save" :disabled="!dirty" @click="save" />
    </div>
  </div>
</template>

<script setup lang="ts">
const { preference, setPreference } = usePlatformTheme()
type ThemePreference = 'system' | 'light' | 'dark'
const selectedPreference = ref<ThemePreference>(preference.value)
// The stored preference is only read back on the client, after this setup runs.
// Without this the radio kept the 'system' seed, so the page showed System
// selected while the dashboard was rendering dark, and Save was live on load.
watch(preference, saved => { selectedPreference.value = saved })
const dirty = computed(() => selectedPreference.value !== preference.value)
const themeOptions: { label: string; description: string; value: ThemePreference }[] = [
  { label: 'System', description: 'Follow your device appearance.', value: 'system' },
  { label: 'Light', description: 'Always use the light dashboard.', value: 'light' },
  { label: 'Dark', description: 'Always use the dark dashboard.', value: 'dark' },
]
function cancel() {
  selectedPreference.value = preference.value
}

function save() {
  if (!dirty.value) return
  setPreference(selectedPreference.value)
}
</script>
