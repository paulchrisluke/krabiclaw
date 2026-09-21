<template>
  <DashboardLeafPanel id="account-appearance" title="Appearance" :disabled="account.saveDisabled.value" @cancel="account.revert" @save="account.save">
    <URadioGroup v-model="account.themeInput.value" legend="Theme" :items="account.themeOptions" value-key="value" size="xl" variant="card" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { accountEditorKey } from '~/components/dashboard/AccountProfilePage.vue'

definePageMeta({ layout: 'dashboard' })

const account = inject(accountEditorKey)!
</script>
