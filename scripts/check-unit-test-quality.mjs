import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('..', import.meta.url))
const unitDirectory = join(root, 'tests/unit')
const limits = {
  files: 42,
  lines: 3500,
  tests: 196,
}
const violations = []
let lineCount = 0
let testCount = 0

async function listUnitTests(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const relativePath = join(prefix, entry.name)
    if (entry.isDirectory()) {
      files.push(...await listUnitTests(join(directory, entry.name), relativePath))
    } else if (entry.name.endsWith('.test.ts')) {
      files.push(relativePath)
    }
  }

  return files
}

function callPath(expression) {
  if (ts.isIdentifier(expression)) return [expression.text]
  if (!ts.isPropertyAccessExpression(expression)) return []
  return [...callPath(expression.expression), expression.name.text]
}

function literalPaths(node) {
  const values = []
  const visit = (child) => {
    if (ts.isStringLiteralLike(child)) values.push(child.text)
    ts.forEachChild(child, visit)
  }
  visit(node)
  return values
}

function importedNames(sourceFile) {
  const fileReaders = new Set()
  const fileNamespaces = new Set()
  const mocks = new Set()
  const tests = new Set()
  const testNamespaces = new Set()

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    const moduleName = statement.moduleSpecifier.text
    const defaultImport = statement.importClause?.name
    const bindings = statement.importClause?.namedBindings
    if (moduleName === 'node:test' && defaultImport) tests.add(defaultImport.text)
    if ((moduleName === 'node:fs' || moduleName === 'node:fs/promises') && defaultImport) {
      fileNamespaces.add(defaultImport.text)
    }
    if (!bindings) continue

    if ((moduleName === 'node:fs' || moduleName === 'node:fs/promises') && ts.isNamespaceImport(bindings)) {
      fileNamespaces.add(bindings.name.text)
    }
    if (moduleName === 'node:test' && ts.isNamespaceImport(bindings)) {
      testNamespaces.add(bindings.name.text)
    }

    if (!ts.isNamedImports(bindings)) continue
    for (const specifier of bindings.elements) {
      const imported = specifier.propertyName?.text ?? specifier.name.text
      if ((moduleName === 'node:fs' || moduleName === 'node:fs/promises')
        && (imported === 'readFile' || imported === 'readFileSync')) {
        fileReaders.add(specifier.name.text)
      }
      if (moduleName === 'node:fs' && imported === 'promises') {
        fileNamespaces.add(specifier.name.text)
      }
      if (moduleName === 'node:test' && imported === 'mock') mocks.add(specifier.name.text)
      if (moduleName === 'node:test' && (imported === 'it' || imported === 'test')) {
        tests.add(specifier.name.text)
      }
    }
  }

  return { fileNamespaces, fileReaders, mocks, testNamespaces, tests }
}

const files = (await listUnitTests(unitDirectory)).sort()

for (const file of files) {
  const source = await readFile(join(unitDirectory, file), 'utf8')
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const imports = importedNames(sourceFile)
  lineCount += source.split('\n').length - (source.endsWith('\n') ? 1 : 0)

  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const path = callPath(node.expression)
      const importedTestCall = imports.tests.has(path[0])
        && (path.length === 1 || (path.length === 2 && ['only', 'skip', 'todo'].includes(path[1])))
      const namespaceTestCall = imports.testNamespaces.has(path[0])
        && (path[1] === 'it' || path[1] === 'test')
        && (path.length === 2 || (path.length === 3 && ['only', 'skip', 'todo'].includes(path[2])))
      if (importedTestCall || namespaceTestCall) testCount += 1

      const importedMockCall = path.length === 2
        && imports.mocks.has(path[0])
        && path[1] === 'module'
      const testMockCall = path.length === 3
        && imports.tests.has(path[0])
        && path[1] === 'mock'
        && path[2] === 'module'
      const namespaceMockCall = path.length === 3
        && imports.testNamespaces.has(path[0])
        && path[1] === 'mock'
        && path[2] === 'module'
      if (importedMockCall || testMockCall || namespaceMockCall) {
        const targets = node.arguments[0] ? literalPaths(node.arguments[0]) : []
        const hasStaticTarget = targets.length > 0
        const mocksInternalModule = targets.some(value => /^(?:\.\.\/|\.\/|~\/|@\/|\/)/.test(value))
        if (!hasStaticTarget || mocksInternalModule) {
          violations.push(`tests/unit/${file}: internal application modules must not be mocked`)
        }
      }

      const importedReader = path.length === 1 && imports.fileReaders.has(path[0])
      const namespacedReader = path.length === 2
        && imports.fileNamespaces.has(path[0])
        && (path[1] === 'readFile' || path[1] === 'readFileSync')
      const defaultPromisesReader = path.length === 3
        && imports.fileNamespaces.has(path[0])
        && path[1] === 'promises'
        && path[2] === 'readFile'
      if ((importedReader || namespacedReader || defaultPromisesReader) && node.arguments[0]) {
        const targets = literalPaths(node.arguments[0])
        const isMigrationFixture = file === 'database-baseline.test.ts'
          && targets.length === 1
          && targets.every(value => /^migrations\/[^/]+\.sql$/.test(value))
        if (!isMigrationFixture) {
          violations.push(`tests/unit/${file}: production source must not be read as test data`)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
}

const actual = {
  files: files.length,
  lines: lineCount,
  tests: testCount,
}

for (const [metric, maximum] of Object.entries(limits)) {
  if (actual[metric] > maximum) {
    violations.push(`unit suite has ${actual[metric]} ${metric}; maximum is ${maximum}`)
  }
}

if (violations.length > 0) {
  console.error([...new Set(violations)].join('\n'))
  process.exitCode = 1
} else {
  console.log(`Unit-test policy passed: ${actual.files} files, ${actual.tests} tests, ${actual.lines} lines`)
}
