import assert from 'node:assert/strict'
import test from 'node:test'
import {
  composeRobotsDirective,
  DEFAULT_ROBOTS_INTENT,
  isIndexableRobotsIntent,
  NON_INDEXABLE_ROBOTS_INTENT,
  normalizeRobotsIntent,
  parseRobotsIntent,
  ROBOTS_DISABLED_DIRECTIVE,
  ROBOTS_ENABLED_DIRECTIVE,
  ROBOTS_INTENTS,
} from '../../shared/robots-directive.ts'
import { composeSocialMetadata } from '../../utils/social-metadata.ts'

test('a stored robots value canonicalizes to one of four intents', () => {
  for (const intent of ROBOTS_INTENTS) {
    assert.equal(normalizeRobotsIntent(intent), intent)
  }
  // The legacy free-text spellings that production rows still hold.
  assert.equal(normalizeRobotsIntent('index, follow'), 'index,follow')
  assert.equal(normalizeRobotsIntent('INDEX, FOLLOW'), 'index,follow')
  assert.equal(normalizeRobotsIntent('noindex, nofollow'), 'noindex,nofollow')
  assert.equal(normalizeRobotsIntent('follow, index'), 'index,follow')
  // A half-stated intent names the other half by default.
  assert.equal(normalizeRobotsIntent('noindex'), 'noindex,follow')
  assert.equal(normalizeRobotsIntent('nofollow'), 'index,nofollow')
  // Unset is unset, never a directive.
  for (const empty of [null, undefined, '', '   ']) {
    assert.equal(normalizeRobotsIntent(empty), null)
  }
  for (const unsupported of ['none', 'index, follow, max-image-preview:large', 'noarchive', 'index,index', 42]) {
    assert.equal(parseRobotsIntent(unsupported).ok, false)
    assert.throws(() => normalizeRobotsIntent(unsupported), /robots must be one of/)
  }
})

test('the served directive is derived from the intent, with previews only where a preview can exist', () => {
  assert.equal(
    composeRobotsDirective('index,follow'),
    'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
  )
  assert.equal(
    composeRobotsDirective('index,nofollow'),
    'index, nofollow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
  )
  assert.equal(composeRobotsDirective('noindex,follow'), 'noindex, follow')
  assert.equal(composeRobotsDirective('noindex,nofollow'), 'noindex, nofollow')
  // An unset intent serves the default, so a CMS page with no stored value and a
  // hardcoded page emit the same string.
  assert.equal(composeRobotsDirective(null), composeRobotsDirective(DEFAULT_ROBOTS_INTENT))
  assert.equal(composeRobotsDirective(undefined), ROBOTS_ENABLED_DIRECTIVE)
  assert.equal(composeRobotsDirective(NON_INDEXABLE_ROBOTS_INTENT), ROBOTS_DISABLED_DIRECTIVE)
  assert.equal(isIndexableRobotsIntent(null), true)
  assert.equal(isIndexableRobotsIntent('index,nofollow'), true)
  assert.equal(isIndexableRobotsIntent('noindex,follow'), false)
})

test('every composed page carries the derived robots directive', () => {
  const base = {
    template: 'platform' as const,
    title: 'Pricing',
    canonicalUrl: 'https://krabiclaw.com/pricing',
    brand: { siteName: 'KrabiClaw' },
  }
  assert.equal(composeSocialMetadata(base, null).robots, ROBOTS_ENABLED_DIRECTIVE)
  assert.equal(composeSocialMetadata({ ...base, robots: null }, null).robots, ROBOTS_ENABLED_DIRECTIVE)
  assert.equal(
    composeSocialMetadata({ ...base, robots: 'noindex,nofollow' }, null).robots,
    ROBOTS_DISABLED_DIRECTIVE,
  )
  assert.equal(
    composeSocialMetadata({ ...base, robots: 'noindex,follow' }, null).robots,
    'noindex, follow',
  )
})
