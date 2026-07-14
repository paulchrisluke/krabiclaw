import assert from 'node:assert/strict'
import test from 'node:test'
import { ogImageRenderers, resolveOgImageRenderer } from '~/server/utils/og-image/renderers/index.ts'
import type { SatoriNode } from '~/server/utils/og-image/satori-node.ts'

const BASE_PAYLOAD = {
  template: 'platform' as const,
  title: 'Local SEO Websites Managed Through ChatGPT',
  description: 'Beautiful local business websites edited through ChatGPT.',
  siteName: 'KrabiClaw',
  label: null,
  location: null,
  logoUrl: null,
  backgroundImageUrl: null,
  primaryColor: null,
  secondaryColor: null,
  backgroundImageDataUri: null,
  logoDataUri: null,
}

function collectText(node: SatoriNode): string[] {
  const children = node.props.children
  if (typeof children === 'string') return [children]
  if (!Array.isArray(children)) return []
  return children.flatMap((child) => {
    if (!child) return []
    if (typeof child === 'string') return [child]
    return collectText(child)
  })
}

test('resolveOgImageRenderer dispatches on template and falls back to platform for unknown values', () => {
  assert.equal(resolveOgImageRenderer('blawby'), ogImageRenderers.blawby)
  assert.equal(resolveOgImageRenderer('saya'), ogImageRenderers.saya)
  assert.equal(resolveOgImageRenderer('platform'), ogImageRenderers.platform)
  assert.equal(resolveOgImageRenderer('not-a-real-template'), ogImageRenderers.platform)
})

for (const template of ['platform', 'saya', 'blawby'] as const) {
  test(`${template} renderer produces a 1200x630 root node containing the title and description text`, () => {
    const renderer = ogImageRenderers[template]
    const tree = renderer({ ...BASE_PAYLOAD, template })

    assert.equal(tree.props.style?.width, 1200)
    assert.equal(tree.props.style?.height, 630)

    const text = collectText(tree)
    assert.ok(text.includes(BASE_PAYLOAD.title), 'title text should appear in the render tree')
    assert.ok(text.includes(BASE_PAYLOAD.description), 'description text should appear in the render tree')
    assert.ok(text.includes(BASE_PAYLOAD.siteName), 'site name should appear in the render tree')
  })
}

test('renderer omits the description node entirely when none is provided', () => {
  const tree = ogImageRenderers.platform({ ...BASE_PAYLOAD, description: null })
  const text = collectText(tree)
  assert.equal(text.includes(BASE_PAYLOAD.description), false)
})

test('renderer uses a solid gradient background (no img node) when there is no background image', () => {
  const tree = ogImageRenderers.saya({ ...BASE_PAYLOAD, template: 'saya' })
  const children = tree.props.children as SatoriNode[]
  const background = children[0]!
  assert.equal(background.type, 'div')
  assert.ok(String(background.props.style?.backgroundImage).startsWith('linear-gradient'))
})

test('renderer swaps in an img node for the background when a data URI is supplied', () => {
  const dataUri = 'data:image/jpeg;base64,AAAA'
  const tree = ogImageRenderers.blawby({ ...BASE_PAYLOAD, template: 'blawby', backgroundImageDataUri: dataUri })
  const children = tree.props.children as SatoriNode[]
  const background = children[0]!
  assert.equal(background.type, 'img')
  assert.equal(background.props.src, dataUri)
})
