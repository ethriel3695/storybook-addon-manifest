import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: ['src/index.ts', 'src/preset.ts'],
	format: ['esm'],
	target: 'node20',
	dts: true,
	clean: true,
	sourcemap: true,
});
