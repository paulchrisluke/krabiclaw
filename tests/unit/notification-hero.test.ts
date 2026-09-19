import assert from 'node:assert/strict'
import test from 'node:test'

import { notificationHeroImageUrl } from '../../server/notifications/hero.ts'

test('notification hero uses a video thumbnail instead of the video URL', () => {
  assert.equal(notificationHeroImageUrl({
    kind: 'video',
    public_url: 'https://media.example.test/sites/site/media/hero.mp4',
    thumbnail_url: 'https://images.example.test/hero-thumbnail.jpg',
  }), 'https://images.example.test/hero-thumbnail.jpg')
})

test('notification hero keeps the public URL for images', () => {
  assert.equal(notificationHeroImageUrl({
    kind: 'image',
    public_url: 'https://images.example.test/hero.jpg',
    thumbnail_url: 'https://images.example.test/hero-thumbnail.jpg',
  }), 'https://images.example.test/hero.jpg')
})

test('notification hero does not pass non-image files to an img element', () => {
  assert.equal(notificationHeroImageUrl({
    kind: 'file',
    public_url: 'https://media.example.test/menu.pdf',
    thumbnail_url: null,
  }), null)
})
