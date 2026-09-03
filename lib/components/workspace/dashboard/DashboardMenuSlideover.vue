<template>
  <USlideover
    v-model:open="open"
    title="Menu"
    :ui="{ body: 'overflow-y-auto' }"
  >
    <template #body>
      <EditorNavigationList :groups="groups" :active-item="activeItem" />
    </template>
  </USlideover>
</template>

<script setup lang="ts">
import EditorNavigationList from '~/components/dashboard/EditorNavigationList.vue'

const open = defineModel<boolean>('open', { default: false })

const route = useRoute()
const { groups, activeItem } = useOrganizationSettingsNavigation()

// EditorNavigationList renders plain NuxtLinks, so a selection navigates the
// page underneath the slideover rather than closing it. Close on the resulting
// path change instead of wrapping every item in a click handler.
watch(() => route.path, () => { open.value = false })
</script>
