import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isEditableMediaPlacement,
  isSupportedMediaPlacement,
} from '../../shared/media-placement-contract.ts'
import { resolveSocialImageFromMedia } from '../../utils/social-metadata.ts'
import {
  buildSocialCardGenerationKey,
  selectSocialCardPlacements,
  type SocialCardPlacedAsset,
} from '../../server/utils/social-card.ts'

const media = (slot: string, url: string) => ({
  slot,
  kind: 'image',
  public_url: url,
  thumbnail_url: null,
})

test('social cards are supported for persisted owners but cannot be edited through generic media APIs', () => {
  for (const owner_type of [
    'site',
    'business_location',
    'product',
    'post',
    'blog_post',
    'experience',
    'offering',
    'platform_doc',
    'review',
    'tenant_page',
  ]) {
    assert.equal(isSupportedMediaPlacement({ owner_type, slot: 'social_card' }), true)
    assert.equal(isEditableMediaPlacement({ owner_type, slot: 'social_card' }), false)
  }
  assert.equal(isEditableMediaPlacement({ owner_type: 'site', slot: 'social_share' }), true)
})

test('metadata prefers the owner card, then the site card, social share, and logo', () => {
  const siteMedia = [
    media('logo', 'https://img.example/logo.png'),
    media('social_share', 'https://img.example/share.png'),
    media('social_card', 'https://img.example/site-card.png'),
  ]

  assert.equal(resolveSocialImageFromMedia([
    media('social_card', 'https://img.example/owner-card.png'),
  ], siteMedia)?.url, 'https://img.example/owner-card.png')
  assert.equal(resolveSocialImageFromMedia([], siteMedia)?.url, 'https://img.example/site-card.png')
  assert.equal(resolveSocialImageFromMedia([], siteMedia.filter(item => item.slot !== 'social_card'))?.url, 'https://img.example/share.png')
  assert.equal(resolveSocialImageFromMedia([], siteMedia.filter(item => item.slot === 'logo'))?.url, 'https://img.example/logo.png')
})

test('metadata uses a video thumbnail and omits unsupported media', () => {
  assert.equal(resolveSocialImageFromMedia([], [{
    slot: 'social_share',
    kind: 'video',
    public_url: 'https://img.example/video.mp4',
    thumbnail_url: 'https://img.example/poster.png',
  }])?.url, 'https://img.example/poster.png')
  assert.equal(resolveSocialImageFromMedia([], [{
    slot: 'logo',
    kind: 'file',
    public_url: 'https://img.example/file.pdf',
    thumbnail_url: null,
  }]), null)
})

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

test('write-time selection keeps owner and site cards separate', () => {
  const owner = { owner_type: 'business_location' as const, owner_id: 'location-1' }
  const selected = selectSocialCardPlacements([
    placedAsset('site', 'site-1', 'social_card', 'site-card'),
    placedAsset('business_location', 'location-1', 'social_card', 'owner-card'),
    placedAsset('business_location', 'location-1', 'hero', 'owner-hero'),
    placedAsset('site', 'site-1', 'social_share', 'site-share'),
  ], owner, 'site-1')

  assert.equal(selected.current?.asset_id, 'owner-card')
  assert.equal(selected.ownerSource?.asset_id, 'owner-hero')
  assert.equal(selected.source?.asset_id, 'owner-hero')

  const siteSelected = selectSocialCardPlacements([
    placedAsset('site', 'site-1', 'social_card', 'site-card'),
    placedAsset('business_location', 'location-1', 'social_card', 'owner-card'),
    placedAsset('site', 'site-1', 'social_share', 'site-share'),
  ], { owner_type: 'site', owner_id: 'site-1' }, 'site-1')
  assert.equal(siteSelected.current?.asset_id, 'site-card')
  assert.equal(siteSelected.source?.asset_id, 'site-share')
})

test('the generation key includes source asset identity', () => {
  const base = {
    owner: { owner_type: 'site' as const, owner_id: 'site-1' },
    ownerUpdatedAt: '2026-08-29T00:00:00.000Z',
    siteUpdatedAt: '2026-08-29T00:00:00.000Z',
    sourceUpdatedAt: '2026-08-29T00:00:00.000Z',
    logoAssetId: 'logo-1',
    faviconAssetId: null,
    payload: { template: 'saya' as const, title: 'Site', siteName: 'Site' },
  }
  assert.notEqual(
    buildSocialCardGenerationKey({ ...base, sourceAssetId: 'source-1' }),
    buildSocialCardGenerationKey({ ...base, sourceAssetId: 'source-2' }),
  )
})
