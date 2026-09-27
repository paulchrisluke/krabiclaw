<template>
  <!-- Nothing connected: the product's mark and the one way to connect it. -->
  <div v-if="!connection" class="mx-auto flex max-w-sm flex-col items-center gap-8 py-16 text-center">
    <UIcon :name="logo" class="size-24" />
    <div class="w-full space-y-4 text-left">
      <slot />
    </div>
  </div>

  <div v-else class="space-y-8">
    <div class="flex flex-wrap items-center gap-4">
      <UAvatar :src="connection.image ?? undefined" :icon="logo" alt="" size="3xl" />
      <div class="min-w-0 flex-1">
        <p class="truncate font-semibold text-highlighted">{{ connection.name }}</p>
        <p class="mt-0.5 truncate text-sm" :class="connection.status === 'active' ? 'text-muted' : 'text-error'">
          {{ connection.status === 'error' ? 'Last sync failed' : connection.status === 'disabled' ? 'Disabled' : `Connected on ${connectedOn}` }}
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <UButton v-if="!changing" color="neutral" variant="outline" @click="changing = true">Change {{ noun }}</UButton>
        <UDropdownMenu :items="[[{ label: 'Disconnect', icon: 'i-lucide-link-2-off', color: 'error', onSelect: () => emit('disconnect') }]]">
          <UButton icon="i-lucide-ellipsis" color="neutral" variant="outline" square :loading="disconnecting" aria-label="More actions" />
        </UDropdownMenu>
      </div>
    </div>

    <section v-if="changing" class="space-y-4 border-t border-default pt-6">
      <div class="flex items-center justify-between gap-4">
        <h3 class="font-semibold text-highlighted">Choose another {{ noun }}</h3>
        <UButton color="neutral" variant="ghost" size="sm" @click="keep">Keep current</UButton>
      </div>
      <slot />
    </section>
  </div>
</template>

<script setup lang="ts">
/*
  One integration's connection, shared by every leaf that connects the business
  to an account: what it is connected to and since when, and the picker in the
  default slot for connecting or changing it. The leaf owns the picker's draft
  and the Save that commits it; `changing` says when the picker is open.
*/
import type { IntegrationStatus } from '~/pages/dashboard/[orgSlug]/settings/integrations.vue'

const props = defineProps<{
  logo: string
  /** What the business is connected to: an account, a property, a Page. */
  noun: string
  connection: { name: string; image?: string | null; connectedAt: string; status: IntegrationStatus } | null
  disconnecting?: boolean
}>()

const emit = defineEmits<{ disconnect: []; keep: [] }>()
const changing = defineModel<boolean>('changing', { default: false })

// A leaf opens with its picker when linking returned with `?change=1`; the
// marker is read then and dropped, so a reload does not reopen the picker.
const route = useRoute()
if (route.query.change !== undefined) {
  void navigateTo({ query: { ...route.query, change: undefined } }, { replace: true })
}

const connectedOn = computed(() => props.connection
  ? new Date(props.connection.connectedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })
  : '')

function keep() {
  changing.value = false
  emit('keep')
}
</script>
