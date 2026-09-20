<template>
  <NuxtPage v-if="frame.mode.value === 'yield'" />

  <!-- A question is open: the list is the index column, the record the detail. -->
  <template v-else>
    <UDashboardPanel
      id="site-qa"
      :class="hasDetail ? 'hidden lg:flex' : undefined"
      :default-size="hasDetail ? 32 : undefined"
    >
      <template #header>
        <UDashboardNavbar title="Q&A" :toggle="false">
          <template #leading>
            <DashboardNavbarLeading :to="sitePath" label="Site" />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="mx-auto w-full" :class="hasDetail ? 'max-w-xl' : 'max-w-3xl'">
          <QaList />
        </div>
      </template>
    </UDashboardPanel>

    <!-- The open child owns the other column, header and all. -->
    <NuxtPage v-if="hasDetail" />
  </template>

</template>

<script setup lang="ts">
import QaList from '~/components/dashboard/QaList.vue'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()

// Both paths come from the route this page is mounted on, so the back link
// cannot end up pointing nowhere while the page itself renders.
const sitePath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}`)
const qaPath = computed(() => `${sitePath.value}/qa`)
const frame = useEditorFrame(qaPath)
const hasDetail = computed(() => frame.mode.value === 'pair')

useSeoMeta({ title: 'Site Q&A | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
