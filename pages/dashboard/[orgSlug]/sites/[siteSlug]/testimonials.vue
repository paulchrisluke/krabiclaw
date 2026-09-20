<template>
  <NuxtPage v-if="frame.mode.value === 'yield'" />

  <!-- A testimonial is open: the list is the index column, the record the detail. -->
  <template v-else>
    <UDashboardPanel
      id="site-testimonials"
      :class="hasDetail ? 'hidden lg:flex' : undefined"
      :default-size="hasDetail ? 32 : undefined"
    >
      <template #header>
        <UDashboardNavbar title="Testimonials" :toggle="false">
          <template #leading>
            <DashboardNavbarLeading :to="sitePath" label="Site" />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="mx-auto w-full" :class="hasDetail ? 'max-w-xl' : 'max-w-3xl'">
          <TestimonialList />
        </div>
      </template>
    </UDashboardPanel>

    <!-- The open child owns the other column, header and all. -->
    <NuxtPage v-if="hasDetail" />
  </template>

</template>

<script setup lang="ts">
import TestimonialList from '~/components/dashboard/TestimonialList.vue'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()

// Both paths come from the route this page is mounted on, so the back link
// cannot end up pointing nowhere while the page itself renders.
const sitePath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}`)
const testimonialsPath = computed(() => `${sitePath.value}/testimonials`)
const frame = useEditorFrame(testimonialsPath)
const hasDetail = computed(() => frame.mode.value === 'pair')

useSeoMeta({ title: 'Testimonials | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
