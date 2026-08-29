import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

type StoredAsset = {
  id: string
  site_id: string
  kind: 'video'
  provider: 'cloudflare_r2'
  cloudflare_image_id: string | null
  r2_key: string | null
  thumbnail_url: string | null
  organization_id: string
  location_id: string | null
  created_by_user_id: string | null
  status: 'active' | 'deleted'
}

type StorageReference = Pick<StoredAsset, 'id' | 'cloudflare_image_id' | 'r2_key' | 'status'>

const baseAsset: StoredAsset = {
  id: 'asset-video',
  site_id: 'site-1',
  kind: 'video',
  provider: 'cloudflare_r2',
  cloudflare_image_id: 'poster-image',
  r2_key: 'sites/site-1/media/asset-video.mp4',
  thumbnail_url: 'https://imagedelivery.test/account/poster-image/public',
  organization_id: 'org-1',
  location_id: null,
  created_by_user_id: 'user-1',
  status: 'active',
}

const state: {
  asset: StoredAsset | null
  otherAssets: StorageReference[]
  imageDeletes: string[]
  r2Deletes: string[]
  updates: string[]
  events: number
  imageErrors: Map<string, Error>
  r2Error: Error | null
  referenceResultOverride: Record<string, unknown> | null
  executeChanges: number
  executeError: Error | null
  uploadedImage: { imageId: string; publicUrl: string; thumbnailUrl: string }
} = {
  asset: { ...baseAsset },
  otherAssets: [],
  imageDeletes: [],
  r2Deletes: [],
  updates: [],
  events: 0,
  imageErrors: new Map(),
  r2Error: null,
  referenceResultOverride: null,
  executeChanges: 1,
  executeError: null,
  uploadedImage: {
    imageId: 'poster-new',
    publicUrl: 'https://imagedelivery.test/account/poster-new/public',
    thumbnailUrl: 'https://imagedelivery.test/account/poster-new/thumbnail',
  },
}

mock.module('../../server/db/index.ts', {
  namedExports: {
    execute: async (_db: unknown, query: string, params: unknown[]) => {
      state.updates.push(query)
      if (state.executeError) throw state.executeError

      if (state.executeChanges === 1 && state.asset) {
        if (/SET cloudflare_image_id = \?/.test(query)) {
          state.asset.cloudflare_image_id = String(params[0])
          state.asset.thumbnail_url = String(params[1])
        } else if (/SET status = 'deleted'/.test(query)) {
          state.asset.status = 'deleted'
        }
      }

      return { meta: { changes: state.executeChanges } }
    },
    executeBatch: async (_db: unknown, statements: Array<{ query: string; params: unknown[] }>) => statements.map(({ query, params }) => {
      if (/UPDATE media_assets SET status = 'deleted'/.test(query)) {
        state.updates.push(query)
        if (state.executeChanges === 1 && state.asset) state.asset.status = 'deleted'
        return { meta: { changes: state.executeChanges } }
      }
      assert.match(query, /DELETE FROM media_placements/)
      assert.deepEqual(params, ['site-1', state.asset?.id ?? 'asset-video'])
      return { meta: { changes: 0 } }
    }),
    queryAll: async () => [],
    queryFirst: async (_db: unknown, query: string, params: unknown[]) => {
      if (/AS r2_referenced_elsewhere/.test(query)) {
        if (state.referenceResultOverride) return state.referenceResultOverride

        const r2Key = params[0] as string | null
        const assetId = String(params[1])
        const imageId = params[3] as string | null
        const liveOtherAssets = state.otherAssets.filter(asset => asset.id !== assetId && asset.status !== 'deleted')
        return {
          r2_referenced_elsewhere: r2Key && liveOtherAssets.some(asset => asset.r2_key === r2Key) ? 1 : 0,
          cloudflare_image_referenced_elsewhere: imageId && liveOtherAssets.some(asset => asset.cloudflare_image_id === imageId) ? 1 : 0,
        }
      }

      assert.match(query, /SELECT[\s\S]*cloudflare_image_id/)
      if (!state.asset || state.asset.status === 'deleted') return null
      return { ...state.asset }
    },
  },
})

mock.module('../../server/utils/cloudflare-images.ts', {
  namedExports: {
    deleteImage: async (_env: unknown, imageId: string) => {
      state.imageDeletes.push(imageId)
      const error = state.imageErrors.get(imageId)
      if (error) throw error
    },
    uploadImageBuffer: async () => state.uploadedImage,
  },
})

mock.module('../../server/utils/cloudflare-r2.ts', {
  namedExports: {
    deleteFromR2: async (_env: unknown, key: string) => {
      state.r2Deletes.push(key)
      if (state.r2Error) throw state.r2Error
    },
  },
})

mock.module('../../server/utils/organization-events.ts', {
  namedExports: {
    fireOrganizationEventSafe: async () => {
      state.events += 1
    },
  },
})

const { deleteMediaAsset } = await import('../../server/utils/media-asset-manager.ts')

function reset() {
  state.asset = { ...baseAsset }
  state.otherAssets = []
  state.imageDeletes = []
  state.r2Deletes = []
  state.updates = []
  state.events = 0
  state.imageErrors = new Map()
  state.r2Error = null
  state.referenceResultOverride = null
  state.executeChanges = 1
  state.executeError = null
}

const env = {
  CLOUDFLARE_IMAGES_VARIANT_BASE: 'https://imagedelivery.test/account',
}

test('video deletion removes its unshared R2 object and Cloudflare Images poster once', async () => {
  reset()
  await deleteMediaAsset({} as never, env, 'asset-video', 'site-1', 'user-1')

  assert.deepEqual(state.r2Deletes, ['sites/site-1/media/asset-video.mp4'])
  assert.deepEqual(state.imageDeletes, ['poster-image'])
  assert.equal(state.updates.length, 1)
  assert.match(state.updates[0]!, /SET status = 'deleted'/)
  assert.equal(state.events, 1)
})

test('video deletion rejects a missing asset instead of reporting success', async () => {
  reset()
  state.asset = null

  await assert.rejects(
    () => deleteMediaAsset({} as never, env, 'missing-asset', 'site-1', 'user-1'),
    /Media asset not found/,
  )

  assert.deepEqual(state.r2Deletes, [])
  assert.deepEqual(state.imageDeletes, [])
  assert.equal(state.updates.length, 0)
})

test('video deletion preserves storage objects referenced by another non-deleted asset', async () => {
  reset()
  state.otherAssets = [{
    id: 'asset-copy',
    r2_key: baseAsset.r2_key,
    cloudflare_image_id: baseAsset.cloudflare_image_id,
    status: 'active',
  }]

  await deleteMediaAsset({} as never, env, 'asset-video', 'site-1', 'user-1')

  assert.deepEqual(state.r2Deletes, [])
  assert.deepEqual(state.imageDeletes, [])
  assert.equal(state.updates.length, 1)
  assert.equal(state.events, 1)
})

test('provider deletion occurs when the final non-deleted storage reference is removed', async () => {
  reset()
  state.otherAssets = [{
    id: 'asset-copy',
    r2_key: baseAsset.r2_key,
    cloudflare_image_id: baseAsset.cloudflare_image_id,
    status: 'active',
  }]

  await deleteMediaAsset({} as never, env, 'asset-video', 'site-1', 'user-1')
  assert.deepEqual(state.r2Deletes, [])
  assert.deepEqual(state.imageDeletes, [])

  state.asset = {
    ...baseAsset,
    id: 'asset-copy',
    location_id: 'location-copy',
  }
  state.otherAssets = [{
    id: 'asset-video',
    r2_key: baseAsset.r2_key,
    cloudflare_image_id: baseAsset.cloudflare_image_id,
    status: 'deleted',
  }]

  await deleteMediaAsset({} as never, env, 'asset-copy', 'site-1', 'user-1')

  assert.deepEqual(state.r2Deletes, ['sites/site-1/media/asset-video.mp4'])
  assert.deepEqual(state.imageDeletes, ['poster-image'])
  assert.equal(state.updates.length, 2)
  assert.equal(state.events, 2)
})

test('video deletion ignores storage references held only by deleted assets', async () => {
  reset()
  state.otherAssets = [{
    id: 'asset-copy',
    r2_key: baseAsset.r2_key,
    cloudflare_image_id: baseAsset.cloudflare_image_id,
    status: 'deleted',
  }]

  await deleteMediaAsset({} as never, env, 'asset-video', 'site-1', 'user-1')

  assert.deepEqual(state.r2Deletes, ['sites/site-1/media/asset-video.mp4'])
  assert.deepEqual(state.imageDeletes, ['poster-image'])
})

test('video deletion reports every provider failure without another attempt or marking the asset deleted', async () => {
  reset()
  state.r2Error = new Error('R2 unavailable')
  state.imageErrors.set('poster-image', new Error('Images unavailable'))

  await assert.rejects(
    () => deleteMediaAsset({} as never, env, 'asset-video', 'site-1', 'user-1'),
    /R2 object sites\/site-1\/media\/asset-video\.mp4: R2 unavailable; Cloudflare image poster-image: Images unavailable/,
  )

  assert.equal(state.r2Deletes.length, 1)
  assert.equal(state.imageDeletes.length, 1)
  assert.equal(state.updates.length, 0)
  assert.equal(state.events, 0)
})

test('a later delete call converges after one provider failed', async () => {
  reset()
  state.imageErrors.set('poster-image', new Error('Images unavailable'))

  await assert.rejects(
    () => deleteMediaAsset({} as never, env, 'asset-video', 'site-1', 'user-1'),
    /Cloudflare image poster-image: Images unavailable/,
  )
  assert.equal(state.updates.length, 0)

  state.imageErrors.delete('poster-image')
  await deleteMediaAsset({} as never, env, 'asset-video', 'site-1', 'user-1')

  assert.equal(state.r2Deletes.length, 2)
  assert.equal(state.imageDeletes.length, 2)
  assert.equal(state.updates.length, 1)
  assert.equal(state.events, 1)
})

test('an invalid storage-reference result blocks provider and database deletion', async () => {
  reset()
  state.referenceResultOverride = {
    r2_referenced_elsewhere: null,
    cloudflare_image_referenced_elsewhere: 0,
  }

  await assert.rejects(
    () => deleteMediaAsset({} as never, env, 'asset-video', 'site-1', 'user-1'),
    /Invalid R2 reference-check result/,
  )

  assert.deepEqual(state.r2Deletes, [])
  assert.deepEqual(state.imageDeletes, [])
  assert.equal(state.updates.length, 0)
})
