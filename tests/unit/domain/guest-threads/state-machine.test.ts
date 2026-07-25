import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isUnreadForMember, nextConversationState } from '../../../../server/domain/guest-threads/state-machine.ts'

test('new submission always starts needs_attention', () => {
  assert.equal(nextConversationState('resolved', { type: 'new_submission' }), 'needs_attention')
  assert.equal(nextConversationState('needs_attention', { type: 'new_submission' }), 'needs_attention')
})

test('inbound guest message moves to needs_attention from any state, including resolved (auto-reopen)', () => {
  for (const state of ['needs_attention', 'waiting_on_guest', 'resolved'] as const) {
    assert.equal(nextConversationState(state, { type: 'inbound_guest_message' }), 'needs_attention')
  }
})

test('successful owner freeform reply moves to waiting_on_guest', () => {
  assert.equal(nextConversationState('needs_attention', { type: 'owner_reply_sent' }), 'waiting_on_guest')
  assert.equal(nextConversationState('resolved', { type: 'owner_reply_sent' }), 'waiting_on_guest')
})

test('manual resolve/reopen are deterministic regardless of current state', () => {
  assert.equal(nextConversationState('needs_attention', { type: 'manual_resolve' }), 'resolved')
  assert.equal(nextConversationState('waiting_on_guest', { type: 'manual_resolve' }), 'resolved')
  assert.equal(nextConversationState('resolved', { type: 'manual_reopen' }), 'needs_attention')
})

test('operation success with no notification required or successfully sent resolves the thread', () => {
  assert.equal(nextConversationState('needs_attention', { type: 'operation_succeeded', notificationOutcome: 'not_required' }), 'resolved')
  assert.equal(nextConversationState('needs_attention', { type: 'operation_succeeded', notificationOutcome: 'sent' }), 'resolved')
})

test('operation success but failed/no-channel notification keeps needs_attention, never waiting_on_guest', () => {
  assert.equal(nextConversationState('needs_attention', { type: 'operation_succeeded', notificationOutcome: 'failed' }), 'needs_attention')
})

test('automated operational transitions never produce waiting_on_guest', () => {
  const outcomes: Array<'not_required' | 'sent' | 'failed'> = ['not_required', 'sent', 'failed']
  for (const notificationOutcome of outcomes) {
    const result = nextConversationState('waiting_on_guest', { type: 'operation_succeeded', notificationOutcome })
    assert.notEqual(result, 'waiting_on_guest')
  }
})

test('isUnreadForMember treats the acting member as having already read their own message', () => {
  assert.equal(isUnreadForMember('member-a', 'member-a'), false)
  assert.equal(isUnreadForMember('member-a', 'member-b'), true)
  assert.equal(isUnreadForMember(null, 'member-b'), true)
})
