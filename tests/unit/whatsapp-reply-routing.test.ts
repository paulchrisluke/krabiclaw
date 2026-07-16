import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ASK_CHOWBOT_OR_QUOTE_MESSAGE,
  buildConfirmSendPrompt,
  buildDisambiguationPrompt,
  decideWhatsAppReplyRouting,
  isAffirmativeReply,
  isChowBotDirective,
  maskEmailForDisplay,
  parseNumericSelection,
  stripChowBotPrefix,
  type DisambiguationCandidate,
  type PendingWhatsAppReplyState,
} from '../../server/utils/whatsapp-reply-routing.ts'

// --- Tier 1: quoted operational notification -------------------------------------------------

test('tier 1: an authorized quoted notification starts the confirm-send flow', () => {
  const decision = decideWhatsAppReplyRouting({
    hasQuotedContext: true,
    quotedMatch: 'authorized_thread_found',
    isChowBotDirected: false,
    pendingState: null,
    recentNotificationCount: 0,
    text: 'Yes, confirmed',
  })
  assert.deepEqual(decision, { action: 'start_confirm_send' })
})

test('tier 1: an unmatched/unauthorized quoted notification falls through to later tiers', () => {
  const decision = decideWhatsAppReplyRouting({
    hasQuotedContext: true,
    quotedMatch: 'unmatched',
    isChowBotDirected: false,
    pendingState: null,
    recentNotificationCount: 2,
    text: 'anything',
  })
  assert.deepEqual(decision, { action: 'start_disambiguation' })
})

test('tier 1: an unmatched quoted notification with no recent notifications falls through to tier 4', () => {
  const decision = decideWhatsAppReplyRouting({
    hasQuotedContext: true,
    quotedMatch: 'unmatched',
    isChowBotDirected: false,
    pendingState: null,
    recentNotificationCount: 0,
    text: 'anything',
  })
  assert.deepEqual(decision, { action: 'ask_chowbot_or_quote' })
})

// --- Tier 2: explicit ChowBot directive -------------------------------------------------------

test('tier 2: an explicit ChowBot prefix routes to chowbot ahead of pending notifications', () => {
  const decision = decideWhatsAppReplyRouting({
    hasQuotedContext: false,
    quotedMatch: null,
    isChowBotDirected: true,
    pendingState: null,
    recentNotificationCount: 3,
    text: 'ChowBot: how many covers tonight?',
  })
  assert.deepEqual(decision, { action: 'chowbot' })
})

test('isChowBotDirective recognizes the prefix case-insensitively, with or without a colon', () => {
  assert.equal(isChowBotDirective('ChowBot: hello'), true)
  assert.equal(isChowBotDirective('chowbot hello'), true)
  assert.equal(isChowBotDirective('CHOWBOT'), true)
  assert.equal(isChowBotDirective('  chowbot  '), true)
  assert.equal(isChowBotDirective('not chowbot related'), false)
})

test('stripChowBotPrefix removes only the directive, leaving the message intact', () => {
  assert.equal(stripChowBotPrefix('ChowBot: how many covers tonight?'), 'how many covers tonight?')
  assert.equal(stripChowBotPrefix('chowbot'), '')
  assert.equal(stripChowBotPrefix('ChowBot   help me'), 'help me')
})

// --- Tier 3: unquoted text with recent guest notifications ------------------------------------

test('tier 3: unquoted text with recent notifications starts disambiguation', () => {
  const decision = decideWhatsAppReplyRouting({
    hasQuotedContext: false,
    quotedMatch: null,
    isChowBotDirected: false,
    pendingState: null,
    recentNotificationCount: 2,
    text: 'tell the guest we are running late',
  })
  assert.deepEqual(decision, { action: 'start_disambiguation' })
})

// --- Tier 4: no relevant guest context ---------------------------------------------------------

test('tier 4: unquoted text with no recent notifications never silently assumes ChowBot', () => {
  const decision = decideWhatsAppReplyRouting({
    hasQuotedContext: false,
    quotedMatch: null,
    isChowBotDirected: false,
    pendingState: null,
    recentNotificationCount: 0,
    text: 'hello',
  })
  assert.deepEqual(decision, { action: 'ask_chowbot_or_quote' })
})

// --- Pending state resume paths -----------------------------------------------------------------

test('pending confirm_send: an affirmative reply executes the send', () => {
  const pendingState: PendingWhatsAppReplyState = {
    kind: 'confirm_send',
    threadId: 't1',
    siteId: 's1',
    organizationId: 'o1',
    replyBody: 'Yes, confirmed',
    guestEmailMasked: 'j***@example.com',
  }
  for (const affirmative of ['yes', 'YES', 'Yes!', 'confirm', 'send', 'ok', 'sure']) {
    const decision = decideWhatsAppReplyRouting({
      hasQuotedContext: false,
      quotedMatch: null,
      isChowBotDirected: false,
      pendingState,
      recentNotificationCount: 0,
      text: affirmative,
    })
    assert.deepEqual(decision, { action: 'confirm_send_execute' }, `expected "${affirmative}" to confirm`)
  }
})

test('pending confirm_send: a non-affirmative reply cancels and redispatches rather than sending', () => {
  const pendingState: PendingWhatsAppReplyState = {
    kind: 'confirm_send',
    threadId: 't1',
    siteId: 's1',
    organizationId: 'o1',
    replyBody: 'Yes, confirmed',
    guestEmailMasked: 'j***@example.com',
  }
  for (const text of ['no', 'wait', 'actually change the time', 'yes but change the date to Friday instead']) {
    const decision = decideWhatsAppReplyRouting({
      hasQuotedContext: false,
      quotedMatch: null,
      isChowBotDirected: false,
      pendingState,
      recentNotificationCount: 0,
      text,
    })
    assert.deepEqual(decision, { action: 'confirm_send_cancel_and_redispatch' }, `expected "${text}" not to confirm`)
  }
})

test('pending disambiguate: a valid numeric pick selects that candidate', () => {
  const candidates: DisambiguationCandidate[] = [
    { threadId: 't1', siteId: 's1', organizationId: 'o1', locationId: null, label: 'Reservation from Jane' },
    { threadId: 't2', siteId: 's1', organizationId: 'o1', locationId: null, label: 'Contact from Mike' },
  ]
  const pendingState: PendingWhatsAppReplyState = { kind: 'disambiguate', candidates }
  const decision = decideWhatsAppReplyRouting({
    hasQuotedContext: false,
    quotedMatch: null,
    isChowBotDirected: false,
    pendingState,
    recentNotificationCount: 0,
    text: '2',
  })
  assert.deepEqual(decision, { action: 'disambiguation_pick', index: 2 })
})

test('pending disambiguate: an out-of-range or non-numeric reply cancels and redispatches', () => {
  const candidates: DisambiguationCandidate[] = [
    { threadId: 't1', siteId: 's1', organizationId: 'o1', locationId: null, label: 'Reservation from Jane' },
  ]
  const pendingState: PendingWhatsAppReplyState = { kind: 'disambiguate', candidates }
  for (const text of ['0', '5', 'ChowBot', 'hello']) {
    const decision = decideWhatsAppReplyRouting({
      hasQuotedContext: false,
      quotedMatch: null,
      isChowBotDirected: false,
      pendingState,
      recentNotificationCount: 0,
      text,
    })
    assert.deepEqual(decision, { action: 'disambiguation_cancel_and_redispatch' }, `expected "${text}" not to be a valid pick`)
  }
})

test('pending collect_reply: any text becomes the reply body and moves to confirm_send', () => {
  const pendingState: PendingWhatsAppReplyState = {
    kind: 'collect_reply',
    threadId: 't1',
    siteId: 's1',
    organizationId: 'o1',
    guestEmailMasked: 'j***@example.com',
  }
  const decision = decideWhatsAppReplyRouting({
    hasQuotedContext: false,
    quotedMatch: null,
    isChowBotDirected: false,
    pendingState,
    recentNotificationCount: 0,
    text: 'We are running 10 minutes late.',
  })
  assert.deepEqual(decision, { action: 'collect_reply_body' })
})

// --- Small pure helpers --------------------------------------------------------------------------

test('isAffirmativeReply is bounded to short, recognized tokens', () => {
  assert.equal(isAffirmativeReply('yes'), true)
  assert.equal(isAffirmativeReply('Yes, confirmed'), true)
  assert.equal(isAffirmativeReply('send it'), true)
  assert.equal(isAffirmativeReply(''), false)
  assert.equal(isAffirmativeReply('no'), false)
  assert.equal(isAffirmativeReply('yes but actually let us change the reservation date to Friday'), false)
})

test('parseNumericSelection rejects anything outside a bare in-range integer', () => {
  assert.equal(parseNumericSelection('1', 3), 1)
  assert.equal(parseNumericSelection('3', 3), 3)
  assert.equal(parseNumericSelection('0', 3), null)
  assert.equal(parseNumericSelection('4', 3), null)
  assert.equal(parseNumericSelection('1.5', 3), null)
  assert.equal(parseNumericSelection('one', 3), null)
  assert.equal(parseNumericSelection(' 2 ', 3), 2)
})

test('maskEmailForDisplay never exposes the full local part', () => {
  assert.equal(maskEmailForDisplay('jane@example.com'), 'j***@example.com')
  assert.equal(maskEmailForDisplay('a@example.com'), 'a***@example.com')
  assert.equal(maskEmailForDisplay('not-an-email'), 'not-an-email')
})

test('buildDisambiguationPrompt numbers candidates in order and offers the ChowBot escape hatch', () => {
  const candidates: DisambiguationCandidate[] = [
    { threadId: 't1', siteId: 's1', organizationId: 'o1', locationId: null, label: 'Reservation from Jane' },
    { threadId: 't2', siteId: 's1', organizationId: 'o1', locationId: null, label: 'Contact from Mike' },
  ]
  const prompt = buildDisambiguationPrompt(candidates)
  assert.match(prompt, /1\. Reservation from Jane/)
  assert.match(prompt, /2\. Contact from Mike/)
  assert.match(prompt, /ChowBot/)
})

test('buildConfirmSendPrompt always names email, never WhatsApp, as the guest delivery channel', () => {
  const prompt = buildConfirmSendPrompt('j***@example.com')
  assert.match(prompt, /emailed to j\*\*\*@example\.com/)
  assert.doesNotMatch(prompt.toLowerCase(), /whatsapp/)
})

test('the tier-4 fallback message never claims ChowBot will be used automatically', () => {
  assert.match(ASK_CHOWBOT_OR_QUOTE_MESSAGE, /ChowBot/)
  assert.doesNotMatch(ASK_CHOWBOT_OR_QUOTE_MESSAGE, /\bwill\b/i)
})
