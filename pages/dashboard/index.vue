<script setup lang="ts">
definePageMeta({ layout: false })

// `/dashboard` has no organization scope of its own. Hand it to the canonical
// authenticated entry router, which resolves the user's destination server-side,
// instead of calling the strictly org-scoped dashboard context API without an org.
await navigateTo('/api/post-login', {
  external: true,
  redirectCode: 302,
  replace: true,
})
</script>
