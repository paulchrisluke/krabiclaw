<script setup lang="ts">
const route = useRoute()
await navigateTo(`/dashboard/${route.params.orgSlug}/~/settings/general`, { replace: true })
</script>
