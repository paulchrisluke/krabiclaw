<template>
  <UDashboardPanel :id="`org-${slug}`">
    <template #header>
      <UDashboardNavbar :title="title">
      </UDashboardNavbar>
    </template>

    <template #body>
      <UCard>
        <div class="flex items-start gap-4">
          <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <UIcon :name="icon" class="size-5 text-muted" />
          </div>
          <div>
            <h1 class="font-semibold text-highlighted">{{ title }}</h1>
            <p class="mt-1 text-sm text-muted">{{ description }}</p>
          </div>
        </div>
      </UCard>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
defineProps<{
  slug: string
  title: string
  description: string
  icon: string
}>()
</script>
