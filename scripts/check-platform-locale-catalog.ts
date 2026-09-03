#!/usr/bin/env -S node --experimental-strip-types
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import englishManifest from '../i18n/locales/en.ts'
import {
  flattenLocaleManifest,
  localeManifestHash,
  validateLocaleCatalog,
  type CatalogValidationIssue,
} from '../shared/platform-locale-catalog.ts'

interface CatalogCheckOptions {
  locale: string
  outputPath: string | null
}

function parseOptions(args: string[]): CatalogCheckOptions {
  let locale: string | null = null
  let outputPath: string | null = null
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]
    const value = args[index + 1]
    if (!value) throw new Error(`Missing value for ${flag ?? 'argument'}`)
    if (flag === '--locale') locale = value
    else if (flag === '--output') outputPath = value
    else throw new Error(`Unknown argument: ${flag}`)
  }
  if (!locale) throw new Error('Usage: yarn platform-locales:check --locale <locale> [--output <path>]')
  const canonical = Intl.getCanonicalLocales(locale)
  if (canonical.length !== 1 || canonical[0] !== locale) throw new Error(`Locale must be an exact canonical BCP 47 tag: ${locale}`)
  return { locale, outputPath }
}

function formatIssue(issue: CatalogValidationIssue): string {
  switch (issue.kind) {
    case 'shape':
      return 'catalog root must be an object'
    case 'coverage':
      return `catalog coverage mismatch (missing: ${issue.missing.join(', ') || 'none'}; extra: ${issue.extra.join(', ') || 'none'})`
    case 'value':
      return `catalog message ${issue.key} must be a non-blank string`
    case 'placeholder':
      return `catalog message ${issue.key} placeholders differ (expected: ${issue.expected.join(', ')}; actual: ${issue.actual.join(', ')})`
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2))
  const root = fileURLToPath(new URL('..', import.meta.url))
  const relativeArtifactPath = `i18n/catalogs/${options.locale}.json`
  const artifactPath = resolve(root, relativeArtifactPath)
  if (!existsSync(artifactPath)) throw new Error(`Locale catalog artifact does not exist: ${relativeArtifactPath}`)

  const artifact: unknown = JSON.parse(readFileSync(artifactPath, 'utf8'))
  const source = flattenLocaleManifest(englishManifest)
  const validation = validateLocaleCatalog(source, artifact, { complete: true })
  if (!validation.ok) throw new Error(`Invalid ${options.locale} platform locale catalog: ${formatIssue(validation.issue)}`)

  const [sourceHash, artifactHash] = await Promise.all([
    localeManifestHash(source),
    localeManifestHash(validation.messages),
  ])
  if (options.outputPath) {
    const outputPath = resolve(process.cwd(), options.outputPath)
    writeFileSync(outputPath, `${JSON.stringify(validation.messages, null, 2)}\n`, { flag: 'w' })
    console.log(`Publish payload: ${relative(process.cwd(), outputPath)}`)
  }
  console.log(`${options.locale === 'th' ? 'Thai' : options.locale} platform locale catalog is valid: ${Object.keys(validation.messages).length} keys`)
  console.log(`English manifest: ${sourceHash}`)
  console.log(`Catalog artifact: ${artifactHash}`)
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
