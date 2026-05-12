// GET /api/docs - List available documentation files
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { jsonResponse } from '~/server/utils/api-response'

export default defineEventHandler(async (event) => {
  try {
    const docsDir = join(process.cwd(), 'docs')
    const files = await readdir(docsDir)
    const markdownFiles = files.filter(f => f.endsWith('.md'))

    const docs = await Promise.all(markdownFiles.map(async (file) => {
      const filePath = join(docsDir, file)
      // Read only first 2KB to find H1 title
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
    console.error('Failed to load docs:', error)
    return jsonResponse({ error: 'Failed to load docs' }, { status: 500 })
  }
})
