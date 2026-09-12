<template>
  <NuxtPage v-if="frame.mode.value === 'yield'" />

  <!-- A testimonial is open: the list is the index column, the record the detail. -->
  <UDashboardPanel v-else-if="frame.mode.value === 'pair'" id="site-testimonials">
    <template #header>
      <UDashboardNavbar title="Testimonials" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="sitePath" label="Site" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <EditorPaneShell
        has-detail
        :dismiss-to="testimonialsPath"
        detail-title="Testimonial"
        wide-detail
        hide-detail-heading
      >
        <template #index>
          <TestimonialList />
        </template>
        <template #detail>
          <NuxtPage />
        </template>
      </EditorPaneShell>
    </template>
  </UDashboardPanel>

  <TestimonialList v-else />
</template>

<script setup lang="ts">
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import TestimonialList from '~/components/dashboard/TestimonialList.vue'

definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'site.testimonials' })

const route = useRoute()

// Both paths come from the route this page is mounted on, so the back link
// cannot end up pointing nowhere while the page itself renders.
const sitePath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}`)
const testimonialsPath = computed(() => `${sitePath.value}/testimonials`)
const frame = useEditorFrame(testimonialsPath)

useSeoMeta({ title: 'Testimonials | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
