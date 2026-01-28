import { defineConfig } from 'tsdown';

export default (pkgName: string) =>
	defineConfig({
		format: ['esm'],
		target: 'node20',
		dts: true,
		clean: true,
		sourcemap: true,
	}) as any;
