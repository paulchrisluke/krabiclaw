<template>
  <div class="min-h-screen bg-default text-default">
    <div class="mx-auto max-w-xl px-4 pt-16 pb-24 sm:px-6 lg:px-8">
      <div class="rounded-3xl border border-default bg-elevated p-10 text-center shadow-sm sm:p-12">
        <div class="mb-8 flex justify-center">
          <div class="flex size-20 items-center justify-center rounded-full bg-primary/10">
            <UIcon name="i-heroicons-check-circle" class="size-12 text-primary" />
          </div>
        </div>

        <h1 class="saya-display saya-italic text-4xl text-default">{{ t('saya.contact_page.got_it') }}</h1>
        <p class="mt-4 text-muted">{{ t('saya.contact_page.reply_within') }}</p>

        <div class="mt-8 flex flex-col gap-3">
          <UButton to="/" color="primary" variant="soft" class="rounded-full">{{ t('saya.contact_page.back_home') }}</UButton>
          <UButton to="/contact" color="primary" variant="ghost" size="sm">{{ t('saya.contact_page.send_another') }}</UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'saya' })

const { t } = useI18n()

// Always shows a generic success state rather than gating on the sessionStorage
// handoff — a missing handoff (private browsing, storage quota, etc.) doesn't
// mean the message wasn't actually sent, and this page has nothing to show
// beyond the generic copy either way.
useSeoMeta({ title: t('saya.contact_page.confirmed_title'), robots: 'noindex' })
</script>
