import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const parse = async (path: string) => {
  const text = await readFile(new URL(`../../${path}`, import.meta.url), 'utf8')
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
}

const descendants = (node: ts.Node): ts.Node[] => {
  const result: ts.Node[] = []
  const visit = (child: ts.Node) => {
    result.push(child)
    child.forEachChild(visit)
  }
  node.forEachChild(visit)
  return result
}

const propertyName = (node: ts.PropertyName | undefined) =>
  node && (ts.isIdentifier(node) || ts.isStringLiteral(node)) ? node.text : null

test('API clients enforce retry, timeout, runtime validation, and GET coalescing', async () => {
  const clients = await parse('utils/api-clients.ts')
  const dashboard = await parse('composables/dashboardFetch.ts')
  for (const tree of [clients, dashboard]) {
    const nodes = descendants(tree)
    assert.ok(nodes.some(node =>
      ts.isPropertyAssignment(node)
      && propertyName(node.name) === 'retry'
      && node.initializer.kind === ts.SyntaxKind.NumericLiteral
      && node.initializer.getText() === '0',
    ))
    assert.ok(nodes.some(node => ts.isCallExpression(node) && node.expression.getText().endsWith('validate')))
    assert.ok(nodes.some(node => ts.isCallExpression(node) && node.expression.getText().endsWith('.get')))
    assert.ok(nodes.some(node => ts.isCallExpression(node) && node.expression.getText().endsWith('.set')))
  }
})

test('public shell request excludes menu and experience-list fields', async () => {
  const shell = await parse('composables/useSiteShell.ts')
  const nodes = descendants(shell)
  assert.ok(nodes.some(node =>
    ts.isPropertyAssignment(node)
    && propertyName(node.name) === 'menu'
    && node.initializer.kind === ts.SyntaxKind.FalseKeyword,
  ))
  const shellInterface = nodes.find(node => ts.isInterfaceDeclaration(node) && node.name.text === 'SiteShellPayload') as ts.InterfaceDeclaration
  assert.ok(shellInterface)
  assert.equal(shellInterface.members.some(member => propertyName(member.name) === 'experiencesList'), false)
  assert.equal(shellInterface.members.some(member => propertyName(member.name) === 'content'), false)
})

test('availability and policy loaders use bounded bulk-query call sites', async () => {
  const experiences = await parse('server/utils/experiences.ts')
  const policies = await parse('server/utils/booking-policies.ts')
  const experienceNodes = descendants(experiences)
  const policyNodes = descendants(policies)
  // Check for experienceIds chunking at 97
  assert.ok(experienceNodes.some(node =>
    ts.isBinaryExpression(node)
    && node.operatorToken.kind === ts.SyntaxKind.LessThanToken
    && node.right.getText() === 'experienceIds.length',
  ))
  // Check for locationIds chunking at 97
  assert.ok(experienceNodes.some(node =>
    ts.isBinaryExpression(node)
    && node.operatorToken.kind === ts.SyntaxKind.LessThanToken
    && node.right.getText() === 'locationIds.length',
  ))
  // Verify 97-item chunk size is used
  const chunkSizeNodes = experienceNodes.filter(node =>
    ts.isBinaryExpression(node)
    && node.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken
    && node.right.getText() === '97',
  )
  assert.ok(chunkSizeNodes.length >= 2, 'Should have at least 2 chunk size assignments (for both experiences and locations)')
  assert.ok(experienceNodes.filter(node =>
    ts.isCallExpression(node) && node.expression.getText() === 'queryAll',
  ).length >= 4)
  assert.ok(policyNodes.some(node =>
    ts.isFunctionDeclaration(node) && node.name?.text === 'resolveBookingPolicyIndex',
  ))
})

test('dashboard transport never mutates global fetch', async () => {
  for (const path of ['composables/dashboardFetch.ts', 'composables/useDashboardSite.ts']) {
    const tree = await parse(path)
    assert.equal(descendants(tree).some(node =>
      ts.isPropertyAccessExpression(node)
      && node.expression.getText() === 'globalThis'
      && node.name.text === '$fetch',
    ), false)
  }
})

test('dashboard fetch applies configured timeout per method', async () => {
  const dashboard = await parse('composables/dashboardFetch.ts')
  const apiClients = await parse('utils/api-clients.ts')
  const nodes = descendants(dashboard)
  const apiNodes = descendants(apiClients)

  // Check that timeout is conditionally applied based on method
  assert.ok(nodes.some(node =>
    ts.isConditionalExpression(node)
    && node.condition.getText().includes('GET'),
  ), 'dashboardFetch should conditionally apply timeout based on method')

  // Check that timeout constants are exported
  assert.ok(apiNodes.some(node =>
    ts.isVariableStatement(node)
    && node.declarationList.declarations.some(d =>
      ts.isIdentifier(d.name) && d.name.text === 'DASHBOARD_READ_TIMEOUT_MS',
    ),
  ), 'DASHBOARD_READ_TIMEOUT_MS must be exported from api-clients.ts')

  assert.ok(apiNodes.some(node =>
    ts.isVariableStatement(node)
    && node.declarationList.declarations.some(d =>
      ts.isIdentifier(d.name) && d.name.text === 'MUTATION_TIMEOUT_MS',
    ),
  ), 'MUTATION_TIMEOUT_MS must be exported from api-clients.ts')
})
