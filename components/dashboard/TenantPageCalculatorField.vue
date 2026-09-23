<template>
  <div class="space-y-3">
    <UFormField label="Note">
      <UInput :model-value="calculatorNote" size="xl" class="w-full" @update:model-value="setCalculatorNote($event)" />
    </UFormField>
    <div class="grid gap-2 text-xs text-muted lg:grid-cols-4">
      <span>Household size</span><span>250% limit</span><span>350% limit</span><span>400% limit</span>
    </div>
    <div v-for="(row, rowIndex) in calculatorRows" :key="rowIndex" class="grid gap-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
      <UInput :model-value="cellValue(row, 0)" type="number" min="1" max="8" aria-label="Household size" @update:model-value="setCalculatorCell(rowIndex, 0, $event)" />
      <UInput :model-value="cellValue(row, 1)" type="number" aria-label="250 percent limit" placeholder="250%" @update:model-value="setCalculatorCell(rowIndex, 1, $event)" />
      <UInput :model-value="cellValue(row, 2)" type="number" aria-label="350 percent limit" placeholder="350%" @update:model-value="setCalculatorCell(rowIndex, 2, $event)" />
      <UInput :model-value="cellValue(row, 3)" type="number" aria-label="400 percent limit" placeholder="400%" @update:model-value="setCalculatorCell(rowIndex, 3, $event)" />
      <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" square aria-label="Remove calculator row" @click="removeCalculatorRow(rowIndex)" />
    </div>
    <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="sm" @click="addCalculatorRow">Add row</UButton>
  </div>
</template>

<script setup lang="ts">
import { useTenantPageBlock } from '~/composables/useTenantPageDraft'

/** The income table a pricing calculator reads, which is a grid and not a field. */
const props = defineProps<{ organizationId: string; pageId: string; blockId: string }>()
const block = useTenantPageBlock(props.organizationId, props.pageId, () => props.blockId)

function calculatorConfig(): Record<string, unknown> {
  const value = block.value.data.calculator
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

const calculatorRows = computed(() => {
  const rows = calculatorConfig().rows
  return Array.isArray(rows) ? rows.filter((row): row is unknown[] => Array.isArray(row)).map(row => [...row]) : []
})
const calculatorNote = computed(() => String(calculatorConfig().note ?? ''))

function setCalculator(rows: unknown[][], note = calculatorNote.value) {
  block.value.data.calculator = { ...calculatorConfig(), note, rows }
}

function setCalculatorNote(value: unknown) {
  setCalculator(calculatorRows.value, String(value ?? ''))
}

function cellValue(row: unknown[], index: number): string {
  return row[index] == null ? '' : String(row[index])
}

function setCalculatorCell(rowIndex: number, cellIndex: number, value: unknown) {
  const rows = calculatorRows.value
  const row = rows[rowIndex] ?? []
  while (row.length <= cellIndex) row.push('')
  row[cellIndex] = value == null ? '' : String(value)
  rows[rowIndex] = row
  setCalculator(rows)
}

function addCalculatorRow() {
  setCalculator([...calculatorRows.value, [calculatorRows.value.length + 1, '', '', '']])
}

function removeCalculatorRow(index: number) {
  setCalculator(calculatorRows.value.filter((_, rowIndex) => rowIndex !== index))
}

// ── Gallery ─────────────────────────────────────────────
// `content_block:gallery` is an ordered collection: once this block is
// persisted its membership only ever changes through the generic
// attach/remove/reorder routes, never a local array mutation bundled into the
// page's own save. Before that there is nothing to attach to, so edits stay
// local until the first save creates the row.
</script>
