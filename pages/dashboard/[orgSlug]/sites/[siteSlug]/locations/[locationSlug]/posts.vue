<template>
  <NuxtPage v-if="frame.mode.value === 'yield'" />

  <!-- A post is open: my list is the index column, the post is the detail. -->
  <template v-else>
    <UDashboardPanel
      id="location-posts"
      :class="hasDetail ? 'hidden lg:flex' : undefined"
      :default-size="hasDetail ? 32 : undefined"
    >
      <template #header>
        <UDashboardNavbar title="Posts" :toggle="false">
          <template #leading>
            <DashboardNavbarLeading :to="locationPath" label="Location" />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="mx-auto w-full" :class="hasDetail ? 'max-w-xl' : 'max-w-3xl'">
          <PostList />
        </div>
      </template>
    </UDashboardPanel>

    <!-- The open child owns the other column, header and all. -->
    <NuxtPage v-if="hasDetail" />
  </template>

</template>

<script setup lang="ts">
import PostList from '~/components/dashboard/PostList.vue'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()

// The path comes from the route this screen is mounted on, not from the
// location selector: an unresolved selector left it empty, and an empty path is
// a link to nowhere and, where it roots the editor frame, a frame rooted at ''.
const locationPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/locations/${String(route.params.locationSlug)}`)
const postsPath = computed(() => `${locationPath.value}/posts`)
const frame = useEditorFrame(postsPath)
const hasDetail = computed(() => frame.mode.value === 'pair')
</script>
