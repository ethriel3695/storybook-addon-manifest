# Storybook Addon Manifest

A monorepo for Storybook manifest addons that generate component manifests for various frameworks. These addons enable AI-powered tools like [Storybook MCP](https://github.com/storybookjs/mcp) to understand your component libraries.

## Packages

| Package | Description | Status |
|---------|-------------|--------|
| [storybook-addon-angular-manifest](./packages/angular) | Angular + Compodoc integration | ✅ Available |
| storybook-addon-vue-manifest | Vue manifest generator | 🚧 Planned |
| storybook-addon-svelte-manifest | Svelte manifest generator | 🚧 Planned |
| storybook-addon-wc-manifest | Web Components manifest generator | 🚧 Planned |

## Development

### Prerequisites

- Node.js 20+
- pnpm 10+

### Setup

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run in development mode
pnpm dev
```

### Scripts

| Script | Description |
|--------|-------------|
| `pnpm build` | Build all packages |
| `pnpm dev` | Watch mode for all packages |
| `pnpm typecheck` | Type check all packages |
| `pnpm lint` | Lint all packages |
| `pnpm format` | Format all files |
| `pnpm test` | Run tests |
| `pnpm release` | Publish packages |

## Adding a New Framework Addon

1. Create a new directory: `packages/<framework>/`
2. Copy structure from `packages/angular/`
3. Implement framework-specific manifest generation
4. Add to workspace and test

## License

MIT
