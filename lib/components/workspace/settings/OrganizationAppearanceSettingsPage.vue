<template>
  <OrganizationSettingsShell
    detail-title="Appearance"
    show-actions
    :save-disabled="!dirty"
    @cancel="cancel"
    @save="save"
  >
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
    </div>
  </OrganizationSettingsShell>
</template>

<script setup lang="ts">
import OrganizationSettingsShell from '~/components/dashboard/OrganizationSettingsShell.vue'

const { preference, setPreference } = usePlatformTheme()
type ThemePreference = 'system' | 'light' | 'dark'
const selectedPreference = ref<ThemePreference>(preference.value)
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
