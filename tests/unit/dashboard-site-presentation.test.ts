import assert from 'node:assert/strict'
import test from 'node:test'
import { getDashboardSiteStatus } from '../../utils/dashboard-site-presentation.ts'

test('presents a fully active site as published', () => {
  assert.deepEqual(getDashboardSiteStatus({ status: 'active', onboarding_status: 'active' }), {
    label: 'Published',
    color: 'success',
    icon: 'i-lucide-circle-check',
  })
})

test('presents every other site state as setup incomplete', () => {
  for (const site of [
    { status: 'draft', onboarding_status: 'active' },
    { status: 'active', onboarding_status: 'pending' },
    { status: 'disabled', onboarding_status: 'incomplete' },
    { status: null, onboarding_status: null },
  ]) {
    assert.deepEqual(getDashboardSiteStatus(site), {
      label: 'Setup incomplete',
      color: 'warning',
      icon: 'i-lucide-circle-dashed',
    })
  }
})
