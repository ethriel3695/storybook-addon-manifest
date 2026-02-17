# CLAUDE.md

## Project Overview

This is **storybook-addon-manifest**, a monorepo that produces Storybook addons which generate **component manifests** — structured JSON descriptions of a project's UI components. These manifests power AI tooling (specifically [Storybook MCP](https://github.com/storybookjs/mcp)) by giving language models rich, accurate metadata about component libraries: props/inputs/outputs, descriptions, code snippets, and JSDoc tags.

The repo currently ships one package — `storybook-addon-angular-manifest` — with planned addons for Vue, Svelte, and Web Components.

## Repository Structure

```
├── packages/
│   └── angular/          # storybook-addon-angular-manifest (the only package so far)
│       └── src/
│           ├── preset.ts              # Storybook preset entry — exports experimental_manifests
│           ├── generator.ts           # Core orchestration: reads CSF + Compodoc, emits manifest JSON
│           ├── compodocReader.ts       # Finds, loads, and normalizes Compodoc documentation.json
│           ├── generateCodeSnippet.ts  # Produces Angular template snippets from story args
│           ├── jsdocTags.ts            # Parses JSDoc comments for @summary, @desc, etc.
│           ├── types.ts               # Compodoc type definitions
│           ├── utils.ts               # Caching, invariant, groupBy helpers
│           └── index.ts               # Public API re-exports
├── tsdown-shared.config.ts  # Shared tsdown (bundler) config factory
├── turbo.json               # Turborepo task graph
├── vitest.config.ts         # Workspace-level Vitest config
├── tsconfig.json            # Root TypeScript config (module: preserve, strict)
└── pnpm-workspace.yaml      # pnpm workspace with version catalog
```

## How the Angular Addon Works

1. **Storybook loads the preset** (`preset.ts`) which exports `experimental_manifests`.
2. Storybook calls `experimental_manifests` with all index entries (stories + docs).
3. The generator (`generator.ts`):
   - Loads **Compodoc JSON** (`documentation.json`) once for the entire project.
   - For each story file, parses the **CSF** (Component Story Format) via `storybook/internal/csf-tools`.
   - Matches the CSF `meta.component` name to its Compodoc entry to extract inputs, outputs, methods, and descriptions.
   - Generates an **Angular template snippet** showing how to render the component with the story's args.
   - Extracts **JSDoc tags** (`@summary`, `@desc`, `@import`) from story-level and meta-level comments.
   - Assembles a `ComponentManifest` per component, keyed by Storybook ID.
4. The final manifest is served at `/manifests/components.json` for MCP or other consumers.

## Tech Stack & Tooling

| Tool | Purpose |
|------|---------|
| **pnpm 10** | Package manager (with workspace catalog for shared dependency versions) |
| **Turborepo** | Task orchestration (`build`, `dev`, `typecheck`, `test`, `publint`) |
| **tsdown** | Bundler — ESM-only, targeting Node 20, with `.d.mts` declarations and sourcemaps |
| **TypeScript 5.9** | Strict mode, `verbatimModuleSyntax`, `module: "preserve"` |
| **Vitest 4** | Test runner (workspace-level config delegates to `packages/*`) |
| **oxlint** | Linter (minimal config, just `switch-exhaustiveness-check`) |
| **Prettier** | Formatter — tabs, single quotes, trailing commas |
| **Changesets** | Versioning and publishing to npm |

## Key Commands

```bash
pnpm install          # Install all dependencies
pnpm build            # Build all packages (via Turborepo)
pnpm dev              # Watch mode for all packages
pnpm test             # Run tests in watch mode
pnpm test:run         # Run tests once
pnpm check            # Full CI check: build + format + lint + publint + typecheck + test
pnpm typecheck        # Type-check the entire monorepo
pnpm lint             # Run oxlint
pnpm format           # Format with Prettier
pnpm release          # Build + changeset publish
```

## Code Conventions

- **ESM only** — all packages use `"type": "module"` and `.mjs` output.
- **File extensions in imports** — use `.js` extensions in TypeScript source (e.g., `'./types.js'`), which resolve to the compiled `.mjs` output.
- **Tabs for indentation**, single quotes, trailing commas (Prettier config).
- **Strict TypeScript** — `strict: true`, `noUncheckedIndexedAccess`, `noImplicitOverride`.
- **No default exports** — everything uses named exports.
- **Caching pattern** — `utils.ts` provides a `cached()` wrapper and `invalidateCache()` that are used for file reads and `find.up` lookups. The cache is invalidated at the start of each `experimental_manifests` call.
- **Error handling** — functions that can fail return discriminated unions (`CompodocResult = { type: 'success'; data } | { type: 'error'; error }`) rather than throwing.
- **Dependencies via pnpm catalog** — shared dependency versions are pinned in `pnpm-workspace.yaml` under `catalog:`.

## Adding a New Framework Addon

1. Create `packages/<framework>/` mirroring the `angular` package structure.
2. Implement a `generator.ts` that exports a `manifests` function matching the `PresetPropertyFn<'experimental_manifests'>` signature from Storybook.
3. Export it as `experimental_manifests` from `preset.ts`.
4. The generator should:
   - Read framework-specific documentation (equivalent of Compodoc for Angular).
   - Parse CSF files for story metadata.
   - Generate framework-appropriate code snippets.
   - Return a `{ components: { v: 0, components: Record<string, ComponentManifest> } }` structure merged with existing manifests.
5. Add the package to `tsconfig.json` paths for live types during development.
6. Add shared dependencies to the pnpm catalog in `pnpm-workspace.yaml`.

## Important Context

- The addon is designed to run **at Storybook build/start time** (server-side, Node.js), not in the browser.
- It is compatible with **Storybook 8, 9, and 10** (see `peerDependencies`).
- The manifest format (`v: 0`) is still experimental and may evolve alongside Storybook's `experimental_manifests` API.
- Compodoc must be run separately before starting Storybook — the addon only **reads** `documentation.json`, it does not invoke Compodoc.
