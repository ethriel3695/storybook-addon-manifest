import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'pathe';

import { manifests } from './generator.js';

const originalCwd = process.cwd();
const originalConfigDirEnv = process.env.STORYBOOK_MANIFEST_CONFIG_DIR;
const tempDirs: string[] = [];

function createWorkspace() {
	const dir = mkdtempSync(path.join(tmpdir(), 'storybook-addon-angular-generator-'));
	tempDirs.push(dir);
	return dir;
}

function writeFile(filePath: string, content: string) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, content, 'utf-8');
}

function createCompodocComponent({
	outputs = [
		{
			name: 'clicked',
			type: 'EventEmitter<MouseEvent>',
			optional: false,
			description: 'Emitted when the button is clicked.',
		},
	],
}: {
	outputs?: Array<{
		name: string;
		type: string;
		optional: boolean;
		description?: string;
	}>;
} = {}) {
	return {
		name: 'ButtonComponent',
		selector: 'app-button',
		type: 'component' as const,
		description: 'Base button description.',
		inputsClass: [
			{
				name: 'color',
				type: '"primary" | "secondary"',
				optional: false,
				defaultValue: "'primary'",
				description: 'Visual treatment for the button.',
			},
			{
				name: 'size',
				type: '"small" | "medium" | "large"',
				optional: true,
				description: 'Optional size variant.',
			},
		],
		outputsClass: outputs,
		propertiesClass: [],
		methodsClass: [],
	};
}

async function generateManifestResult({
	storySource,
	previewConfig,
	previewFile,
	compodocComponent = createCompodocComponent(),
}: {
	storySource: string;
	previewConfig?: { addonMcpCompatibility?: boolean };
	previewFile?: {
		path: string;
		content: string;
	};
	compodocComponent?: ReturnType<typeof createCompodocComponent>;
}) {
	const workspace = createWorkspace();

	writeFile(path.join(workspace, 'src/button.stories.ts'), storySource);
	writeFile(
		path.join(workspace, 'documentation.json'),
		JSON.stringify(
			{
				directives: [],
				components: [compodocComponent],
				pipes: [],
				injectables: [],
				classes: [],
			},
			null,
			2
		)
	);

	if (previewFile) {
		writeFile(path.join(workspace, previewFile.path), previewFile.content);
	} else if (previewConfig) {
		writeFile(
			path.join(workspace, '.storybook/preview.js'),
			`module.exports = { parameters: { angularManifest: ${JSON.stringify(previewConfig)} } };`
		);
	}

	process.chdir(workspace);
	delete process.env.STORYBOOK_MANIFEST_CONFIG_DIR;

	const result = (await manifests(
		{},
		{
			manifestEntries: [
				{
					id: 'example-button--primary',
					type: 'story',
					subtype: 'story',
					importPath: 'src/button.stories.ts',
					title: 'Example/Button',
					name: 'Primary',
				},
			] as any[],
		}
	)) as any;

	return result;
}

async function generateComponentManifest(
	options: Parameters<typeof generateManifestResult>[0]
) {
	const result = await generateManifestResult(options);
	return result.components.components['example-button'];
}

afterEach(() => {
	process.chdir(originalCwd);
	if (originalConfigDirEnv === undefined) {
		delete process.env.STORYBOOK_MANIFEST_CONFIG_DIR;
	} else {
		process.env.STORYBOOK_MANIFEST_CONFIG_DIR = originalConfigDirEnv;
	}

	for (const dir of tempDirs.splice(0, tempDirs.length)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe.sequential('generator addon-mcp compatibility', () => {
	it('returns an empty components manifest for capability probes', async () => {
		const result = (await manifests(
			{
				docs: {
					v: 0,
					docs: {
						intro: { content: 'hello' },
					},
				},
			},
			{
				manifestEntries: [],
			}
		)) as any;

		expect(result.components).toEqual({
			v: 0,
			components: {},
		});
		expect(result.docs).toEqual({
			v: 0,
			docs: {
				intro: { content: 'hello' },
			},
		});
	});

	it('keeps compodoc data intact and does not emit reactDocgen by default', async () => {
		const component = await generateComponentManifest({
			storySource: `
				class ButtonComponent {}

				export default {
					title: 'Example/Button',
					component: ButtonComponent,
				};

				export const Primary = {
					args: {
						color: 'secondary',
					},
				};
			`,
		});

		expect(component.compodocData).toBeTruthy();
		expect(component.reactDocgen).toBeUndefined();
		expect(component.description).toBe('Base button description.');
		expect(component.summary).toBeUndefined();
	});

	it('emits compodoc manifest metadata for downstream consumers', async () => {
		const result = await generateManifestResult({
			storySource: `
				class ButtonComponent {}

				export default {
					title: 'Example/Button',
					component: ButtonComponent,
				};

				export const Primary = {};
			`,
		});

		expect(result.components.meta).toEqual({
			docgen: 'compodoc',
			durationMs: expect.any(Number),
		});
	});

	it('emits reactDocgen props and appends outputs when compatibility mode is enabled', async () => {
		const component = await generateComponentManifest({
			previewConfig: { addonMcpCompatibility: true },
			storySource: `
				class ButtonComponent {}

				export default {
					title: 'Example/Button',
					component: ButtonComponent,
				};

				export const Primary = {
					args: {
						color: 'secondary',
						size: 'large',
					},
				};
			`,
		});

		expect(component.reactDocgen).toEqual({
			props: {
				color: {
					description: 'Visual treatment for the button.',
					required: true,
					defaultValue: { value: "'primary'" },
					tsType: {
						name: '"primary" | "secondary"',
						raw: '"primary" | "secondary"',
					},
				},
				size: {
					description: 'Optional size variant.',
					required: false,
					tsType: {
						name: '"small" | "medium" | "large"',
						raw: '"small" | "medium" | "large"',
					},
				},
			},
		});
		expect(component.description).toBe(
			[
				'Base button description.',
				'',
				'## Outputs',
				'',
				'- `clicked` (`EventEmitter<MouseEvent>`): Emitted when the button is clicked.',
			].join('\n')
		);
		expect(component.summary).toBe('Base button description.');
	});

	it('does not append an outputs section when there are no component outputs', async () => {
		const component = await generateComponentManifest({
			previewConfig: { addonMcpCompatibility: true },
			compodocComponent: createCompodocComponent({ outputs: [] }),
			storySource: `
				class ButtonComponent {}

				export default {
					title: 'Example/Button',
					component: ButtonComponent,
				};

				export const Primary = {};
			`,
		});

		expect(component.description).toBe('Base button description.');
		expect(component.summary).toBe('Base button description.');
		expect(component.reactDocgen?.props?.color).toBeTruthy();
	});

	it('falls back to preview source parsing when preview imports Compodoc JSON', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

		try {
			const component = await generateComponentManifest({
				previewFile: {
					path: '.storybook/preview.ts',
					content: `
						import type { Preview } from '@storybook/angular';
						import docJson from '../documentation.json';

						void docJson;

						const preview: Preview = {
							parameters: {
								angularManifest: {
									addonMcpCompatibility: true,
								},
							},
						};

						export default preview;
					`,
				},
				storySource: `
					class ButtonComponent {}

					export default {
						title: 'Example/Button',
						component: ButtonComponent,
					};

					export const Primary = {};
				`,
			});

			expect(component.reactDocgen?.props?.color).toBeTruthy();
			expect(component.description).toContain('## Outputs');
			expect(warnSpy).not.toHaveBeenCalledWith(
				expect.stringContaining(
					'Unable to read angularManifest settings from preview'
				)
			);
		} finally {
			warnSpy.mockRestore();
		}
	});

	it('preserves the existing missing meta.component error behavior', async () => {
		const component = await generateComponentManifest({
			previewConfig: { addonMcpCompatibility: true },
			compodocComponent: createCompodocComponent({ outputs: [] }),
			storySource: `
				export default {
					title: 'Example/Button',
				};

				export const Primary = {};
			`,
		});

		expect(component.error?.name).toBe('No component found');
		expect(component.error?.message).toContain(
			'We could not detect the component from your story file. Specify meta.component.'
		);
		expect(component.error?.message).toContain('src/button.stories.ts:');
		expect(component.reactDocgen).toBeUndefined();
		expect(component.compodocData).toBeUndefined();
	});
});
