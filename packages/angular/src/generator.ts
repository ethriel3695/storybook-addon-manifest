import { loadPreviewOrConfigFile, serverRequire } from 'storybook/internal/common';
import { extractDescription, loadCsf } from 'storybook/internal/csf-tools';
import type {
	DocsIndexEntry,
	IndexEntry,
	PresetPropertyFn,
} from 'storybook/internal/types';
import { existsSync } from 'node:fs';

import { uniqBy } from 'es-toolkit/array';
import path from 'pathe';

const SELECTOR_PREFIX_CONFIG_DIR_ENV = 'STORYBOOK_MANIFEST_CONFIG_DIR';
const DEFAULT_STORYBOOK_CONFIG_DIR = '.storybook';

interface AngularManifestPreviewConfig {
	selectorPrefix?: string;
	compodocPath?: string;
	addonMcpCompatibility: boolean;
}

let cachedAngularManifestConfig: AngularManifestPreviewConfig | null = null;
let angularManifestConfigLoaded = false;

function resetAngularManifestConfigCache() {
	cachedAngularManifestConfig = null;
	angularManifestConfigLoaded = false;
}

function readSelectorPrefix(candidate: unknown): string | undefined {
	if (!candidate || typeof candidate !== 'object') {
		return undefined;
	}
	const value = (candidate as Record<string, unknown>).selectorPrefix;
	if (typeof value !== 'string') {
		return undefined;
	}
	const normalized = value.trim();
	return normalized.length > 0 ? normalized : undefined;
}

function readCompodocPath(candidate: unknown): string | undefined {
	if (!candidate || typeof candidate !== 'object') {
		return undefined;
	}
	const value = (candidate as Record<string, unknown>).compodocPath;
	if (typeof value !== 'string') {
		return undefined;
	}
	const normalized = value.trim();
	return normalized.length > 0 ? normalized : undefined;
}

function readAddonMcpCompatibility(candidate: unknown): boolean | undefined {
	if (!candidate || typeof candidate !== 'object') {
		return undefined;
	}
	const value = (candidate as Record<string, unknown>).addonMcpCompatibility;
	return typeof value === 'boolean' ? value : undefined;
}

function findObjectPropertyValueStart(
	source: string,
	propertyName: string
): number | undefined {
	const propertyPattern = new RegExp(
		`(?:^|[,{]\\s*)(?:${propertyName}|["']${propertyName}["'])\\s*:\\s*`,
		'gm'
	);

	let match = propertyPattern.exec(source);
	while (match) {
		const valueStart = match.index + match[0].length;
		if (valueStart < source.length) {
			return valueStart;
		}
		match = propertyPattern.exec(source);
	}

	return undefined;
}

function readBalancedObjectLiteral(
	source: string,
	startIndex: number
): string | undefined {
	if (source[startIndex] !== '{') {
		return undefined;
	}

	let depth = 0;

	for (let index = startIndex; index < source.length; index += 1) {
		const char = source[index];
		const nextChar = source[index + 1];

		if (char === '"' || char === "'" || char === '`') {
			const quote = char;
			index += 1;
			while (index < source.length) {
				const current = source[index];
				if (current === '\\') {
					index += 2;
					continue;
				}
				if (current === quote) {
					break;
				}
				index += 1;
			}
			continue;
		}

		if (char === '/' && nextChar === '/') {
			index += 2;
			while (index < source.length && source[index] !== '\n') {
				index += 1;
			}
			continue;
		}

		if (char === '/' && nextChar === '*') {
			index += 2;
			while (index < source.length) {
				if (source[index] === '*' && source[index + 1] === '/') {
					index += 1;
					break;
				}
				index += 1;
			}
			continue;
		}

		if (char === '{') {
			depth += 1;
			continue;
		}

		if (char === '}') {
			depth -= 1;
			if (depth === 0) {
				return source.slice(startIndex, index + 1);
			}
		}
	}

	return undefined;
}

function parseSimpleStringLiteral(source: string, startIndex: number): string | undefined {
	const quote = source[startIndex];
	if (quote !== '"' && quote !== "'" && quote !== '`') {
		return undefined;
	}

	let result = '';

	for (let index = startIndex + 1; index < source.length; index += 1) {
		const char = source[index];

		if (char === '\\') {
			const escaped = source[index + 1];
			if (escaped === undefined) {
				return undefined;
			}

			switch (escaped) {
				case 'n':
					result += '\n';
					break;
				case 'r':
					result += '\r';
					break;
				case 't':
					result += '\t';
					break;
				case '\\':
					result += '\\';
					break;
				case '"':
					result += '"';
					break;
				case "'":
					result += "'";
					break;
				case '`':
					result += '`';
					break;
				default:
					result += escaped;
					break;
			}

			index += 1;
			continue;
		}

		if (char === quote) {
			return result;
		}

		result += char;
	}

	return undefined;
}

function readStringPropertyFromObjectLiteral(
	objectLiteral: string,
	propertyName: string
): string | undefined {
	const valueStart = findObjectPropertyValueStart(objectLiteral, propertyName);
	if (valueStart === undefined) {
		return undefined;
	}

	const parsed = parseSimpleStringLiteral(objectLiteral, valueStart);
	if (typeof parsed !== 'string') {
		return undefined;
	}

	const normalized = parsed.trim();
	return normalized.length > 0 ? normalized : undefined;
}

function readBooleanPropertyFromObjectLiteral(
	objectLiteral: string,
	propertyName: string
): boolean | undefined {
	const valueStart = findObjectPropertyValueStart(objectLiteral, propertyName);
	if (valueStart === undefined) {
		return undefined;
	}

	if (objectLiteral.startsWith('true', valueStart)) {
		return true;
	}

	if (objectLiteral.startsWith('false', valueStart)) {
		return false;
	}

	return undefined;
}

function loadAngularManifestConfigFromPreviewSource(
	previewFile: string
): AngularManifestPreviewConfig | undefined {
	try {
		const previewSource = cachedReadFileSync(previewFile, 'utf-8') as string;
		const angularManifestValueStart = findObjectPropertyValueStart(
			previewSource,
			'angularManifest'
		);

		if (
			angularManifestValueStart === undefined ||
			previewSource[angularManifestValueStart] !== '{'
		) {
			return undefined;
		}

		const angularManifestObjectLiteral = readBalancedObjectLiteral(
			previewSource,
			angularManifestValueStart
		);

		if (!angularManifestObjectLiteral) {
			return undefined;
		}

		return {
			selectorPrefix: readStringPropertyFromObjectLiteral(
				angularManifestObjectLiteral,
				'selectorPrefix'
			),
			compodocPath: readStringPropertyFromObjectLiteral(
				angularManifestObjectLiteral,
				'compodocPath'
			),
			addonMcpCompatibility:
				readBooleanPropertyFromObjectLiteral(
					angularManifestObjectLiteral,
					'addonMcpCompatibility'
				) ?? false,
		};
	} catch {
		return undefined;
	}
}

async function resolveAngularManifestConfig(): Promise<AngularManifestPreviewConfig> {
	if (angularManifestConfigLoaded) {
		return cachedAngularManifestConfig ?? { addonMcpCompatibility: false };
	}

	angularManifestConfigLoaded = true;

	const configDirSetting = process.env[SELECTOR_PREFIX_CONFIG_DIR_ENV];
	const configDirCandidate =
		typeof configDirSetting === 'string' && configDirSetting.trim().length > 0
			? configDirSetting.trim()
			: DEFAULT_STORYBOOK_CONFIG_DIR;
	const configDir = path.isAbsolute(configDirCandidate)
		? configDirCandidate
		: path.join(process.cwd(), configDirCandidate);

	try {
		const previewFile = loadPreviewOrConfigFile({ configDir });
		if (!previewFile) {
			cachedAngularManifestConfig = { addonMcpCompatibility: false };
			return cachedAngularManifestConfig;
		}

		let previewModule: unknown;
		try {
			previewModule = await serverRequire(previewFile);
		} catch (error) {
			const fallbackConfig =
				loadAngularManifestConfigFromPreviewSource(previewFile);
			if (fallbackConfig) {
				cachedAngularManifestConfig = fallbackConfig;
				return fallbackConfig;
			}

			throw error;
		}

		if (!previewModule) {
			const fallbackConfig =
				loadAngularManifestConfigFromPreviewSource(previewFile);
			cachedAngularManifestConfig = fallbackConfig ?? { addonMcpCompatibility: false };
			return cachedAngularManifestConfig;
		}

		const moduleExports = previewModule as Record<string, unknown>;
		const defaultExport = moduleExports.default as Record<string, unknown> | undefined;
		const previewParameters =
			(moduleExports.parameters as Record<string, unknown> | undefined) ??
			(defaultExport?.parameters as Record<string, unknown> | undefined);

		const angularManifestConfig: AngularManifestPreviewConfig = {
			selectorPrefix:
				readSelectorPrefix(previewParameters?.['angularManifest']) ??
				readSelectorPrefix(moduleExports['angularManifest']) ??
				readSelectorPrefix(defaultExport?.['angularManifest']),
			compodocPath:
				readCompodocPath(previewParameters?.['angularManifest']) ??
				readCompodocPath(moduleExports['angularManifest']) ??
				readCompodocPath(defaultExport?.['angularManifest']),
			addonMcpCompatibility:
				readAddonMcpCompatibility(previewParameters?.['angularManifest']) ??
				readAddonMcpCompatibility(moduleExports['angularManifest']) ??
				readAddonMcpCompatibility(defaultExport?.['angularManifest']) ??
				false,
		};

		cachedAngularManifestConfig = angularManifestConfig;
		return angularManifestConfig;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(
			`[storybook-addon-angular-manifest] Unable to read angularManifest settings from preview: ${message}`
		);
	}

	cachedAngularManifestConfig = { addonMcpCompatibility: false };
	return cachedAngularManifestConfig;
}

async function resolveSelectorPrefix(): Promise<string | undefined> {
	return (await resolveAngularManifestConfig()).selectorPrefix;
}

async function resolveConfiguredCompodocPath(): Promise<string | undefined> {
	return (await resolveAngularManifestConfig()).compodocPath;
}

async function resolveAddonMcpCompatibility(): Promise<boolean> {
	return (await resolveAngularManifestConfig()).addonMcpCompatibility;
}

/**
 * Component manifest structure - matches Storybook's internal ComponentManifest
 */
interface ComponentManifest {
	id: string;
	path: string;
	name: string;
	description?: string;
	import?: string;
	summary?: string;
	stories: Array<{
		name: string;
		snippet?: string;
		description?: string;
		summary?: string;
		error?: { name: string; message: string };
	}>;
	jsDocTags: Record<string, string[]>;
	reactDocgen?: {
		props: Record<
			string,
			{
				description?: string;
				required?: boolean;
				defaultValue?: { value: string };
				tsType?: {
					name: string;
					raw?: string;
				};
			}
		>;
	};
	error?: { name: string; message: string };
}

/**
 * Manifests structure returned by experimental_manifests
 */
interface Manifests {
	components?: {
		v: number;
		components: Record<string, ComponentManifest>;
		meta?: {
			docgen: 'compodoc';
			durationMs: number;
		};
	};
	docs?: {
		v: number;
		docs: Record<string, unknown>;
	};
	[key: string]: unknown;
}

import {
	findCompodocJsonFromStoryPaths,
	type CompodocDocObj,
	type CompodocResult,
	getCompodocForComponent,
	getImportTag,
	loadCompodocJson,
	resolveCompodocPath,
} from './compodocReader.js';
import { generateAngularSnippet } from './generateCodeSnippet.js';
import { extractJSDocInfo } from './jsdocTags.js';
import {
	cachedFindUp,
	cachedReadFileSync,
	invalidateCache,
	invariant,
} from './utils.js';

/**
 * Tag constant for attached MDX - matches Storybook's Tag.ATTACHED_MDX
 */
const ATTACHED_MDX_TAG = 'attached-mdx';

/**
 * Extended ComponentManifest for Angular that includes Compodoc data
 */
export interface AngularComponentManifest extends ComponentManifest {
	id: string;
	compodocData?: CompodocDocObj;
}

/**
 * Get package.json name from the nearest package.json
 */
function getPackageInfo(
	componentPath: string | undefined,
	fallbackPath: string
) {
	const nearestPkg = cachedFindUp('package.json', {
		cwd: path.dirname(componentPath ?? fallbackPath),
	});

	try {
		return nearestPkg
			? JSON.parse(cachedReadFileSync(nearestPkg, 'utf-8') as string).name
			: undefined;
	} catch {
		return undefined;
	}
}

/**
 * Extract stories from the CSF file
 */
function extractStories(
	csf: ReturnType<ReturnType<typeof loadCsf>['parse']>,
	componentName: string | undefined,
	manifestEntries: IndexEntry[],
	compodocDoc: CompodocDocObj | undefined,
	selectorPrefix: string | undefined
) {
	const manifestEntryIds = new Set(manifestEntries.map((entry) => entry.id));
	return Object.entries(csf._stories)
		.filter(([, story]) => manifestEntryIds.has(story.id))
		.map(([storyName]) => {
			try {
				const jsdocComment = extractDescription(
					csf._storyStatements[storyName]
				);
				const { tags = {}, description } = jsdocComment
					? extractJSDocInfo(jsdocComment)
					: {};
				const finalDescription =
					(tags?.describe?.[0] || tags?.desc?.[0]) ?? description;

				return {
					name: storyName,
					snippet: generateAngularSnippet(
						csf,
						storyName,
						componentName,
						compodocDoc,
						{ selectorPrefix }
					),
					description: finalDescription?.trim(),
					summary: tags.summary?.[0],
				};
			} catch (e) {
				invariant(e instanceof Error);
				return {
					name: storyName,
					error: { name: e.name, message: e.message },
				};
			}
		});
}

/**
 * Extract component description from CSF meta and Compodoc
 */
function extractComponentDescription(
	csf: ReturnType<ReturnType<typeof loadCsf>['parse']>,
	compodocDoc: CompodocDocObj | undefined
) {
	const jsdocComment =
		extractDescription(csf._metaStatement) ||
		compodocDoc?.rawdescription ||
		compodocDoc?.description;
	const { tags = {}, description } = jsdocComment
		? extractJSDocInfo(jsdocComment)
		: {};
	return {
		description: ((tags?.describe?.[0] || tags?.desc?.[0]) ?? description)?.trim(),
		summary: tags.summary?.[0],
		jsDocTags: tags,
	};
}

function getCompodocText(
	description: string | undefined,
	rawdescription: string | undefined
) {
	return description?.trim() || rawdescription?.trim() || undefined;
}

function buildAddonMcpReactDocgen(compodocDoc: CompodocDocObj | undefined) {
	if (!compodocDoc || compodocDoc.inputs.length === 0) {
		return undefined;
	}

	return {
		props: Object.fromEntries(
			compodocDoc.inputs.map((input) => [
				input.name,
				{
					description: getCompodocText(
						input.description,
						input.rawdescription
					),
					required: !input.optional,
					defaultValue:
						typeof input.defaultValue === 'string'
							? { value: input.defaultValue }
							: undefined,
					tsType: {
						name: input.type || 'any',
						raw: input.type || 'any',
					},
				},
			])
		),
	};
}

function buildOutputsSection(compodocDoc: CompodocDocObj | undefined) {
	if (!compodocDoc || compodocDoc.outputs.length === 0) {
		return undefined;
	}

	const lines = compodocDoc.outputs.map((output) => {
		const outputDescription = getCompodocText(
			output.description,
			output.rawdescription
		);
		let line = `- \`${output.name}\``;

		if (output.type) {
			line += ` (\`${output.type}\`)`;
		}

		if (outputDescription) {
			line += `: ${outputDescription}`;
		}

		return line;
	});

	return ['## Outputs', '', ...lines].join('\n');
}

function appendOutputsSection(
	description: string | undefined,
	compodocDoc: CompodocDocObj | undefined
) {
	const outputsSection = buildOutputsSection(compodocDoc);
	if (!outputsSection) {
		return description?.trim() || undefined;
	}

	const normalizedDescription = description?.trim();
	return normalizedDescription
		? `${normalizedDescription}\n\n${outputsSection}`
		: outputsSection;
}

/**
 * Generate import statement for an Angular component
 */
function generateImportStatement(
	componentName: string,
	packageName: string | undefined,
	compodocDoc: CompodocDocObj | undefined
): string {
	// Check if Compodoc has an import tag
	const importTag = compodocDoc ? getImportTag(compodocDoc) : undefined;
	if (importTag) {
		return importTag;
	}

	// Generate a default import statement
	if (packageName) {
		return `import { ${componentName} } from '${packageName}';`;
	}

	return '';
}

/**
 * Angular manifest generator preset
 *
 * This generates component manifests for Angular components by reading
 * Compodoc JSON for type information and CSF files for story information.
 */
export const manifests = (async (
	existingManifests: Manifests = {},
	{ manifestEntries }: { manifestEntries?: IndexEntry[] } = {}
) => {
	const entries = Array.isArray(manifestEntries) ? manifestEntries : [];

	// Some callers (e.g. addon-mcp capability probes) invoke the preset with an
	// empty manifest list or undefined value to check whether manifests are
	// supported. Return an empty components shell so capability probes can detect
	// that component manifests are available without requiring real story entries.
	if (entries.length === 0) {
		return {
			...existingManifests,
			components: existingManifests.components ?? {
				v: 0,
				components: {},
			},
		};
	}

	invalidateCache();
	resetAngularManifestConfigCache();

	const startPerformance = performance.now();

	const configuredCompodocPath = await resolveConfiguredCompodocPath();
	const resolvedConfiguredCompodocPath =
		typeof configuredCompodocPath === 'string'
			? resolveCompodocPath(configuredCompodocPath)
			: undefined;

	if (resolvedConfiguredCompodocPath && !existsSync(resolvedConfiguredCompodocPath)) {
		console.warn(
			`[storybook-addon-angular-manifest] angularManifest.compodocPath was set but file was not found at ${resolvedConfiguredCompodocPath}. Falling back to automatic discovery.`
		);
	}

	const storyImportPaths = entries
		.map((entry) =>
			entry.type === 'story'
				? entry.importPath
				: (entry as DocsIndexEntry).storiesImports?.[0]
		)
		.filter((storyImportPath): storyImportPath is string =>
			typeof storyImportPath === 'string' && storyImportPath.length > 0
		);

	const discoveredCompodocPath =
		findCompodocJsonFromStoryPaths(storyImportPaths) ?? undefined;
	const compodocPathToLoad =
		(resolvedConfiguredCompodocPath && existsSync(resolvedConfiguredCompodocPath)
			? resolvedConfiguredCompodocPath
			: undefined) ?? discoveredCompodocPath;

	// Load Compodoc JSON once for all components
	const compodocJson = loadCompodocJson(compodocPathToLoad);

	if (!compodocJson) {
		console.warn(
			'[storybook-addon-angular-manifest] Compodoc JSON not found. Component manifests will have limited type information.\n' +
				"Run 'npx compodoc -p tsconfig.json' to generate documentation."
		);
		// Return existing manifests without modification if no compodoc
		return existingManifests;
	}

	// Debug logging
	console.log(
		`[storybook-addon-angular-manifest] Received ${entries.length} manifest entries`
	);

	// Filter to unique components (stories only, not docs entries unless attached)
	const filteredEntries = entries.filter(
		(entry) =>
			(entry.type === 'story' &&
				(entry as unknown as { subtype?: string }).subtype === 'story') ||
			(entry.type === 'docs' &&
				entry.tags?.includes(ATTACHED_MDX_TAG) &&
				(entry as DocsIndexEntry).storiesImports?.length > 0)
	);

	console.log(
		`[storybook-addon-angular-manifest] Filtered to ${filteredEntries.length} story entries`
	);

	const entriesByUniqueComponent = uniqBy(
		filteredEntries,
		(entry) => entry.id.split('--')[0]
	);

	const selectorPrefix = await resolveSelectorPrefix();
	const addonMcpCompatibility = await resolveAddonMcpCompatibility();

	const components = entriesByUniqueComponent
		.map((entry): AngularComponentManifest | undefined => {
			try {
				const storyFilePath =
					entry.type === 'story'
						? entry.importPath
						: (entry as DocsIndexEntry).storiesImports[0];
				if (!storyFilePath) {
					return undefined;
				}
				const absoluteImportPath = path.join(process.cwd(), storyFilePath);
				const storyFile = cachedReadFileSync(absoluteImportPath, 'utf-8') as string;
				const csf = loadCsf(storyFile, {
					makeTitle: (title) => title ?? 'No title',
				}).parse();

				// Extract component name - handle both string and component reference
				const metaComponent = csf._meta?.component;
				const componentName =
					typeof metaComponent === 'string'
						? metaComponent
						: typeof metaComponent === 'function'
							? (metaComponent as Function & { displayName?: string }).displayName || (metaComponent as Function).name
							: undefined;

				const id = entry.id.split('--')[0];
				const title = entry.title.split('/').at(-1)!.replace(/\s+/g, '');

				// Get Compodoc documentation for this component
				const compodocResult: CompodocResult = componentName
					? getCompodocForComponent(componentName, compodocJson)
					: {
							type: 'error',
							error: {
								name: 'No component found',
								message: 'Component name not specified in story meta.',
							},
						};

				const compodocDoc =
					compodocResult.type === 'success' ? compodocResult.data : undefined;

				// Get package info for import statement
				const packageName = getPackageInfo(undefined, absoluteImportPath);
				const importStatement = generateImportStatement(
					componentName ?? title,
					packageName,
					compodocDoc
				);

				// Extract stories
				const stories = extractStories(
					csf,
					componentName,
					entries,
					compodocDoc,
					selectorPrefix
				);

				// Build the base manifest
				const base: Partial<ComponentManifest> = {
					id,
					name: componentName ?? title,
					path: storyFilePath,
					stories,
					import: importStatement,
					jsDocTags: {},
				};

				if (!componentName) {
					return {
						...base,
						error: {
							name: 'No component found',
							message:
								'We could not detect the component from your story file. Specify meta.component.\n\n' +
								`${entry.importPath}:\n${storyFile}`,
						},
					} as AngularComponentManifest;
				}

				// Get description from CSF meta and Compodoc
				const {
					description: baseDescription,
					summary: baseSummary,
					jsDocTags,
				} = extractComponentDescription(
					csf,
					compodocDoc
				);
				const description = addonMcpCompatibility
					? appendOutputsSection(baseDescription, compodocDoc)
					: baseDescription;
				const summary = addonMcpCompatibility
					? baseSummary ?? baseDescription?.trim()
					: baseSummary;

				return {
					...base,
					description,
					summary,
					compodocData: compodocDoc,
					reactDocgen: addonMcpCompatibility
						? buildAddonMcpReactDocgen(compodocDoc)
						: undefined,
					jsDocTags,
					error:
						compodocResult.type === 'error' ? compodocResult.error : undefined,
				} as AngularComponentManifest;
			} catch (e) {
				const error = e instanceof Error ? e : new Error(String(e));
				console.error(
					`[storybook-addon-angular-manifest] Error processing ${entry.importPath}: ${error.message}`
				);
				return undefined;
			}
		})
		.filter((component) => component !== undefined);

	console.log(
		`[storybook-addon-angular-manifest] Generated manifests for ${components.length} components in ${Math.round(performance.now() - startPerformance)}ms`
	);

	return {
		...existingManifests,
		components: {
			v: 0,
			components: Object.fromEntries(
				components.map((component) => [component.id, component])
			),
			meta: {
				docgen: 'compodoc',
				durationMs: Math.round(performance.now() - startPerformance),
			},
		},
	};
});
