import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canProceedWithTenantPageTransition,
  createTenantPageLocaleRevertGuard,
  createTenantPageRequestGate,
  previewHrefForTenantPage,
} from '../../utils/tenant-page-editor-safety.ts'

test('dirty page transitions require explicit discard confirmation', () => {
  const transitions = ['new', 'select', 'locale', 'route', 'delete', 'publish', 'unpublish', 'archive', 'restore'] as const

  for (const transition of transitions) {
    assert.equal(
      canProceedWithTenantPageTransition(true, () => false),
      false,
      `${transition} must stay blocked when discard is declined`,
    )
    assert.equal(
      canProceedWithTenantPageTransition(true, () => true),
      true,
      `${transition} may continue after explicit discard confirmation`,
    )
  }

  assert.equal(canProceedWithTenantPageTransition(false, () => false), true)
})

test('preview has no navigable href while the editor is dirty', () => {
  assert.equal(previewHrefForTenantPage(true, 'https://preview.example/page'), undefined)
  assert.equal(previewHrefForTenantPage(false, 'https://preview.example/page'), 'https://preview.example/page')
  assert.equal(previewHrefForTenantPage(false, ''), undefined)
})

test('declined locale changes revert once without prompting again', () => {
  const guard = createTenantPageLocaleRevertGuard()
  let locale = 'en'
  const editor = { locale, dirty: true }
  let promptCount = 0
  const transition = (nextLocale: string, previousLocale: string) => {
    if (guard.consume(nextLocale)) return
    const proceed = canProceedWithTenantPageTransition(true, () => {
      promptCount += 1
      return false
    })
    if (!proceed) {
      guard.arm(previousLocale)
      locale = previousLocale
      editor.locale = previousLocale
    }
  }

  transition('th', 'en')
  transition(locale, 'th')

  assert.equal(promptCount, 1)
  assert.equal(locale, 'en')
  assert.equal(editor.locale, 'en')
  assert.equal(editor.dirty, true)

  const superseded = createTenantPageLocaleRevertGuard()
  superseded.arm('en')
  assert.equal(superseded.consume('fr'), false)
  assert.equal(superseded.consume('en'), false)
})

test('a response from an older request cannot become the current editor response', () => {
  const gate = createTenantPageRequestGate()
  const first = gate.begin()
  const second = gate.begin()

  assert.equal(gate.isCurrent(first), false)
  assert.equal(gate.isCurrent(second), true)

  gate.invalidate()
  assert.equal(gate.isCurrent(second), false)
})
