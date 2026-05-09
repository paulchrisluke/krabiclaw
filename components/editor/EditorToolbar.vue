<template>
  <UCard v-if="editMode" class="editor-toolbar fixed top-4 right-4 z-50 min-w-80">
    <!-- Site and Scope Info -->
    <div class="mb-4 pb-4 border-b border-(--ui-border)">
      <div class="text-sm font-medium text-(--ui-text-highlighted) mb-2">
        {{ context?.site?.name }}
      </div>
      <div class="flex items-center justify-between">
        <div class="text-sm text-(--ui-text-muted)">Editing:</div>
        <USelect 
          v-model="selectedScopeId" 
          :items="scopeOptions"
          @update:model-value="handleScopeChange"
          class="w-32"
        />
      </div>
    </div>

    <!-- Draft Status -->
    <div class="mb-4">
      <div class="flex items-center justify-between text-sm">
        <span class="text-(--ui-text-muted)">Draft Status:</span>
        <UBadge :color="hasDrafts ? 'warning' : 'success'" variant="soft" size="sm">
          {{ hasDrafts ? 'Has drafts' : 'No drafts' }}
        </UBadge>
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="space-y-2">
      <!-- Save Draft -->
      <UButton
        @click="saveDraft"
        :disabled="!hasChanges || saving"
        color="neutral"
        size="sm"
        block
        :loading="saving"
      >
        Save Draft
      </UButton>

      <!-- Publish -->
      <UButton
        @click="publishChanges"
        :disabled="!hasDrafts || publishing || !canPublish"
        color="primary"
        size="sm"
        block
        :loading="publishing"
        :title="!canPublish ? 'You do not have permission to publish' : ''"
      >
        Publish Page
      </UButton>

      <!-- Discard -->
      <UButton
        @click="discardChanges"
        :disabled="!hasDrafts || discarding"
        color="neutral"
        size="sm"
        block
        :loading="discarding"
        variant="soft"
      >
        Discard Drafts
      </UButton>
    </div>

    <!-- Exit Edit Mode -->
    <div class="mt-4 pt-4 border-t border-(--ui-border)">
      <UButton
        @click="exitEditMode"
        variant="outline"
        color="neutral"
        size="sm"
        block
      >
        Exit Edit Mode
      </UButton>
    </div>
  </UCard>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute } from '#app'
import { useEditorContext } from '~/composables/useEditorContext'
import { useEditMode } from '~/composables/useEditMode'

const props = defineProps({
  siteId: {
    type: String,
    required: true
  }
})

// Editor context and state
const { context, currentScope, setScope } = useEditorContext(props.siteId)
const { 
  editMode, 
  hasChanges, 
  hasDrafts, 
  saving, 
  publishing, 
  discarding, 
  saveDraft, 
  publishChanges, 
  discardChanges, 
  exitEditMode 
} = useEditMode(props.siteId)

// Scope selection
const selectedScopeId = ref<string | null>(currentScope.value?.id || null)

const scopeOptions = computed(() => 
  context.value?.scopes?.map(scope => ({
    label: scope.label,
    value: scope.id
  })) || []
)

// Check if user can publish (simplified - in real app would check user role)
const canPublish = computed(() => {
  // TODO: Check user permissions from context
  return true
})

// Handle scope change
const handleScopeChange = async () => {
  if (!context.value || !selectedScopeId.value) return

  const newScope = context.value.scopes.find(s => s.id === selectedScopeId.value)
  if (!newScope) return

  // Warn about unsaved changes
  if (hasChanges.value) {
    const confirmed = confirm('You have unsaved changes. Switching scope will discard these changes. Continue?')
    if (!confirmed) {
      // Reset to current scope
      selectedScopeId.value = currentScope.value?.id || null
      return
    }
  }

  // Set new scope
  setScope(newScope)
}

// Sync selected scope with current scope
watch(currentScope, (newScope) => {
  if (newScope) {
    selectedScopeId.value = newScope.id
  }
}, { immediate: true })
</script>

<style scoped>
.editor-toolbar {
  backdrop-filter: blur(8px);
}
</style>
