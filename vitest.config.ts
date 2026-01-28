import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [tsconfigPaths()],
	test: {
		projects: ['packages/*'],
		coverage: {
			include: ['**/src/**/*.{ts,tsx}'],
			exclude: ['*.d.ts'],
			reporter: ['text', 'lcov', 'html'],
		},
	},
});
