<template>
  <UPage>
    <UPageHeader
      title="Site Settings"
      description="Manage your website configuration, brand, and appearance"
    >
      <template #links>
        <DashboardSiteHeaderLinks :links="headerLinks" />
      </template>
    </UPageHeader>

    <UPageBody>
      <div v-if="loading" class="space-y-6">
        <USkeleton class="h-48 w-full" />
        <USkeleton class="h-56 w-full" />
        <USkeleton class="h-40 w-full" />
      </div>

      <UAlert v-else-if="error" color="error" variant="soft" icon="i-heroicons-exclamation-triangle" :description="error" />

      <div v-else-if="settings" class="space-y-0 divide-y divide-default rounded-lg border border-default">
        <!-- Brand -->
        <div class="grid gap-8 p-6 md:grid-cols-[1fr_2fr]">
          <div>
            <h2 class="font-semibold text-highlighted">Brand</h2>
            <p class="mt-1 text-sm text-muted">Your restaurant's identity. This name and description appear on your public website and in search results.</p>
          </div>
          <div class="space-y-5">
            <UFormField label="Restaurant Name">
              <UInput v-model="form.brand_name" placeholder="Your Restaurant Name" />
            </UFormField>
            <UFormField label="Short Description" help="Used for SEO and homepage tagline.">
              <UTextarea v-model="form.brand_description" :rows="3" placeholder="Authentic dining experience in your city" />
            </UFormField>
            <div class="grid gap-5 sm:grid-cols-2">
              <UFormField label="Logo">
                <MediaPicker
                  v-model="form.logo_asset_id"
                  :site-id="siteId"
                  accept="image"
                  title="Select logo"
                  @change="handleLogoChange"
                />
              </UFormField>
              <UFormField label="Contact Email">
                <UInput v-model="form.contact_email" type="email" placeholder="contact@yourrestaurant.com" />
              </UFormField>
            </div>
          </div>
        </div>

        <!-- Appearance -->
        <div class="grid gap-8 p-6 md:grid-cols-[1fr_2fr]">
          <div>
            <h2 class="font-semibold text-highlighted">Appearance</h2>
            <p class="mt-1 text-sm text-muted">Control your site's color scheme. The brand color is applied to buttons, links, and accent elements.</p>
          </div>
          <div class="space-y-5">
            <UFormField label="Brand Color" help="Primary color used for buttons and accents.">
              <div class="flex items-center gap-3">
                <UInput v-model="form.brand_color" type="color" class="h-9 w-16 cursor-pointer p-1" />
                <UInput v-model="form.brand_color" placeholder="#e87f67" class="w-32 font-mono text-sm" />
              </div>
            </UFormField>
            <UFormField label="Theme">
              <UInput :model-value="settings.theme" readonly class="opacity-50" />
              <template #help>More themes coming soon.</template>
            </UFormField>
          </div>
        </div>

        <!-- Social -->
        <div class="grid gap-8 p-6 md:grid-cols-[1fr_2fr]">
          <div>
            <h2 class="font-semibold text-highlighted">Social & Footer</h2>
            <p class="mt-1 text-sm text-muted">Links that appear in your site footer. Leave blank to hide an icon.</p>
          </div>
          <div class="space-y-5">
            <UFormField label="Footer Tagline" help="Short line shown in the footer under your restaurant name.">
              <UInput v-model="form.footer_tagline" placeholder="Authentic dining, crafted with passion." />
            </UFormField>
            <div class="grid gap-5 sm:grid-cols-3">
              <UFormField label="Facebook URL">
                <UInput v-model="form.social_facebook" placeholder="https://facebook.com/yourpage" />
              </UFormField>
              <UFormField label="Instagram URL">
                <UInput v-model="form.social_instagram" placeholder="https://instagram.com/yourhandle" />
              </UFormField>
              <UFormField label="TikTok URL">
                <UInput v-model="form.social_tiktok" placeholder="https://tiktok.com/@yourhandle" />
              </UFormField>
            </div>
          </div>
        </div>

        <!-- Brand Contact -->
        <div class="grid gap-8 p-6 md:grid-cols-[1fr_2fr]">
          <div>
            <h2 class="font-semibold text-highlighted">Brand Contact</h2>
            <p class="mt-1 text-sm text-muted">Shown on the Contact page for press, catering and partnership enquiries. Leave blank to hide.</p>
          </div>
          <div class="grid gap-5 sm:grid-cols-2">
            <UFormField label="Press Email">
              <UInput v-model="form.press_email" type="email" placeholder="press@yourrestaurant.com" />
            </UFormField>
            <UFormField label="Partnerships Email">
              <UInput v-model="form.partnerships_email" type="email" placeholder="partners@yourrestaurant.com" />
            </UFormField>
            <UFormField label="Catering & Events Email">
              <UInput v-model="form.catering_email" type="email" placeholder="events@yourrestaurant.com" />
            </UFormField>
            <UFormField label="Careers Email">
              <UInput v-model="form.careers_email" type="email" placeholder="careers@yourrestaurant.com" />
            </UFormField>
          </div>
        </div>

        <!-- General -->
        <div class="grid gap-8 p-6 md:grid-cols-[1fr_2fr]">
          <div>
            <h2 class="font-semibold text-highlighted">General</h2>
            <p class="mt-1 text-sm text-muted">Basic website configuration. Changing the restaurant name updates your URL.</p>
          </div>
          <div class="space-y-5">
            <div class="grid gap-5 sm:grid-cols-2">
              <UFormField label="Subdomain">
                <UInput :model-value="previewSubdomain" readonly class="opacity-50 font-mono" />
              </UFormField>
              <UFormField label="URL Structure">
                <USelect
                  v-model="form.url_structure"
                  :items="urlStructureOptions"
                  value-key="value"
                  label-key="label"
                />
              </UFormField>
            </div>
            <UFormField label="Menu Currency" help="Used to display menu item amounts and menu SEO structured data.">
              <USelect
                v-model="form.default_currency"
                :items="currencyOptions"
                value-key="value"
                label-key="label"
              />
            </UFormField>
            <UFormField label="Public URL">
              <div class="flex gap-2">
                <UInput :model-value="settings.public_url" readonly class="flex-1 opacity-50" />
                <UButton icon="i-heroicons-clipboard-document" variant="outline" color="neutral" aria-label="Copy URL" @click="copyToClipboard(settings.public_url)" />
              </div>
            </UFormField>
          </div>
        </div>

        <!-- Languages -->
        <div class="grid gap-8 p-6 md:grid-cols-[1fr_2fr]">
          <div>
            <h2 class="font-semibold text-highlighted">Languages</h2>
            <p class="mt-1 text-sm text-muted">Choose the source language and control which translated versions are visible on the public site.</p>
          </div>
          <div class="space-y-5">
            <div v-if="hasAvailableLocales" class="grid gap-5 sm:grid-cols-[1fr_auto]">
              <UFormField label="Add Language">
                <USelect
                  v-model="localeForm.locale"
                  :items="availableLocaleOptions"
                  value-key="value"
                  label-key="label"
                  :disabled="localesSaving"
                />
              </UFormField>
              <div class="flex items-end">
                <UButton
                  icon="i-heroicons-plus"
                  :loading="localesSaving"
                  :disabled="!localeForm.locale"
                  @click="addLocale"
                >
                  Add
                </UButton>
              </div>
            </div>
            <p v-else class="text-sm text-muted">No more locales available to add.</p>

            <UAlert
              v-if="localesError"
              color="error"
              variant="soft"
              icon="i-heroicons-exclamation-triangle"
              :description="localesError"
            />

            <div v-if="localesLoading" class="space-y-3">
              <USkeleton class="h-20 w-full" />
              <USkeleton class="h-20 w-full" />
            </div>

            <div v-else class="divide-y divide-default rounded-lg border border-default">
              <div
                v-for="locale in locales"
                :key="locale.locale"
                class="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_14rem_auto]"
              >
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <p class="font-medium text-highlighted">{{ localeLabel(locale.locale, locale.label) }}</p>
                    <UBadge v-if="locale.is_source" color="primary" variant="soft">Source</UBadge>
                    <UBadge :color="locale.status === 'published' ? 'success' : locale.status === 'disabled' ? 'neutral' : 'warning'" variant="soft">
                      {{ locale.status }}
                    </UBadge>
                  </div>
                  <p class="mt-1 text-sm text-muted">
                    {{ locale.locale }}
                    <span v-if="!locale.is_source"> · {{ locale.fallback_enabled ? 'Falls back to source content' : 'No source fallback' }}</span>
                  </p>
                </div>

                <div class="space-y-2">
                  <UInput
                    :model-value="locale.label || ''"
                    placeholder="Display label"
                    size="sm"
                    :disabled="localesSaving"
                    @change="onLocaleLabelChange(locale.locale, $event)"
                  />
                  <UCheckbox
                    v-if="!locale.is_source"
                    :model-value="locale.fallback_enabled"
                    label="Fallback"
                    :disabled="localesSaving"
                    @update:model-value="updateLocale(locale.locale, { fallback_enabled: Boolean($event) })"
                  />
                </div>

                <div class="flex flex-wrap items-start justify-end gap-2">
                  <UButton
                    v-if="!locale.is_source"
                    size="sm"
                    color="neutral"
                    variant="soft"
                    icon="i-heroicons-star"
                    :loading="localesSaving"
                    @click="updateLocale(locale.locale, { is_source: true })"
                  >
                    Source
                  </UButton>
                  <UButton
                    v-if="!locale.is_source && locale.status !== 'published'"
                    size="sm"
                    color="primary"
                    variant="soft"
                    :loading="localesSaving"
                    @click="updateLocale(locale.locale, { status: 'published' })"
                  >
                    Publish
                  </UButton>
                  <UButton
                    v-if="!locale.is_source && locale.status !== 'disabled'"
                    size="sm"
                    color="neutral"
                    variant="ghost"
                    :loading="localesSaving"
                    @click="updateLocale(locale.locale, { status: 'disabled' })"
                  >
                    Disable
                  </UButton>
                  <UButton
                    v-if="!locale.is_source"
                    size="sm"
                    color="error"
                    variant="ghost"
                    icon="i-heroicons-trash"
                    :loading="localesSaving"
                    @click="deleteLocale(locale.locale)"
                  />
                </div>
              </div>
            </div>

            <p class="text-xs text-muted">ChowBot uses the same language list when it prepares translation jobs.</p>

            <div class="rounded-lg border border-default p-4">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 class="font-medium text-highlighted">Translation jobs</h3>
                  <p class="mt-1 text-sm text-muted">Estimate AI credits, translate in batches, then publish reviewed drafts.</p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <UButton
                    size="sm"
                    color="neutral"
                    variant="soft"
                    icon="i-heroicons-language"
                    :to="`/dashboard/sites/${siteId}/translations?locale=${encodeURIComponent(translationForm.locale || 'th')}`"
                  >
                    Review
                  </UButton>
                  <UButton
                    size="sm"
                    color="neutral"
                    variant="ghost"
                    icon="i-heroicons-arrow-path"
                    :loading="translationJobsLoading"
                    @click="loadTranslationJobs"
                  >
                    Refresh
                  </UButton>
                </div>
              </div>

              <div class="mt-4 grid gap-3 lg:grid-cols-[1fr_12rem_auto_auto]">
                <UFormField label="Target">
                  <USelect
                    v-model="translationForm.locale"
                    :items="translationLocaleOptions"
                    value-key="value"
                    label-key="label"
                    :disabled="translationBusy"
                  />
                </UFormField>
                <UFormField label="Scope">
                  <USelect
                    v-model="translationForm.scope"
                    :items="translationScopeOptions"
                    value-key="value"
                    label-key="label"
                    :disabled="translationBusy"
                  />
                </UFormField>
                <div class="flex items-end">
                  <UButton
                    color="neutral"
                    variant="soft"
                    icon="i-heroicons-calculator"
                    :loading="translationEstimateLoading"
                    :disabled="!translationForm.locale"
                    @click="estimateTranslation"
                  >
                    Estimate
                  </UButton>
                </div>
                <div class="flex items-end">
                  <UButton
                    icon="i-heroicons-sparkles"
                    :loading="translationJobCreating"
                    :disabled="!translationForm.locale || !translationEstimate || translationEstimate.total_items === 0"
                    @click="startTranslationJob"
                  >
                    Queue
                  </UButton>
                </div>
              </div>

              <UCheckbox
                v-model="translationForm.includePublished"
                class="mt-3"
                label="Re-translate already published content"
                :disabled="translationBusy"
              />

              <UAlert
                v-if="translationError"
                class="mt-4"
                color="error"
                variant="soft"
                icon="i-heroicons-exclamation-triangle"
                :description="translationError"
              />

              <div v-if="translationEstimate" class="mt-4 grid gap-3 sm:grid-cols-4">
                <div class="rounded-md border border-default p-3">
                  <p class="text-xs font-medium uppercase text-muted">Items</p>
                  <p class="mt-1 text-lg font-semibold text-highlighted">{{ formatNumber(translationEstimate.total_items) }}</p>
                </div>
                <div class="rounded-md border border-default p-3">
                  <p class="text-xs font-medium uppercase text-muted">Characters</p>
                  <p class="mt-1 text-lg font-semibold text-highlighted">{{ formatNumber(translationEstimate.total_chars) }}</p>
                </div>
                <div class="rounded-md border border-default p-3">
                  <p class="text-xs font-medium uppercase text-muted">Credits</p>
                  <p class="mt-1 text-lg font-semibold text-highlighted">{{ formatNumber(translationEstimate.estimated_credits) }}</p>
                </div>
                <div class="rounded-md border border-default p-3">
                  <p class="text-xs font-medium uppercase text-muted">Scope</p>
                  <p class="mt-1 text-lg font-semibold text-highlighted">{{ scopeLabel(translationEstimate.scope) }}</p>
                </div>
              </div>

              <div class="mt-4 flex flex-wrap gap-2">
                <UButton
                  size="sm"
                  color="primary"
                  variant="soft"
                  icon="i-heroicons-arrow-up-on-square"
                  :loading="translationPublishing"
                  :disabled="!translationForm.locale"
                  @click="publishTranslationDrafts"
                >
                  Publish drafts
                </UButton>
              </div>

              <div v-if="translationJobsLoading" class="mt-4 space-y-3">
                <USkeleton class="h-16 w-full" />
                <USkeleton class="h-16 w-full" />
              </div>
              <div v-else-if="translationJobs.length === 0" class="mt-4 rounded-md border border-dashed border-default p-4 text-sm text-muted">
                No translation jobs yet.
              </div>
              <div v-else class="mt-4 divide-y divide-default rounded-md border border-default">
                <div
                  v-for="job in translationJobs"
                  :key="job.id"
                  class="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_9rem_auto]"
                >
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="font-medium text-highlighted">{{ localeLabel(job.target_locale) }} · {{ scopeLabel(job.scope) }}</p>
                      <UBadge :color="translationStatusColor(job.status)" variant="soft">{{ job.status }}</UBadge>
                    </div>
                    <p class="mt-1 text-sm text-muted">
                      {{ translationProgress(job) }} · {{ translationCreditText(job) }} · {{ formatDateTime(job.created_at) }}
                    </p>
                    <p v-if="job.error" class="mt-1 text-xs text-error">{{ job.error }}</p>
                  </div>
                  <div class="text-sm text-muted lg:text-right">
                    <p>{{ formatNumber(job.total_items) }} items</p>
                    <p>{{ formatNumber(job.failed_items) }} failed</p>
                  </div>
                  <div class="flex items-start justify-end gap-2">
                    <UButton
                      v-if="job.status === 'queued' || job.status === 'running'"
                      size="sm"
                      color="neutral"
                      variant="soft"
                      icon="i-heroicons-play"
                      :loading="translationRunningJobId === job.id"
                      @click="runTranslationJob(job.id)"
                    >
                      Run batch
                    </UButton>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Domain -->
        <div class="grid gap-8 p-6 md:grid-cols-[1fr_2fr]">
          <div>
            <h2 class="font-semibold text-highlighted">Domain</h2>
            <p class="mt-1 text-sm text-muted">Use your own web address, like restaurant.com.</p>
          </div>
          <div class="space-y-5">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div class="min-w-0">
                <p class="text-sm text-default">Your KrabiClaw address stays live. Add your own domain when you want guests to use it.</p>
                <p class="mt-1 text-xs text-muted">We set up both restaurant.com and www.restaurant.com automatically.</p>
              </div>
              <UButton icon="i-heroicons-plus" class="justify-center" @click="openAddDomainModal">
                Add domain
              </UButton>
            </div>

            <UAlert
              v-if="domainError && !showAddDomainModal"
              color="error"
              variant="soft"
              icon="i-heroicons-exclamation-triangle"
              :description="domainError"
            />

            <div v-if="domainsLoading" class="space-y-3">
              <USkeleton class="h-24 w-full" />
              <USkeleton class="h-24 w-full" />
            </div>

            <div v-else-if="domains.length === 0" class="rounded-lg border border-dashed border-default p-5 text-sm text-muted">
              Your KrabiClaw address is live. Add your own domain when you are ready.
            </div>

            <div v-else class="space-y-3">
              <div
                v-for="domain in domains"
                :key="domain.id"
                class="rounded-lg border border-default p-4"
              >
                <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div class="flex min-w-0 gap-3">
                    <div
                      class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full"
                      :class="domain.status === 'active' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'"
                    >
                      <UIcon :name="domain.status === 'active' ? 'i-heroicons-check' : 'i-heroicons-clock'" class="size-4" />
                    </div>
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <p class="break-all font-medium text-highlighted">{{ domain.domain }}</p>
                        <UBadge v-if="domain.role === 'canonical'" color="primary" variant="soft">Primary</UBadge>
                        <UBadge v-if="domain.type === 'subdomain'" color="neutral" variant="soft">KrabiClaw address</UBadge>
                      </div>
                      <p class="mt-1 text-sm text-muted">{{ domainStatusText(domain) }}</p>
                      <p v-if="domain.error_message" class="mt-1 text-xs text-error">{{ domain.error_message }}</p>
                    </div>
                  </div>
                  <div class="flex shrink-0 flex-wrap gap-2">
                    <UButton v-if="domain.type === 'custom'" size="sm" variant="soft" color="neutral" icon="i-heroicons-arrow-path" :loading="syncingDomainId === domain.id" @click="syncDomain(domain.id)">Check status</UButton>
                    <UButton v-if="domain.status === 'active' && domain.role !== 'canonical'" size="sm" variant="soft" color="neutral" icon="i-heroicons-star" @click="setPrimaryDomain(domain.id)">Make primary</UButton>
                    <UButton v-if="domain.type === 'custom'" size="sm" variant="ghost" color="neutral" icon="i-heroicons-no-symbol" @click="disableDomain(domain.id)">Disable</UButton>
                    <UButton v-if="domain.type === 'custom'" size="sm" variant="ghost" color="error" icon="i-heroicons-trash" @click="deleteDomain(domain.id)">Delete</UButton>
                  </div>
                </div>

                <div v-if="domainNeedsSetup(domain)" class="mt-4 rounded-lg bg-muted p-4">
                  <div class="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p class="text-sm font-medium text-highlighted">Finish setup at your domain provider</p>
                      <p class="mt-1 text-sm text-muted">Open the place where you bought your domain and add this record.</p>
                    </div>
                    <p v-if="domain.last_synced_at" class="text-xs text-muted">Last checked {{ formatDateTime(domain.last_synced_at) }}</p>
                  </div>
                  <div class="mt-4 grid gap-3 sm:grid-cols-3">
                    <div class="rounded-md border border-default bg-default p-3">
                      <p class="text-xs font-medium uppercase text-muted">Type</p>
                      <p class="mt-1 text-sm text-default">{{ domain.instructions.dns.type }}</p>
                    </div>
                    <div class="rounded-md border border-default bg-default p-3">
                      <p class="text-xs font-medium uppercase text-muted">Name</p>
                      <p class="mt-1 break-all font-mono text-sm text-default">{{ domain.instructions.dns.name }}</p>
                    </div>
                    <div class="rounded-md border border-default bg-default p-3">
                      <p class="text-xs font-medium uppercase text-muted">Points to</p>
                      <p class="mt-1 break-all font-mono text-sm text-default">{{ domain.instructions.dns.value }}</p>
                    </div>
                  </div>
                  <p class="mt-3 text-xs text-muted">After saving that record, come back and choose Check status.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Notifications -->
        <div class="grid gap-8 p-6 md:grid-cols-[1fr_2fr]">
          <div>
            <h2 class="font-semibold text-highlighted">Notifications</h2>
            <p class="mt-1 text-sm text-muted">
              Connect WhatsApp to receive alerts when content is published, new reviews come in, or your AI assistant completes a task.
            </p>
          </div>
          <div class="space-y-5">
            <UFormField
              label="WhatsApp number"
              help="Enter your WhatsApp number with country code. KrabiClaw will send you notifications here."
            >
              <div class="flex gap-2">
                <UInput
                  v-model="whatsappPhone"
                  placeholder="+1 555 000 0000"
                  class="flex-1"
                  :loading="savingWhatsapp"
                />
                <UButton
                  :loading="savingWhatsapp"
                  :disabled="!whatsappPhone.trim() || whatsappPhone === savedWhatsappPhone"
                  @click="saveWhatsappPhone"
                >
                  Save
                </UButton>
              </div>
            </UFormField>
            <div v-if="savedWhatsappPhone" class="flex items-center gap-2 text-sm text-muted">
              <UIcon name="i-heroicons-check-circle" class="size-4 shrink-0 text-green-500" />
              Connected: {{ savedWhatsappPhone }}
            </div>
          </div>
        </div>

        <StickySaveBar
          :visible="isDirty"
          :saving="saving"
          @save="saveSettings"
          @reset="resetForm"
        />

        <!-- Transfer site -->
        <div v-if="hasTransferAccess" class="grid gap-8 p-6 md:grid-cols-[1fr_2fr]">
          <div>
            <h2 class="font-semibold text-highlighted">Transfer site</h2>
            <p class="mt-1 text-sm text-muted">Transfer ownership to your client. They'll receive a link to accept and the site will move to their account. Billing is not included — they manage their own subscription.</p>
          </div>
          <div class="space-y-4">
            <UAlert
              v-if="pendingTransfer"
              color="warning"
              variant="soft"
              icon="i-heroicons-clock"
              title="Transfer pending"
              :description="`Waiting for ${pendingTransfer.to_email} to accept. Expires ${formatDateTime(pendingTransfer.expires_at)}.`"
            />

            <div v-if="!pendingTransfer" class="flex gap-3">
              <UInput
                v-model="transferEmail"
                placeholder="client@email.com"
                icon="i-heroicons-envelope"
                class="flex-1"
                :disabled="initiatingTransfer"
              />
              <UButton
                color="primary"
                variant="soft"
                :loading="initiatingTransfer"
                :disabled="!transferEmail.trim()"
                @click="initiateTransfer"
              >
                Send transfer
              </UButton>
            </div>

            <div v-if="pendingTransfer" class="flex gap-2 flex-wrap">
              <UButton
                size="sm"
                variant="soft"
                icon="i-heroicons-clipboard-document"
                @click="copyTransferLink"
              >
                Copy link
              </UButton>
              <UButton
                size="sm"
                color="error"
                variant="soft"
                icon="i-heroicons-x-circle"
                :loading="cancellingTransfer"
                @click="cancelTransfer"
              >
                Cancel transfer
              </UButton>
            </div>

            <UAlert v-if="transferError" color="error" variant="soft" :description="transferError" />
            <UAlert v-if="transferSuccess" color="success" variant="soft" :description="transferSuccess" />
          </div>
        </div>

      </div>
    </UPageBody>

    <UModal v-model:open="showAddDomainModal" :ui="{ content: 'max-w-xl' }">
      <template #content>
        <form class="p-6" @submit.prevent="addDomain">
          <div class="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 class="text-xl font-semibold text-highlighted">Add domain</h2>
              <p class="mt-2 text-sm leading-6 text-muted">
                Enter the domain guests should use for your restaurant website. We will also set up the www version automatically.
              </p>
            </div>
            <UButton icon="i-heroicons-x-mark" color="neutral" variant="ghost" size="sm" aria-label="Close modal" @click="closeAddDomainModal" />
          </div>

          <UFormField label="Domain">
            <UInput
              v-model="domainForm.domain"
              icon="i-heroicons-globe-alt"
              placeholder="restaurant.com"
              :disabled="addingDomain"
              autofocus
              size="xl"
            />
          </UFormField>

          <UAlert
            v-if="domainError"
            class="mt-4"
            color="error"
            variant="soft"
            icon="i-heroicons-exclamation-triangle"
            :description="domainError"
          />

          <div class="mt-6 flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" :disabled="addingDomain" @click="closeAddDomainModal">Cancel</UButton>
            <UButton type="submit" icon="i-heroicons-plus" :loading="addingDomain" :disabled="!domainForm.domain.trim()">
              Add domain
            </UButton>
          </div>
        </form>
      </template>
    </UModal>
  </UPage>
</template>

<script setup lang="ts">
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY, isCurrencyCode, type CurrencyCode } from '~/shared/currencies'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const siteId = route.params.siteId as string
const toast = useToast()

const urlStructureOptions = [
  { label: 'Location subdirectories', value: 'location_subdirectories' },
  { label: 'Brand pages only', value: 'brand_pages' }
]

const currencyOptions = CURRENCY_OPTIONS.map(option => ({ ...option }))
const localeOptions = [
  { label: 'English', value: 'en' },
  { label: 'Thai', value: 'th' },
  { label: 'French', value: 'fr' },
  { label: 'Japanese', value: 'ja' },
  { label: 'Arabic', value: 'ar' },
  { label: 'Chinese (Simplified)', value: 'zh-CN' },
  { label: 'Korean', value: 'ko' },
  { label: 'Spanish', value: 'es' },
  { label: 'German', value: 'de' },
  { label: 'Italian', value: 'it' },
]

interface SiteLocaleRow {
  locale: string
  label: string | null
  is_source: boolean
  status: 'draft' | 'published' | 'disabled'
  fallback_enabled: boolean
}

type TranslationScope = 'site' | 'content' | 'menus' | 'locations' | 'posts'

interface TranslationEstimate {
  source_locale: string
  target_locale: string
  scope: TranslationScope
  total_items: number
  total_chars: number
  estimated_credits: number
}

interface TranslationJobRow {
  id: string
  source_locale: string
  target_locale: string
  scope: TranslationScope
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'
  total_items: number
  estimated_credits: number
  actual_credits: number
  processed_items: number
  failed_items: number
  error: string | null
  created_at: string
}

const loading = ref(true)
const error = ref<string | null>(null)
const saving = ref(false)
const settings = ref<ApiRecord | null>(null)
const { buildHeaderLinks } = useDashboardSiteLinks(siteId, computed(() => {
  const value = settings.value?.public_url
  return typeof value === 'string' ? value : null
}))
const domains = ref<ApiRecord[]>([])
const domainsLoading = ref(false)
const addingDomain = ref(false)
const syncingDomainId = ref<string | null>(null)
const domainError = ref('')
const showAddDomainModal = ref(false)
const domainForm = reactive({
  domain: ''
})
const locales = ref<SiteLocaleRow[]>([])
const sourceLocale = ref('en')
const localesLoading = ref(false)
const localesSaving = ref(false)
const localesError = ref('')
const localeForm = reactive({
  locale: 'th'
})
const translationForm = reactive({
  locale: 'th',
  scope: 'site' as TranslationScope,
  includePublished: false,
})
const translationEstimate = ref<TranslationEstimate | null>(null)
const translationJobs = ref<TranslationJobRow[]>([])
const translationError = ref('')
const translationEstimateLoading = ref(false)
const translationJobCreating = ref(false)
const translationJobsLoading = ref(false)
const translationRunningJobId = ref<string | null>(null)
const translationPublishing = ref(false)

const availableLocaleOptions = computed(() => {
  const existing = new Set(locales.value.map(locale => locale.locale))
  return localeOptions.filter(option => !existing.has(option.value))
})

const hasAvailableLocales = computed(() => availableLocaleOptions.value.length > 0)

const translationScopeOptions = [
  { label: 'Entire site', value: 'site' },
  { label: 'Pages', value: 'content' },
  { label: 'Menus', value: 'menus' },
  { label: 'Locations', value: 'locations' },
  { label: 'Posts', value: 'posts' },
]

const translationLocaleOptions = computed(() => {
  const options = locales.value
    .filter(locale => !locale.is_source)
    .map(locale => ({ label: localeLabel(locale.locale, locale.label), value: locale.locale }))

  if (options.length) return options
  return localeOptions.filter(option => option.value !== sourceLocale.value)
})

const translationBusy = computed(() =>
  translationEstimateLoading.value || translationJobCreating.value || translationPublishing.value || Boolean(translationRunningJobId.value)
)

const form = reactive({
  brand_name: '',
  brand_description: '',
  logo_asset_id: '' as string | null,
  contact_email: '',
  brand_color: '',
  default_currency: DEFAULT_CURRENCY,
  primary_location_id: null as string | null,
  url_structure: 'location_subdirectories',
  footer_tagline: '',
  social_facebook: '',
  social_instagram: '',
  social_tiktok: '',
  press_email: '',
  partnerships_email: '',
  catering_email: '',
  careers_email: '',
} as {
  brand_name: string
  brand_description: string
  logo_asset_id: string | null
  contact_email: string
  brand_color: string
  default_currency: CurrencyCode
  primary_location_id: string | null
  url_structure: string
  footer_tagline: string
  social_facebook: string
  social_instagram: string
  social_tiktok: string
  press_email: string
  partnerships_email: string
  catering_email: string
  careers_email: string
})

const toSubdomainSlug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 30)

const previewSubdomain = computed(() => {
  const slug = toSubdomainSlug(form.brand_name)
  return slug || (settings.value?.subdomain ?? '')
})

const DEFAULT_URL_STRUCTURE = 'location_subdirectories'

function normalizeUrlStructure(value: unknown): string {
  return typeof value === 'string' && value.length > 0
    ? value
    : DEFAULT_URL_STRUCTURE
}

const isDirty = computed(() => {
  if (!settings.value) return false
  return (
    form.brand_name !== settings.value.brand_name ||
    form.brand_description !== settings.value.brand_description ||
    form.logo_asset_id !== settings.value.logo_asset_id ||
    form.contact_email !== settings.value.contact_email ||
    form.brand_color !== (settings.value.brand_color || '') ||
    form.default_currency !== (settings.value.default_currency || DEFAULT_CURRENCY) ||
    form.url_structure !== normalizeUrlStructure(settings.value.url_structure) ||
    form.footer_tagline !== (settings.value.footer_tagline || '') ||
    form.social_facebook !== (settings.value.social_facebook || '') ||
    form.social_instagram !== (settings.value.social_instagram || '') ||
    form.social_tiktok !== (settings.value.social_tiktok || '') ||
    form.press_email !== ((settings.value as ApiValue).press_email || '') ||
    form.partnerships_email !== ((settings.value as ApiValue).partnerships_email || '') ||
    form.catering_email !== ((settings.value as ApiValue).catering_email || '') ||
    form.careers_email !== ((settings.value as ApiValue).careers_email || '')
  )
})

const headerLinks = computed(() => buildHeaderLinks())

const loadSettings = async () => {
  loading.value = true
  error.value = null

  try {
    const response = await $fetch<ApiRecord>(`/api/sites/${siteId}/settings`)
    if (!response.success) throw new Error('Failed to load settings')
    settings.value = response.settings
    resetForm()
    await Promise.all([loadDomains(), loadLocales(), loadTranslationJobs()])
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load settings'
  } finally {
    loading.value = false
  }
}

const loadLocales = async () => {
  localesLoading.value = true
  localesError.value = ''
  try {
    const response = await $fetch<{ success: boolean; source_locale: string; locales: SiteLocaleRow[] }>(
      `/api/editor/sites/${siteId}/locales`
    )
    sourceLocale.value = response.source_locale || 'en'
    locales.value = response.locales || []
    const existing = new Set(locales.value.map(locale => locale.locale))
    localeForm.locale = localeOptions.find(option => !existing.has(option.value))?.value || ''
    translationForm.locale = translationLocaleOptions.value.find(option => option.value === translationForm.locale)?.value
      || translationLocaleOptions.value[0]?.value
      || ''
  } catch (err) {
    localesError.value = err instanceof Error ? err.message : 'Failed to load languages'
  } finally {
    localesLoading.value = false
  }
}

const localeLabel = (locale: string, label?: string | null) =>
  label || localeOptions.find(option => option.value === locale)?.label || locale

const addLocale = async () => {
  if (!localeForm.locale) return
  localesSaving.value = true
  localesError.value = ''
  try {
    await $fetch(`/api/editor/sites/${siteId}/locales`, {
      method: 'POST',
      body: {
        locale: localeForm.locale,
        label: localeLabel(localeForm.locale),
        status: localeForm.locale === sourceLocale.value ? 'published' : 'draft',
        is_source: locales.value.length === 0,
        fallback_enabled: true,
      }
    })
    await loadLocales()
    toast.add({ description: 'Language added', color: 'success' })
  } catch (err) {
    localesError.value = err instanceof Error ? err.message : 'Failed to add language'
  } finally {
    localesSaving.value = false
  }
}

const updateLocale = async (
  locale: string,
  updates: Partial<Pick<SiteLocaleRow, 'label' | 'status' | 'fallback_enabled' | 'is_source'>>
) => {
  localesSaving.value = true
  localesError.value = ''
  try {
    await $fetch(`/api/editor/sites/${siteId}/locales/${encodeURIComponent(locale)}`, {
      method: 'PATCH',
      body: updates
    })
    await loadLocales()
    toast.add({ description: 'Language updated', color: 'success' })
  } catch (err) {
    localesError.value = err instanceof Error ? err.message : 'Failed to update language'
  } finally {
    localesSaving.value = false
  }
}

const onLocaleLabelChange = (locale: string, event: Event) => {
  const target = event.target as HTMLInputElement | null
  updateLocale(locale, { label: target?.value ?? '' })
}

const deleteLocale = async (locale: string) => {
  localesSaving.value = true
  localesError.value = ''
  try {
    await $fetch(`/api/editor/sites/${siteId}/locales/${encodeURIComponent(locale)}`, { method: 'DELETE' })
    await loadLocales()
    toast.add({ description: 'Language deleted', color: 'success' })
  } catch (err) {
    localesError.value = err instanceof Error ? err.message : 'Failed to delete language'
  } finally {
    localesSaving.value = false
  }
}

const loadTranslationJobs = async () => {
  translationJobsLoading.value = true
  translationError.value = ''
  try {
    const response = await $fetch<{ success: boolean; jobs: TranslationJobRow[] }>(
      `/api/editor/sites/${siteId}/translations/jobs`
    )
    translationJobs.value = response.jobs || []
  } catch (err) {
    translationError.value = err instanceof Error ? err.message : 'Failed to load translation jobs'
  } finally {
    translationJobsLoading.value = false
  }
}

const estimateTranslation = async () => {
  if (!translationForm.locale) return
  translationEstimateLoading.value = true
  translationError.value = ''
  try {
    const response = await $fetch<{ success: boolean; estimate: TranslationEstimate }>(
      `/api/editor/sites/${siteId}/translations/inventory`,
      {
        query: {
          locale: translationForm.locale,
          scope: translationForm.scope,
          includePublished: translationForm.includePublished ? 'true' : 'false',
        }
      }
    )
    translationEstimate.value = response.estimate
  } catch (err) {
    translationEstimate.value = null
    translationError.value = err instanceof Error ? err.message : 'Failed to estimate translation'
  } finally {
    translationEstimateLoading.value = false
  }
}

const startTranslationJob = async () => {
  if (!translationForm.locale) return
  translationJobCreating.value = true
  translationError.value = ''
  try {
    await $fetch(`/api/editor/sites/${siteId}/translations/jobs`, {
      method: 'POST',
      body: {
        locale: translationForm.locale,
        scope: translationForm.scope,
        includePublished: translationForm.includePublished,
      }
    })
    toast.add({ description: 'Translation job queued', color: 'success' })
    await loadTranslationJobs()
  } catch (err) {
    translationError.value = err instanceof Error ? err.message : 'Failed to queue translation job'
  } finally {
    translationJobCreating.value = false
  }
}

const runTranslationJob = async (jobId: string) => {
  translationRunningJobId.value = jobId
  translationError.value = ''
  try {
    await $fetch(`/api/editor/sites/${siteId}/translations/jobs/${jobId}/run`, { method: 'POST' })
    toast.add({ description: 'Translation batch complete', color: 'success' })
    await Promise.all([loadTranslationJobs(), estimateTranslation()])
  } catch (err) {
    translationError.value = err instanceof Error ? err.message : 'Failed to run translation batch'
  } finally {
    translationRunningJobId.value = null
  }
}

const publishTranslationDrafts = async () => {
  if (!translationForm.locale) return
  translationPublishing.value = true
  translationError.value = ''
  try {
    const response = await $fetch<{ success: boolean; result: { published_items: number } }>(
      `/api/editor/sites/${siteId}/translations/publish`,
      {
        method: 'POST',
        body: {
          locale: translationForm.locale,
          scope: translationForm.scope,
        }
      }
    )
    toast.add({ description: `${response.result.published_items} translation drafts published`, color: 'success' })
    await Promise.all([loadLocales(), loadTranslationJobs(), estimateTranslation()])
  } catch (err) {
    translationError.value = err instanceof Error ? err.message : 'Failed to publish translations'
  } finally {
    translationPublishing.value = false
  }
}

const scopeLabel = (scope: string) =>
  translationScopeOptions.find(option => option.value === scope)?.label || scope

const translationStatusColor = (status: TranslationJobRow['status']) => {
  if (status === 'succeeded') return 'success'
  if (status === 'failed' || status === 'canceled') return 'error'
  if (status === 'running') return 'primary'
  return 'warning'
}

const translationProgress = (job: TranslationJobRow) =>
  `${formatNumber(job.processed_items)} of ${formatNumber(job.total_items)} processed`

const translationCreditText = (job: TranslationJobRow) =>
  job.actual_credits > 0
    ? `${formatNumber(job.actual_credits)} credits used (${formatNumber(job.estimated_credits)} est.)`
    : `${formatNumber(job.estimated_credits)} credits est.`

const formatNumber = (value: number | null | undefined) =>
  new Intl.NumberFormat().format(Number(value || 0))

function normalizeOptionalHttpUrl(value: unknown): string | null {
  if (!value || typeof value !== 'string' || !value.trim()) return null

  try {
    const url = new URL(value.trim())
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('URL must start with http:// or https://')
    }

    return url.toString()
  } catch {
    throw new Error('Enter a valid http:// or https:// URL.')
  }
}

const saveSettings = async () => {
  saving.value = true
  error.value = null

  try {
    const payload = {
      ...form,
      social_facebook: normalizeOptionalHttpUrl(form.social_facebook) || '',
      social_instagram: normalizeOptionalHttpUrl(form.social_instagram) || '',
      social_tiktok: normalizeOptionalHttpUrl(form.social_tiktok) || ''
    }

    const response = await $fetch<ApiRecord>(`/api/sites/${siteId}/settings`, {
      method: 'PATCH',
      body: payload
    })

    if (!response.success) throw new Error('Failed to save settings')
    settings.value = response.settings
    resetForm()
    await loadDomains()
    const siteRefresh = useState<number>('site:refresh', () => 0)
    siteRefresh.value++
    toast.add({ description: 'Settings saved', color: 'success' })
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save settings'
  } finally {
    saving.value = false
  }
}

const resetForm = () => {
  if (!settings.value) return
  form.brand_name = settings.value.brand_name || ''
  form.brand_description = settings.value.brand_description || ''
  form.logo_asset_id = settings.value.logo_asset_id || null
  form.contact_email = settings.value.contact_email || ''
  form.brand_color = (settings.value as ApiValue).brand_color || ''
  const currency = (settings.value as ApiValue).default_currency
  form.default_currency = isCurrencyCode(currency) ? currency : DEFAULT_CURRENCY
  form.primary_location_id = settings.value.primary_location_id || null
  form.url_structure = normalizeUrlStructure(settings.value.url_structure)
  form.footer_tagline = (settings.value as ApiValue).footer_tagline || ''
  form.social_facebook = (settings.value as ApiValue).social_facebook || ''
  form.social_instagram = (settings.value as ApiValue).social_instagram || ''
  form.social_tiktok = (settings.value as ApiValue).social_tiktok || ''
  form.press_email = (settings.value as ApiValue).press_email || ''
  form.partnerships_email = (settings.value as ApiValue).partnerships_email || ''
  form.catering_email = (settings.value as ApiValue).catering_email || ''
  form.careers_email = (settings.value as ApiValue).careers_email || ''
}

function handleLogoChange(_asset: { id: string; publicUrl: string; thumbnailUrl: string } | null) {
  // Logo change is handled by v-model, this is for any additional logic if needed
}

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ description: 'URL copied', color: 'success' })
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    console.error('Failed to copy to clipboard:', error.message)
    toast.add({ description: 'Failed to copy URL', color: 'error' })
  }
}

const loadDomains = async () => {
  domainsLoading.value = true
  domainError.value = ''
  try {
    const response = await $fetch<ApiRecord>(`/api/sites/${siteId}/domains`)
    domains.value = response.domains || []
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : (err && typeof err === 'object' && 'data' in err && typeof err.data === 'object' && err.data && 'error' in err.data && typeof err.data.error === 'string') ? err.data.error : 'Failed to load domains'
    domainError.value = errorMessage
  } finally {
    domainsLoading.value = false
  }
}

const openAddDomainModal = () => {
  domainError.value = ''
  showAddDomainModal.value = true
}

const closeAddDomainModal = () => {
  if (addingDomain.value) return
  showAddDomainModal.value = false
  domainError.value = ''
}

const addDomain = async () => {
  if (!domainForm.domain.trim()) return
  addingDomain.value = true
  domainError.value = ''
  try {
    await $fetch(`/api/sites/${siteId}/domains`, {
      method: 'POST',
      body: { domain: domainForm.domain.trim(), include_www: true }
    })
    domainForm.domain = ''
    showAddDomainModal.value = false
    toast.add({ description: 'Domain added', color: 'success' })
    await loadDomains()
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : (err && typeof err === 'object' && 'data' in err && typeof err.data === 'object' && err.data && 'error' in err.data && typeof err.data.error === 'string') ? err.data.error : 'Failed to add domain'
    domainError.value = errorMessage
  } finally {
    addingDomain.value = false
  }
}

const syncDomain = async (domainId: string) => {
  syncingDomainId.value = domainId
  domainError.value = ''
  try {
    await $fetch(`/api/sites/${siteId}/domains/${domainId}/sync`, { method: 'POST' })
    toast.add({ description: 'Domain synced', color: 'success' })
    await loadDomains()
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : (err && typeof err === 'object' && 'data' in err && typeof err.data === 'object' && err.data && 'error' in err.data && typeof err.data.error === 'string') ? err.data.error : 'Failed to sync domain'
    domainError.value = errorMessage
  } finally {
    syncingDomainId.value = null
  }
}

const setPrimaryDomain = async (domainId: string) => {
  await $fetch(`/api/sites/${siteId}/domains/${domainId}`, {
    method: 'PATCH',
    body: { role: 'canonical' }
  })
  toast.add({ description: 'Primary domain updated', color: 'success' })
  await Promise.all([loadDomains(), loadSettings()])
}

const disableDomain = async (domainId: string) => {
  await $fetch(`/api/sites/${siteId}/domains/${domainId}`, {
    method: 'PATCH',
    body: { status: 'disabled' }
  })
  toast.add({ description: 'Domain disabled', color: 'success' })
  await loadDomains()
}

const deleteDomain = async (domainId: string) => {
  await $fetch(`/api/sites/${siteId}/domains/${domainId}`, { method: 'DELETE' })
  toast.add({ description: 'Domain deleted', color: 'success' })
  await Promise.all([loadDomains(), loadSettings()])
}

const domainStatusText = (domain: ApiRecord) => {
  if (domain.type === 'subdomain') return 'Your built-in KrabiClaw address is live.'
  if (domain.status === 'active') return 'Ready. Guests can use this domain.'
  if (domain.status === 'disabled') return 'Disabled. Guests are not being sent here.'
  if (domain.status === 'failed' || domain.status === 'blocked') return 'Needs attention. Check the setup details below.'
  return 'Waiting for the domain settings to update.'
}

const domainNeedsSetup = (domain: ApiRecord) => {
  return domain.type === 'custom' && domain.status !== 'active' && domain.status !== 'disabled' && domain.instructions?.dns
}

const formatDateTime = (value: string | null) => {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Never'
  return date.toLocaleString()
}

// WhatsApp notification number
const whatsappPhone = ref('')
const savedWhatsappPhone = ref<string | null>(null)
const savingWhatsapp = ref(false)

const loadWhatsappPhone = async () => {
  try {
    const res = await $fetch<ApiRecord>(`/api/editor/sites/${siteId}/notifications`)
    savedWhatsappPhone.value = res.notifications?.whatsapp_phone ?? null
    whatsappPhone.value = savedWhatsappPhone.value ?? ''
  } catch {
    // WhatsApp notification settings are optional until configured.
  }
}

const saveWhatsappPhone = async () => {
  if (!whatsappPhone.value.trim()) return
  savingWhatsapp.value = true
  try {
    const res = await $fetch<ApiRecord>(`/api/editor/sites/${siteId}/notifications`, {
      method: 'PATCH',
      body: { whatsapp_phone: whatsappPhone.value.trim() }
    })
    savedWhatsappPhone.value = res.notifications?.whatsapp_phone ?? null
    whatsappPhone.value = savedWhatsappPhone.value ?? ''
    toast.add({ description: 'WhatsApp number saved', color: 'success' })
  } catch {
    toast.add({ description: 'Failed to save WhatsApp number', color: 'error' })
  } finally {
    savingWhatsapp.value = false
  }
}

// Site transfer
interface PendingTransfer {
  id: string
  to_email: string
  status: string
  created_at: string
  expires_at: string
}

const transferEmail = ref('')
const pendingTransfer = ref<PendingTransfer | null>(null)
const initiatingTransfer = ref(false)
const cancellingTransfer = ref(false)
const transferError = ref<string | null>(null)
const transferSuccess = ref<string | null>(null)
const hasTransferAccess = ref(false)

const loadPendingTransfer = async () => {
  try {
    const res = await $fetch<{ pending: PendingTransfer | null }>(`/api/admin/sites/${siteId}/transfer`)
    pendingTransfer.value = res.pending
    hasTransferAccess.value = true
  } catch {
    hasTransferAccess.value = false
    // Not an admin — transfer section won't be usable but that's fine
  }
}

const initiateTransfer = async () => {
  transferError.value = null
  transferSuccess.value = null
  initiatingTransfer.value = true
  try {
    const res = await $fetch<{ transfer_url: string; to_email: string }>(`/api/admin/sites/${siteId}/transfer`, {
      method: 'POST',
      body: { email: transferEmail.value.trim() },
    })
    await loadPendingTransfer()
    await navigator.clipboard.writeText(res.transfer_url)
    transferSuccess.value = `Transfer link sent to ${res.to_email} and copied to clipboard.`
    transferEmail.value = ''
  } catch (err: unknown) {
    const msg = err != null && typeof err === 'object' && 'data' in err
      && err.data != null && typeof err.data === 'object' && 'error' in err.data
      && typeof (err.data as Record<string, unknown>).error === 'string'
      ? (err.data as Record<string, string>).error
      : null
    transferError.value = msg ?? 'Failed to initiate transfer.'
  } finally {
    initiatingTransfer.value = false
  }
}

const cancelTransfer = async () => {
  cancellingTransfer.value = true
  transferError.value = null
  transferSuccess.value = null
  try {
    await $fetch(`/api/admin/sites/${siteId}/transfer`, { method: 'DELETE' })
    pendingTransfer.value = null
    transferSuccess.value = 'Transfer cancelled.'
  } catch (err: unknown) {
    const msg = err != null && typeof err === 'object' && 'data' in err
      && err.data != null && typeof err.data === 'object' && 'error' in err.data
      && typeof (err.data as Record<string, unknown>).error === 'string'
      ? (err.data as Record<string, string>).error
      : null
    transferError.value = msg ?? 'Failed to cancel transfer.'
  } finally {
    cancellingTransfer.value = false
  }
}

const copyTransferLink = async () => {
  if (!pendingTransfer.value) return
  // Re-fetch to get the URL (or reconstruct from token — we don't store token in this state)
  // Instead, initiate a fresh one (which replaces the old pending)
  transferError.value = null
  try {
    const res = await $fetch<{ transfer_url: string; to_email: string }>(`/api/admin/sites/${siteId}/transfer`, {
      method: 'POST',
      body: { email: pendingTransfer.value.to_email },
    })
    await loadPendingTransfer()
    await navigator.clipboard.writeText(res.transfer_url)
    transferSuccess.value = 'New link copied to clipboard.'
  } catch (err: unknown) {
    const msg = err != null && typeof err === 'object' && 'data' in err
      && err.data != null && typeof err.data === 'object' && 'error' in err.data
      && typeof (err.data as Record<string, unknown>).error === 'string'
      ? (err.data as Record<string, string>).error
      : null
    transferError.value = msg ?? 'Failed to copy link.'
  }
}

onMounted(() => {
  loadSettings()
  loadWhatsappPhone()
  loadPendingTransfer()
})

useSeoMeta({ title: 'Site Settings | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
