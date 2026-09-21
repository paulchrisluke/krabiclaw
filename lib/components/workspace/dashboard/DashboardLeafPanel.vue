<template>
  <UDashboardPanel :id="id">
    <template #header>
      <UDashboardNavbar :title="title" :toggle="false">
        <template #leading>
          <UButton
            icon="i-lucide-x"
            aria-label="Close"
            color="neutral"
            variant="ghost"
            size="sm"
            square
            class="min-w-0 shrink-0 lg:hidden"
            data-testid="dashboard-navbar-close"
            :to="level.to.value ?? undefined"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl">
        <UAlert
          v-if="error"
          class="mb-6"
          color="error"
          variant="soft"
          icon="i-lucide-triangle-alert"
          :description="error"
        />

        <div v-if="!ready" class="space-y-4">
          <USkeleton class="h-10" />
          <USkeleton class="h-14" />
        </div>
        <slot v-else />
      </div>
    </template>

    <!-- A leaf whose controls act at once — connect, schedule, publish — has nothing to Save. -->
    <template v-if="footer" #footer>
      <DashboardPanelFooter
        :save-label="saveLabel"
        :loading="saving"
        :disabled="!ready || disabled"
        leaf
        @cancel="cancel"
        @save="$emit('save')"
      />
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
/*
  A leaf: one thing, its own column, Cancel and Save in the panel's footer —
  Airbnb's editor-leaf shape, and on a phone the sheet that covers the list it
  came from. Every leaf in the dashboard is this component with a field in the
  slot, so the header, the loading state, the error and the footer are written
  once rather than re-drawn per screen.

  Cancel is the leaf's own Back: a push to the level that contains it, which is
  the route record above this one.

  Beside its index — two columns, `lg` — the leaf has no Close and no Cancel:
  the index's Back is the way out and Save is the only control, which is what
  Airbnb's editor does at its two-column width (measured 2026-09-21). Both
  exist only where the leaf is a sheet covering the list it came from.
*/
withDefaults(defineProps<{
  id: string
  title: string
  ready?: boolean
  saving?: boolean
  disabled?: boolean
  error?: string
  saveLabel?: string | null
  /** Off for a leaf whose controls act at once and has nothing to Save. */
  footer?: boolean
}>(), { ready: true, saving: false, disabled: false, error: '', saveLabel: 'Save', footer: true })

const emit = defineEmits<{ save: []; cancel: [] }>()

// Cancel is this leaf's Back: a push to the level that contains it. A leaf that
// holds a draft of its own listens for the event to discard it first.
const level = useRouteLevel()
function cancel() {
  emit('cancel')
  return navigateTo(level.to.value ?? '/dashboard')
}
</script>
