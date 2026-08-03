<template>
  <UDashboardPanel id="agent-skills">
    <template #header>
      <UDashboardNavbar :title="title">
        <template #leading><DashboardSidebarCollapseButton /></template>
        <template #right>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-refresh-cw"
            aria-label="Refresh agent skills"
            :loading="loading"
            @click="loadSkills"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto max-w-7xl space-y-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p class="text-sm text-muted">{{ description }}</p>
            <p class="mt-1 text-xs text-dimmed">Scope: {{ scopeLabel }}</p>
          </div>
          <UButton icon="i-lucide-plus" @click="openCreate">New skill</UButton>
        </div>

        <UAlert
          v-if="loadError"
          color="error"
          variant="soft"
          icon="i-lucide-triangle-alert"
          :description="loadError"
          data-testid="agent-skills-error"
        />

        <div class="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <UCard>
            <template #header>
              <div class="flex items-center justify-between gap-3">
                <div>
                  <h2 class="font-semibold text-highlighted">Skill identities</h2>
                  <p class="mt-1 text-sm text-muted">{{ skills.length }} configured</p>
                </div>
                <UIcon name="i-lucide-sparkles" class="size-5 text-primary" />
              </div>
            </template>

            <div v-if="loading" class="space-y-3">
              <USkeleton v-for="i in 4" :key="i" class="h-16 rounded-lg" />
            </div>
            <div v-else-if="skills.length === 0" class="rounded-lg border border-dashed border-default p-5 text-center">
              <UIcon name="i-lucide-sparkles" class="mx-auto size-8 text-dimmed" />
              <p class="mt-3 text-sm font-medium text-highlighted">No skills yet</p>
              <p class="mt-1 text-sm text-muted">Create a skill or import a Markdown file.</p>
            </div>
            <div v-else class="space-y-2">
              <button
                v-for="skill in skills"
                :key="skill.id"
                type="button"
                class="w-full rounded-lg border px-3 py-3 text-left transition-colors"
                :class="selectedSkill?.skill.id === skill.id ? 'border-primary bg-primary/5' : 'border-default hover:bg-elevated'"
                :data-testid="`agent-skill-${skill.slug}`"
                @click="selectSkill(skill.id)"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="truncate font-medium text-highlighted">{{ skill.slug }}</p>
                    <p class="mt-1 text-xs text-muted">{{ skill.task }}</p>
                  </div>
                  <UBadge :color="skill.active_version_id ? 'success' : 'neutral'" variant="soft" :label="skill.active_version_id ? 'Active' : 'Draft'" />
                </div>
                <p class="mt-2 text-xs text-dimmed">v{{ skill.active_version ?? skill.latest_version ?? 1 }} · priority {{ skill.priority ?? '—' }}</p>
              </button>
            </div>
          </UCard>

          <div class="space-y-6">
            <UCard v-if="selectedSkill" data-testid="agent-skill-detail">
              <template #header>
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <h2 class="font-semibold text-highlighted">{{ selectedSkill.skill.slug }}</h2>
                      <UBadge :label="selectedSkill.skill.task" color="neutral" variant="soft" />
                    </div>
                    <p class="mt-1 text-sm text-muted">{{ selectedSkill.skill.scope_type }} skill identity</p>
                  </div>
                  <UButton
                    v-if="canWrite"
                    size="sm"
                    color="neutral"
                    variant="outline"
                    icon="i-lucide-plus"
                    :loading="creatingVersion"
                    @click="createVersion"
                  >
                    New version
                  </UButton>
                </div>
              </template>

              <div class="space-y-6">
                <div class="grid gap-4 sm:grid-cols-3">
                  <div class="rounded-lg bg-elevated p-3">
                    <p class="text-xs text-muted">Name</p>
                    <p class="mt-1 font-medium text-highlighted">{{ currentVersion?.name || '—' }}</p>
                  </div>
                  <div class="rounded-lg bg-elevated p-3">
                    <p class="text-xs text-muted">Latest version</p>
                    <p class="mt-1 font-medium text-highlighted">v{{ currentVersion?.version ?? '—' }}</p>
                  </div>
                  <div class="rounded-lg bg-elevated p-3">
                    <p class="text-xs text-muted">Content hash</p>
                    <p class="mt-1 truncate font-mono text-xs text-highlighted">{{ currentVersion?.content_hash || '—' }}</p>
                  </div>
                </div>

                <div>
                  <div class="mb-3 flex items-center justify-between gap-3">
                    <h3 class="font-medium text-highlighted">Version history</h3>
                    <span class="text-xs text-muted">{{ selectedSkill.versions.length }} version{{ selectedSkill.versions.length === 1 ? '' : 's' }}</span>
                  </div>
                  <div class="divide-y divide-default rounded-lg border border-default">
                    <div v-for="version in selectedSkill.versions" :key="version.id" class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div class="flex min-w-0 items-center gap-3">
                        <span class="font-medium text-highlighted">v{{ version.version }}</span>
                        <div class="min-w-0">
                          <p class="truncate text-sm text-highlighted">{{ version.name }}</p>
                          <p class="text-xs text-muted">{{ version.status }} · {{ formatDate(version.updated_at) }}</p>
                        </div>
                      </div>
                      <div class="flex flex-wrap items-center gap-2">
                        <UBadge :label="version.status" :color="version.status === 'active' ? 'success' : version.status === 'draft' ? 'warning' : 'neutral'" variant="soft" />
                        <UButton size="xs" color="neutral" variant="ghost" :href="`/api/agent-skill-versions/${encodeURIComponent(version.id)}/export`" target="_blank" icon="i-lucide-download" aria-label="Export version" />
                        <UButton v-if="canWrite && version.status === 'draft'" size="xs" color="success" variant="soft" :loading="saving" @click="activate(version.id)">Activate</UButton>
                        <UButton v-if="canWrite && version.status === 'active'" size="xs" color="neutral" variant="soft" :loading="saving" @click="archive(version.id)">Archive</UButton>
                      </div>
                    </div>
                  </div>
                </div>

                <div v-if="draftVersion" class="border-t border-default pt-6">
                  <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 class="font-medium text-highlighted">Edit draft v{{ draftVersion.version }}</h3>
                      <p class="mt-1 text-sm text-muted">Drafts are not used by MCP until explicitly activated.</p>
                    </div>
                    <UButton v-if="canWrite" size="sm" :loading="saving" data-testid="agent-skill-save" @click="saveDraft">Save draft</UButton>
                  </div>
                  <div class="grid gap-4 sm:grid-cols-2">
                    <UFormField label="Name"><UInput v-model="draftForm.name" data-testid="agent-skill-name" :disabled="!canWrite" /></UFormField>
                    <UFormField label="Priority" help="Lower numbers resolve first within a scope."><UInput v-model="draftForm.priority" type="number" min="0" max="1000" :disabled="!canWrite" /></UFormField>
                    <UFormField label="Description" class="sm:col-span-2"><UTextarea v-model="draftForm.description" :rows="3" data-testid="agent-skill-description" :disabled="!canWrite" /></UFormField>
                    <UFormField label="Instructions (Markdown)" class="sm:col-span-2"><UTextarea v-model="draftForm.instructions_markdown" :rows="14" data-testid="agent-skill-instructions" :disabled="!canWrite" /></UFormField>
                  </div>
                </div>
              </div>
            </UCard>

            <UCard v-else>
              <div class="py-12 text-center">
                <UIcon name="i-lucide-sparkles" class="mx-auto size-10 text-dimmed" />
                <p class="mt-3 font-medium text-highlighted">Select a skill to manage its versions</p>
                <p class="mt-1 text-sm text-muted">The resolved MCP stack only includes active versions.</p>
              </div>
            </UCard>

            <UCard v-if="canWrite">
              <template #header>
                <div>
                  <h2 class="font-semibold text-highlighted">Import Markdown</h2>
                  <p class="mt-1 text-sm text-muted">Create a new draft from a Markdown skill document, optionally activating it.</p>
                </div>
              </template>
              <div class="grid gap-4 sm:grid-cols-2">
                <UFormField label="Task"><USelect v-model="importForm.task" :items="taskOptions" data-testid="agent-skill-import-task" /></UFormField>
                <UFormField label="Slug"><UInput v-model="importForm.slug" placeholder="blog-writing" data-testid="agent-skill-import-slug" /></UFormField>
                <UFormField label="Name"><UInput v-model="importForm.name" placeholder="Optional; frontmatter is supported" /></UFormField>
                <UFormField label="Priority"><UInput v-model="importForm.priority" type="number" min="0" max="1000" /></UFormField>
                <UFormField label="Markdown file" class="sm:col-span-2">
                  <input ref="importFile" type="file" accept=".md,.markdown,text/markdown" class="block w-full rounded-md border border-default bg-default px-3 py-2 text-sm text-highlighted file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium" data-testid="agent-skill-import-file" @change="readImportFile" />
                </UFormField>
                <label class="flex items-center gap-2 text-sm text-muted sm:col-span-2">
                  <input v-model="importForm.activate" type="checkbox" class="size-4 rounded border-default text-primary" />
                  Activate after import
                </label>
              </div>
              <template #footer>
                <div class="flex items-center justify-between gap-3">
                  <p class="text-xs text-muted">{{ importForm.markdown ? `${importForm.markdown.length.toLocaleString()} characters ready` : 'Choose a Markdown file to import.' }}</p>
                  <UButton color="neutral" variant="outline" :loading="importing" :disabled="!importForm.slug || !importForm.markdown" data-testid="agent-skill-import" @click="importMarkdown">Import skill</UButton>
                </div>
              </template>
            </UCard>
          </div>
        </div>

        <UCard v-if="creating">
          <template #header>
            <div>
              <h2 class="font-semibold text-highlighted">Create a skill identity</h2>
              <p class="mt-1 text-sm text-muted">A new skill starts as a draft. Activate it after reviewing the instructions.</p>
            </div>
          </template>
          <div class="grid gap-4 sm:grid-cols-2" data-testid="agent-skill-new-form">
            <UFormField label="Task"><USelect v-model="newForm.task" :items="taskOptions" data-testid="agent-skill-new-task" /></UFormField>
            <UFormField label="Slug" help="Lowercase letters, numbers, and single hyphens only."><UInput v-model="newForm.slug" placeholder="blog-writing" data-testid="agent-skill-new-slug" /></UFormField>
            <UFormField label="Name"><UInput v-model="newForm.name" data-testid="agent-skill-new-name" /></UFormField>
            <UFormField label="Priority"><UInput v-model="newForm.priority" type="number" min="0" max="1000" data-testid="agent-skill-new-priority" /></UFormField>
            <UFormField label="Description" class="sm:col-span-2"><UTextarea v-model="newForm.description" :rows="3" data-testid="agent-skill-new-description" /></UFormField>
            <UFormField label="Instructions (Markdown)" class="sm:col-span-2"><UTextarea v-model="newForm.instructions_markdown" :rows="12" data-testid="agent-skill-new-instructions" /></UFormField>
          </div>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton color="neutral" variant="ghost" @click="creating = false">Cancel</UButton>
              <UButton :loading="saving" data-testid="agent-skill-create" @click="createSkill">Create skill</UButton>
            </div>
          </template>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
interface SkillSummary {
  id: string
  scope_type: 'platform' | 'organization' | 'site'
  task: 'blog.write' | 'image.generate'
  slug: string
  active_version_id: string | null
  draft_version_id: string | null
  latest_version: number | null
  active_version: number | null
  priority?: number | null
}

interface SkillVersion {
  id: string
  skill_id: string
  version: number
  name: string
  description: string
  instructions_markdown: string
  priority: number
  status: 'draft' | 'active' | 'archived'
  content_hash: string
  created_at: string
  updated_at: string
  activated_at: string | null
}

interface SkillDetail {
  skill: SkillSummary & { organization_id: string | null; site_id: string | null; created_at: string; updated_at: string }
  versions: SkillVersion[]
}

const props = defineProps<{
  title: string
  description: string
  scopeType: 'platform' | 'organization' | 'site'
  endpoint: string
  organizationId?: string | null
  siteId?: string | null
  canWrite?: boolean
}>()

type AgentSkillsApiOptions = {
  method?: 'POST' | 'PATCH'
  body?: unknown
}

const apiFetch = $fetch as unknown as <T>(_url: string, _options?: AgentSkillsApiOptions) => Promise<T>

const toast = useToast()
const loading = ref(true)
const saving = ref(false)
const creatingVersion = ref(false)
const importing = ref(false)
const loadError = ref<string | null>(null)
const skills = ref<SkillSummary[]>([])
const selectedSkill = ref<SkillDetail | null>(null)
const creating = ref(false)
const importFile = ref<HTMLInputElement | null>(null)

const taskOptions = ['blog.write', 'image.generate']
const newForm = reactive({
  task: 'blog.write' as 'blog.write' | 'image.generate',
  slug: '',
  name: '',
  description: '',
  instructions_markdown: '',
  priority: '100',
})
const importForm = reactive({
  task: 'blog.write' as 'blog.write' | 'image.generate',
  slug: '',
  name: '',
  priority: '100',
  markdown: '',
  activate: false,
})
const draftForm = reactive({ name: '', description: '', instructions_markdown: '', priority: '100' })

const canWrite = computed(() => props.canWrite ?? true)
const scopeLabel = computed(() => props.scopeType === 'platform' ? 'Platform' : props.scopeType === 'organization' ? 'Organization' : 'Site')
const currentVersion = computed(() => selectedSkill.value?.versions[0] ?? null)
const draftVersion = computed(() => selectedSkill.value?.versions.find(version => version.status === 'draft') ?? null)

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: { error?: string } }).data
    if (data?.error) return data.error
  }
  return error instanceof Error ? error.message : fallback
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString()
}

function resetCreateForm() {
  newForm.task = 'blog.write'
  newForm.slug = ''
  newForm.name = ''
  newForm.description = ''
  newForm.instructions_markdown = ''
  newForm.priority = '100'
}

function openCreate() {
  resetCreateForm()
  creating.value = true
}

async function loadSkills() {
  loading.value = true
  loadError.value = null
  try {
    const result = await apiFetch<{ skills: SkillSummary[] }>(props.endpoint)
    skills.value = result.skills
    if (selectedSkill.value) {
      const refreshed = skills.value.find(skill => skill.id === selectedSkill.value?.skill.id)
      if (refreshed) await selectSkill(refreshed.id, false)
      else selectedSkill.value = null
    }
  } catch (error) {
    loadError.value = errorMessage(error, 'Failed to load Agent Skills')
  } finally {
    loading.value = false
  }
}

async function selectSkill(skillId: string, updateUrl = true) {
  try {
    selectedSkill.value = await apiFetch<SkillDetail>(`/api/agent-skills/${encodeURIComponent(skillId)}`)
    const draft = selectedSkill.value.versions.find(version => version.status === 'draft')
    draftForm.name = draft?.name ?? ''
    draftForm.description = draft?.description ?? ''
    draftForm.instructions_markdown = draft?.instructions_markdown ?? ''
    draftForm.priority = String(draft?.priority ?? 100)
    if (updateUrl) await navigateTo({ query: { skill: skillId } }, { replace: true })
  } catch (error) {
    toast.add({ description: errorMessage(error, 'Failed to load skill'), color: 'error' })
  }
}

async function createSkill() {
  saving.value = true
  try {
    const result = await apiFetch<SkillDetail>(props.endpoint, {
      method: 'POST',
      body: { ...newForm, priority: Number(newForm.priority) },
    })
    creating.value = false
    toast.add({ description: 'Agent Skill created as a draft', color: 'success' })
    await loadSkills()
    await selectSkill(result.skill.id)
  } catch (error) {
    toast.add({ description: errorMessage(error, 'Failed to create skill'), color: 'error' })
  } finally {
    saving.value = false
  }
}

async function saveDraft() {
  if (!draftVersion.value) return
  saving.value = true
  try {
    const result = await apiFetch<SkillDetail>(`/api/agent-skill-versions/${encodeURIComponent(draftVersion.value.id)}`, {
      method: 'PATCH',
      body: { ...draftForm, priority: Number(draftForm.priority) },
    })
    selectedSkill.value = result
    await loadSkills()
    toast.add({ description: 'Draft saved', color: 'success' })
  } catch (error) {
    toast.add({ description: errorMessage(error, 'Failed to save draft'), color: 'error' })
  } finally {
    saving.value = false
  }
}

async function createVersion() {
  if (!selectedSkill.value) return
  creatingVersion.value = true
  try {
    selectedSkill.value = await apiFetch<SkillDetail>(`/api/agent-skills/${encodeURIComponent(selectedSkill.value.skill.id)}/versions`, { method: 'POST' })
    const draft = selectedSkill.value.versions.find(version => version.status === 'draft')
    draftForm.name = draft?.name ?? ''
    draftForm.description = draft?.description ?? ''
    draftForm.instructions_markdown = draft?.instructions_markdown ?? ''
    draftForm.priority = String(draft?.priority ?? 100)
    await loadSkills()
    toast.add({ description: 'New draft version created', color: 'success' })
  } catch (error) {
    toast.add({ description: errorMessage(error, 'Failed to create version'), color: 'error' })
  } finally {
    creatingVersion.value = false
  }
}

async function activate(versionId: string) {
  saving.value = true
  try {
    selectedSkill.value = await apiFetch<SkillDetail>(`/api/agent-skill-versions/${encodeURIComponent(versionId)}/activate`, { method: 'POST' })
    await loadSkills()
    toast.add({ description: 'Skill version activated', color: 'success' })
  } catch (error) {
    toast.add({ description: errorMessage(error, 'Failed to activate version'), color: 'error' })
  } finally {
    saving.value = false
  }
}

async function archive(versionId: string) {
  saving.value = true
  try {
    selectedSkill.value = await apiFetch<SkillDetail>(`/api/agent-skill-versions/${encodeURIComponent(versionId)}/archive`, { method: 'POST' })
    await loadSkills()
    toast.add({ description: 'Skill version archived', color: 'success' })
  } catch (error) {
    toast.add({ description: errorMessage(error, 'Failed to archive version'), color: 'error' })
  } finally {
    saving.value = false
  }
}

async function readImportFile() {
  const file = importFile.value?.files?.[0]
  importForm.markdown = file ? await file.text() : ''
  if (file && !importForm.slug) importForm.slug = file.name.replace(/\.(?:markdown|md)$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function importMarkdown() {
  importing.value = true
  try {
    const result = await apiFetch<SkillDetail>('/api/agent-skills/import-markdown', {
      method: 'POST',
      body: {
        scope_type: props.scopeType,
        organization_id: props.organizationId ?? null,
        site_id: props.siteId ?? null,
        task: importForm.task,
        slug: importForm.slug,
        name: importForm.name || null,
        priority: Number(importForm.priority),
        markdown: importForm.markdown,
        activate: importForm.activate,
      },
    })
    importForm.markdown = ''
    importForm.slug = ''
    importForm.name = ''
    if (importFile.value) importFile.value.value = ''
    toast.add({ description: importForm.activate ? 'Skill imported and activated' : 'Skill imported as a draft', color: 'success' })
    await loadSkills()
    await selectSkill(result.skill.id)
  } catch (error) {
    toast.add({ description: errorMessage(error, 'Failed to import skill'), color: 'error' })
  } finally {
    importing.value = false
  }
}

onMounted(async () => {
  await loadSkills()
  const querySkill = useRoute().query.skill
  const skillId = typeof querySkill === 'string' ? querySkill : null
  if (typeof skillId === 'string') await selectSkill(skillId, false)
})
</script>
