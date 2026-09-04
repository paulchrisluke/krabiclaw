# Enforcing boundaries with ESLint

## Contents

- Enforcement strategy
- Discover the repository first
- Primary flat-config pattern
- Import restrictions
- Public APIs and cycles
- Tests, exceptions, rollout, and CI
- Limitations

## Enforcement strategy

For JavaScript and TypeScript projects, enforce architecture in layers:

1. Use `eslint-plugin-boundaries` to classify resolved files and enforce allowed source dependencies.
2. Use ESLint core `no-restricted-imports` for explicit package, SDK, runtime, and deep-import bans.
3. Optionally use `eslint-plugin-import` for cycles and path-oriented restrictions.
4. Use package `exports`, TypeScript project references, workspace configuration, and CI as additional barriers.

Do not rely only on naming conventions or code-review memory.

## Folder implementation contract

Whenever this skill creates or reorganizes JavaScript/TypeScript architecture folders, implement the corresponding ESLint boundaries during the same task. Do not stop after moving files and leave enforcement as a recommendation or TODO.

The completed implementation must:

1. Map every new or changed architecture folder to an ESLint boundary element.
2. Encode allowed source-import directions and deny forbidden shortcuts.
3. Protect adapter-only SDKs and package public APIs.
4. Preserve necessary composition-root, test, generated-code, and migration exceptions narrowly.
5. Put the rules in the repository's normal lint path.
6. Run the repository lint command and relevant type checks or tests.
7. Prove at least one allowed dependency passes and one representative forbidden dependency fails, without leaving intentionally broken source behind.

Skip the configuration change only when the user explicitly declines ESLint, the affected implementation contains no JavaScript/TypeScript, or a concrete repository constraint makes ESLint unusable. Report the exact reason rather than silently omitting enforcement.

Current authoritative references:

- https://github.com/javierbrea/eslint-plugin-boundaries
- https://www.jsboundaries.dev
- https://eslint.org/docs/latest/rules/no-restricted-imports
- https://github.com/import-js/eslint-plugin-import

Check the installed plugin versions and their documentation before changing an existing configuration. The examples below target ESLint flat config and the current `boundaries/dependencies` API. Older plugin versions may use `boundaries/element-types` instead.

## Discover the repository first

Before writing rules:

1. Inspect the package manager, workspace layout, ESLint version, config format, TypeScript aliases, package exports, and existing plugins.
2. Map actual directories to UI, Transport client, Transport server, Domain, Capabilities, adapters, persistence, shared, and composition roots.
3. Identify generated files, migrations, tests, stories, fixtures, and build output.
4. Inventory external SDKs that should be owned by adapters.
5. Find current cross-layer imports and decide whether each is a violation, an intentional port implementation, or composition wiring.

Never paste a generic path map into a repository without adapting it.

## Runtime flow versus source imports

Runtime calls may look like this:

```text
Domain → Capability port → concrete adapter
```

Source dependencies should normally use inversion:

```text
Domain imports Capability port
Concrete adapter imports/implements Capability port
Composition root imports both and wires them together
```

Do not make a Capability package import its concrete vendor adapter merely to match the runtime arrow.

Typical source-import policy:

| From | May import |
|---|---|
| UI | UI, Transport client, Shared |
| Transport client | Transport client, Shared |
| Server Transport | Server Transport, Domain, Shared |
| Domain | Domain, Capability ports, Shared |
| Capability ports | Capability ports, Shared |
| Vendor/platform adapters | Adapter internals, Capability ports, Shared |
| Persistence adapters | Persistence internals, repository ports/Application types, Shared |
| Shared | Shared only |
| Composition root | All layers needed for wiring |

Adapt repository-port ownership consistently. If repository ports live in Domain, persistence adapters may import the narrow Domain port and its application-owned types. Do not allow persistence to import arbitrary Domain internals.

## Primary flat-config pattern

Install the plugin through the repository's existing package manager only when it is not already present. Do not guess the package manager.

The following is an illustrative flat-config shape. Replace paths and types with the repository's actual structure:

```js
import boundaries from "eslint-plugin-boundaries";

const layerTypes = [
  "ui",
  "transport-client",
  "transport-server",
  "domain",
  "capability",
  "adapter",
  "persistence",
  "shared",
  "composition",
];

export default [
  {
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        { type: "ui", pattern: "apps/*/src/ui/**" },
        { type: "transport-client", pattern: "apps/*/src/transport-client/**" },
        { type: "transport-server", pattern: "apps/server/src/transport/**" },
        { type: "domain", pattern: "packages/core/src/**" },
        { type: "capability", pattern: "packages/capabilities/*/src/**" },
        { type: "adapter", pattern: "packages/adapters/*/src/**" },
        { type: "persistence", pattern: "packages/database/src/**" },
        { type: "shared", pattern: "packages/shared/src/**" },
        { type: "composition", pattern: "apps/*/src/composition/**" },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          policies: [
            {
              from: { element: { type: "ui" } },
              allow: {
                to: {
                  element: {
                    types: { anyOf: ["ui", "transport-client", "shared"] },
                  },
                },
              },
            },
            {
              from: { element: { type: "transport-client" } },
              allow: {
                to: {
                  element: {
                    types: { anyOf: ["transport-client", "shared"] },
                  },
                },
              },
            },
            {
              from: { element: { type: "transport-server" } },
              allow: {
                to: {
                  element: {
                    types: { anyOf: ["transport-server", "domain", "shared"] },
                  },
                },
              },
            },
            {
              from: { element: { type: "domain" } },
              allow: {
                to: {
                  element: {
                    types: { anyOf: ["domain", "capability", "shared"] },
                  },
                },
              },
            },
            {
              from: { element: { type: "capability" } },
              allow: {
                to: {
                  element: {
                    types: { anyOf: ["capability", "shared"] },
                  },
                },
              },
            },
            {
              from: { element: { type: "adapter" } },
              allow: {
                to: {
                  element: {
                    types: { anyOf: ["adapter", "capability", "shared"] },
                  },
                },
              },
            },
            {
              from: { element: { type: "persistence" } },
              allow: {
                to: {
                  element: {
                    types: { anyOf: ["persistence", "domain", "capability", "shared"] },
                  },
                },
              },
            },
            {
              from: { element: { type: "shared" } },
              allow: { to: { element: { type: "shared" } } },
            },
            {
              from: { element: { type: "composition" } },
              allow: {
                to: { element: { types: { anyOf: layerTypes } } },
              },
            },
          ],
        },
      ],
    },
  },
];
```

Treat the example as a policy template, not a drop-in file. Confirm the installed plugin accepts the selected syntax, every important source file is classified, aliases resolve correctly, and the composition pattern does not swallow ordinary application files.

Use the plugin's debug facilities temporarily when classification is unclear. Remove noisy debug settings after verification.

## Import restrictions

Use core `no-restricted-imports` for constraints expressed most clearly as forbidden import names or patterns.

Examples:

- Ban vendor SDKs outside adapter directories.
- Ban Node built-ins from browser or mobile UI.
- Ban Electron main-process APIs from renderer UI.
- Ban direct imports of Domain internals from UI.
- Ban package deep imports and require public entry points.

Illustrative flat-config override:

```js
{
  files: [
    "apps/*/src/ui/**/*.{js,jsx,ts,tsx}",
    "packages/core/src/**/*.{js,ts}",
  ],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: [
              "stripe",
              "stripe/**",
              "@aws-sdk/**",
              "posthog-node",
              "posthog-node/**",
            ],
            message: "Use the application Capability port; provider SDKs belong in adapters.",
          },
        ],
      },
    ],
  },
}
```

Use repository-specific package names. Avoid broad wildcard bans that accidentally block application-owned types. ESLint's core rule checks static imports and exports; verify coverage for dynamic imports, `require`, and project-specific module loading. `eslint-plugin-boundaries` can inspect several dependency node kinds in current versions.

Type-only imports still create architectural coupling. Allow them only when the imported type is an intentionally shared contract, not because it disappears at runtime.

## Public APIs and cycles

Enforce package public APIs with a combination of:

- `package.json` `exports`
- TypeScript path configuration
- `no-restricted-imports` deep-import patterns
- Workspace package boundaries

Prefer imports such as `@repo/payments` over `@repo/payments/src/internal/provider-client`.

Consider `import/no-cycle` for JavaScript/TypeScript cycles. It complements architectural rules but does not replace them: a forbidden dependency can be acyclic, and an allowed layer can still contain a cycle.

## Tests and special files

Classify tests, stories, fixtures, generated code, and migrations intentionally.

Recommended policy:

- Tests may import the public API of the layer under test.
- Tests should not normalize forbidden production imports.
- Shared test helpers belong in explicit test-support locations.
- Production code must never import tests, stories, fixtures, or mocks.
- Generated code and migrations may require narrow overrides or ignores.
- Composition roots receive explicit, narrow exceptions because they must wire concrete implementations.

Do not solve test friction with a repository-wide disable.

## Exceptions

Prefer changing the code or refining classification over disabling a rule.

When an exception is genuinely required:

- Scope it to the smallest file or import.
- Add a reason explaining why the dependency is safe.
- Point to the intended replacement or tracking issue when temporary.
- Avoid blanket `eslint-disable` comments and directory-wide allowlists.
- Review exceptions during architecture audits.

## Rollout

For an existing repository:

1. Produce an inventory of current violations.
2. Fix simple alias, public-entry, and misplaced-SDK violations first.
3. Separate mixed-responsibility modules before enforcing their final layer.
4. Add narrow temporary exceptions only for known migration debt.
5. Enable rules as errors for new or clean areas.
6. Remove temporary exceptions as migrations complete.

Do not create a permanent warning-only architecture policy. The end state is deterministic failure on violations.

## Verification and CI

After configuration:

1. Run ESLint on the full intended source set.
2. Confirm valid imports pass.
3. Confirm at least one representative forbidden import fails.
4. Test both path aliases and relative paths so one cannot bypass the rules.
5. Test static imports, exports, dynamic imports, and CommonJS `require` when the repository uses them.
6. Confirm generated output and irrelevant directories are excluded intentionally.
7. Run type checking and repository tests.

CI must run the architecture rules on every relevant pull request with zero warnings accepted, for example through the repository's lint script using `--max-warnings=0`.

Keep the boundary configuration in the normal lint path so editor feedback and CI use the same policy. Avoid a forgotten architecture-only command that developers rarely run.

## Limitations

- ESLint enforces only code it parses and files included in its lint targets.
- It cannot enforce Swift, Kotlin, C#, Rust, or other non-JavaScript language dependencies. Use the ecosystem's native architecture tools there.
- Runtime service-to-service calls require API policies, service ownership, and observability in addition to source-import rules.
- Reflection, generated code, plugin loading, and string-based dynamic imports may need separate controls.
- A passing lint run proves declared dependency rules, not correct business placement. Continue reviewing responsibilities, not only imports.
