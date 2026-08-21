<template>
  <UPage
    class="h-full min-h-0"
    :ui="{ root: '!flex h-full min-h-0', center: 'h-full min-h-0 w-full' }"
  >
    <UPageBody
      class="h-full min-h-0"
      :ui="{ base: '!mt-0 !space-y-0 !pb-0' }"
    >
      <div class="flex h-full min-h-0 flex-col lg:grid lg:grid-cols-[minmax(20rem,0.9fr)_minmax(0,1.1fr)]">
        <section
          class="h-full min-h-0 flex-1 flex-col overflow-hidden border-default lg:flex lg:border-r"
          :class="hasDetail
            ? 'hidden lg:flex'
            : showDesktopDetail
              ? 'flex'
              : 'flex lg:col-span-2 lg:border-r-0'"
        >
          <div class="min-h-0 flex-1 overflow-y-auto px-5 pb-24 pt-6 sm:px-8 sm:pt-8">
            <div class="mx-auto w-full" :class="hasDetail ? 'max-w-xl' : 'max-w-3xl'">
              <slot name="index" />
            </div>
          </div>
        </section>

        <section
          v-if="hasDetail || showDesktopDetail"
          class="h-full min-h-0 flex-1 flex-col overflow-hidden"
          :class="hasDetail ? 'flex' : 'hidden lg:flex'"
        >
          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
            <div class="mx-auto w-full max-w-2xl">
              <slot name="detail" />
            </div>
          </div>

          <footer
            v-if="showActions"
            class="shrink-0 border-t border-default bg-default px-5 pb-20 pt-4 sm:px-8 lg:px-10 lg:pb-4"
            :class="hasDetail ? '' : 'hidden lg:block'"
          >
            <div class="mx-auto flex w-full max-w-2xl items-center justify-between gap-4">
              <UButton color="neutral" variant="ghost" label="Cancel" @click="$emit('cancel')" />
              <UButton label="Save" :loading="saving" :disabled="saveDisabled" @click="$emit('save')" />
            </div>
          </footer>
        </section>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
defineProps<{
  hasDetail: boolean
  showDesktopDetail?: boolean
  showActions?: boolean
  saving?: boolean
  saveDisabled?: boolean
}>()

defineEmits<{
  cancel: []
  save: []
}>()
</script>
