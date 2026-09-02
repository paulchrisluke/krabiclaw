import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSocialCardGenerationKey,
  selectSocialCardPlacements,
  type SocialCardPlacedAsset,
} from '../../server/utils/social-card.ts'

const placedAsset = (
  owner_type: string,
  owner_id: string,
  slot: string,
  asset_id: string,
): SocialCardPlacedAsset => ({
  owner_type,
  owner_id,
  slot,
  asset_id,
  public_url: `https://img.example/${asset_id}.png`,
  thumbnail_url: null,
  kind: 'image',
  updated_at: '2026-08-29T00:00:00.000Z',
  generation_key: slot === 'social_card' ? `key-${asset_id}` : null,
  source: slot === 'social_card' ? 'generated' : 'uploaded',
})

test('social card source selection prefers owner media over site fallback media', () => {
  const selected = selectSocialCardPlacements([
    placedAsset('site', 'site-1', 'social_card', 'site-card'),
    placedAsset('business_location', 'location-1', 'social_card', 'owner-card'),
    placedAsset('business_location', 'location-1', 'hero', 'owner-hero'),
    placedAsset('site', 'site-1', 'social_share', 'site-share'),
  ], { owner_type: 'business_location', owner_id: 'location-1' }, 'site-1')
  assert.equal(selected.current?.asset_id, 'owner-card')
  assert.equal(selected.source?.asset_id, 'owner-hero')
})

test('social card generation keys change when a byte-producing source changes', () => {
  const base = {
    logoAssetId: 'logo-1',
    payload: { template: 'saya' as const, title: 'Site', siteName: 'Site', backgroundImageUrl: 'https://img.example/background.png' },
  }
  assert.notEqual(
    buildSocialCardGenerationKey({ ...base, sourceAssetId: 'source-1' }),
    buildSocialCardGenerationKey({ ...base, sourceAssetId: 'source-2' }),
  )
})
