import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildLlmsTxt,
  renderContentMarkdownWithComponents,
  renderPlatformBlogMarkdown,
  renderPlatformDocMarkdown,
} from '../../utils/platform-llm.ts'

test('renderContentMarkdownWithComponents replaces embeds and appends leftover components', () => {
  const markdown = renderContentMarkdownWithComponents(
    [
      '# Intro',
      '',
      '{{component type="faq"}}',
      '',
      'Closing copy.',
    ].join('\n'),
    [
      {
        id: 'faq-1',
        content_type: 'doc',
        content_id: 'doc-1',
        type: 'faq',
        label: 'Common Questions',
        status: 'active',
        render_enabled: true,
        schema_enabled: true,
        position: 1,
        created_at: '',
        updated_at: '',
        data: {
          items: [
            { question: 'What is KrabiClaw?', answer: 'An AI website builder.', position: 1 },
          ],
        },
      },
      {
        id: 'howto-1',
        content_type: 'doc',
        content_id: 'doc-1',
        type: 'how_to',
        label: 'Launch Steps',
        status: 'active',
        render_enabled: true,
        schema_enabled: true,
        position: 2,
        created_at: '',
        updated_at: '',
        data: {
          estimated_time: '10 minutes',
          steps: [
            { name: 'Open KrabiClaw', text: 'Sign in and create a site.', position: 1 },
            { name: 'Publish', text: 'Review and go live.', position: 2 },
          ],
        },
      },
    ],
  )

  assert.match(markdown, /## Common Questions/)
  assert.match(markdown, /### What is KrabiClaw\?/)
  assert.match(markdown, /## Launch Steps/)
  assert.match(markdown, /1\. \*\*Open KrabiClaw\*\*/)
  assert.match(markdown, /Closing copy\./)
})

test('renderPlatformDocMarkdown emits front matter and route metadata', () => {
  const markdown = renderPlatformDocMarkdown({
    id: 'doc-1',
    title: 'Getting started with KrabiClaw',
    slug: 'getting-started-with-krabiclaw',
    body: 'Start here.',
    excerpt: 'Launch your first site.',
    category: 'Getting Started',
    difficulty_level: 'Beginner',
    canonical_url: null,
    seo_description: 'Learn the basics.',
    published_at: '2026-06-27T00:00:00.000Z',
    updated_at: '2026-06-27T12:00:00.000Z',
    components: [],
  }, 'https://krabiclaw.com', 'getting-started')

  assert.match(markdown, /^---/m)
  assert.match(markdown, /title: "Getting started with KrabiClaw"/)
  assert.match(markdown, /markdown_url: "\/docs-md\/getting-started\/getting-started-with-krabiclaw\.md"/)
  assert.match(markdown, /type: "documentation"/)
  assert.match(markdown, /# Getting started with KrabiClaw/)
})

test('renderPlatformBlogMarkdown emits front matter and category route metadata', () => {
  const markdown = renderPlatformBlogMarkdown({
    id: 'post-1',
    title: 'How restaurants can launch faster',
    slug: 'how-restaurants-can-launch-faster',
    body: 'Body copy.',
    excerpt: 'A practical guide.',
    category: 'Marketing',
    canonical_url: null,
    seo_description: 'A practical guide.',
    published_at: '2026-06-27T00:00:00.000Z',
    updated_at: '2026-06-27T12:00:00.000Z',
    author_name: 'KrabiClaw',
    components: [],
  }, 'https://krabiclaw.com', 'marketing')

  assert.match(markdown, /category: "Marketing"/)
  assert.match(markdown, /markdown_url: "\/blog\/marketing\/how-restaurants-can-launch-faster\.md"/)
  assert.match(markdown, /author: "KrabiClaw"/)
  assert.match(markdown, /# How restaurants can launch faster/)
})

test('buildLlmsTxt points at markdown mirrors and machine-readable indexes', () => {
  const llms = buildLlmsTxt(
    'https://krabiclaw.com',
    [{
      title: 'Getting started with KrabiClaw',
      path: '/docs/getting-started/getting-started-with-krabiclaw',
      markdownPath: '/docs/getting-started/getting-started-with-krabiclaw.md',
      canonicalUrl: 'https://krabiclaw.com/docs/getting-started/getting-started-with-krabiclaw',
      summary: 'Launch your first site.',
      category: 'Getting Started',
    }],
    [{
      title: 'How restaurants can launch faster',
      path: '/blog/marketing/how-restaurants-can-launch-faster',
      markdownPath: '/blog/marketing/how-restaurants-can-launch-faster.md',
      canonicalUrl: 'https://krabiclaw.com/blog/marketing/how-restaurants-can-launch-faster',
      summary: 'A practical guide.',
      category: 'Marketing',
    }],
  )

  assert.match(llms, /^# KrabiClaw/m)
  assert.match(llms, /\[Getting started with KrabiClaw\]\(https:\/\/krabiclaw\.com\/docs\/getting-started\/getting-started-with-krabiclaw\.md\)/)
  assert.match(llms, /\[How restaurants can launch faster\]\(https:\/\/krabiclaw\.com\/blog\/marketing\/how-restaurants-can-launch-faster\.md\)/)
  assert.match(llms, /\[Docs index JSON\]\(https:\/\/krabiclaw\.com\/docs\/index\.json\)/)
  assert.match(llms, /\[Blog JSON feed\]\(https:\/\/krabiclaw\.com\/blog\/feed\.json\)/)
})
