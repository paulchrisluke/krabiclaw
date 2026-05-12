// GET /api/docs - List available documentation files
import { access, readdir, readFile } from 'fs/promises'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { jsonResponse } from '~/server/utils/api-response'

const __dirname = dirname(fileURLToPath(import.meta.url))
const docsDir = resolve(__dirname, '../../docs')

export default defineEventHandler(async (event) => {
  try {
    try {
      await access(docsDir)
    } catch (err) {
      console.error('Docs directory not found:', { docsDir, error: err })
      return jsonResponse({ error: `Documentation directory missing: ${docsDir}` }, { status: 404 })
    }

    const files = await readdir(docsDir)
    const INTERNAL_DOCS = new Set(['billing-architecture'])
    const markdownFiles = files.filter(f => f.endsWith('.md') && !INTERNAL_DOCS.has(f.replace('.md', '')))

    const docs = await Promise.all(markdownFiles.map(async (file) => {
      const filePath = resolve(docsDir, file)
      // Read file content to find H1 title
      const content = await readFile(filePath, { encoding: 'utf-8' })
      const titleMatch = content.match(/^#\s+(.+)$/m)
      const title = titleMatch ? titleMatch[1] : file.replace('.md', '')
      return {
        slug: file.replace('.md', ''),
        title,
        file
      }
    }))

    return jsonResponse({ docs })
  } catch (error) {
    console.error('Failed to load docs:', { docsDir, error })
    return jsonResponse({ error: 'Failed to load docs from documentation directory' }, { status: 500 })
  }
})
