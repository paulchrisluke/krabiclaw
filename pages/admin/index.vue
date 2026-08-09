<script setup lang="ts">
definePageMeta({ layout: false })

await navigateTo('/admin/clients', {
  redirectCode: 302,
  replace: true,
})
</script>
