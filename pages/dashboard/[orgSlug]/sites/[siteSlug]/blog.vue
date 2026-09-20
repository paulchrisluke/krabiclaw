<template>
  <NuxtPage v-if="frame.mode.value === 'yield'" />

  <!-- A post is open: my list is the index column, the post is the detail. -->
  <template v-else>
    <UDashboardPanel
      id="site-blog"
      :class="hasDetail ? 'hidden lg:flex' : undefined"
      :default-size="hasDetail ? 32 : undefined"
    >
      <template #header>
        <UDashboardNavbar title="Blog" :toggle="false">
          <template #leading>
            <DashboardNavbarLeading :to="sitePath" label="Site" />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="mx-auto w-full" :class="hasDetail ? 'max-w-xl' : 'max-w-3xl'">
          <BlogPostList />
        </div>
      </template>
    </UDashboardPanel>

    <!-- The open child owns the other column, header and all. -->
    <NuxtPage v-if="hasDetail" />
  </template>

</template>

<script setup lang="ts">
import BlogPostList from '~/components/dashboard/BlogPostList.vue'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()

// The path comes from the route this screen is mounted on, not from the
// location selector: an unresolved selector left it empty, and an empty path is
// a link to nowhere and, where it roots the editor frame, a frame rooted at ''.
const sitePath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}`)
const blogPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/blog`)
const frame = useEditorFrame(blogPath)
const hasDetail = computed(() => frame.mode.value === 'pair')
</script>
