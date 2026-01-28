import { extractDescription, loadCsf } from 'storybook/internal/csf-tools';
import type {
	DocsIndexEntry,
	IndexEntry,
	PresetPropertyFn,
	StorybookConfigRaw,
} from 'storybook/internal/types';

import { uniqBy } from 'es-toolkit/array';
import path from 'pathe';

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
	error?: { name: string; message: string };
}

/**
 * Manifests structure returned by experimental_manifests
 */
interface Manifests {
	components?: {
		v: number;
		components: Record<string, ComponentManifest>;
	};
	docs?: {
		v: number;
		docs: Record<string, unknown>;
	};
	[key: string]: unknown;
}

import {
	type CompodocDocObj,
	type CompodocResult,
	getCompodocForComponent,
	getImportTag,
	loadCompodocJson,
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
	compodocDoc: CompodocDocObj | undefined
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
						compodocDoc
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
export const manifests: PresetPropertyFn<'experimental_manifests'> = async (
	existingManifests: Manifests = {},
	{ manifestEntries }: { manifestEntries: IndexEntry[] }
) => {
	invalidateCache();

	const startPerformance = performance.now();

	// Load Compodoc JSON once for all components
	const compodocJson = loadCompodocJson();

	if (!compodocJson) {
		console.warn(
			'[storybook-addon-angular-manifest] Compodoc JSON not found. Component manifests will have limited type information.\n' +
				"Run 'npx compodoc -p tsconfig.json' to generate documentation."
		);
		// Return existing manifests without modification if no compodoc
		return existingManifests;
	}

	// Filter to unique components (stories only, not docs entries unless attached)
	const entriesByUniqueComponent = uniqBy(
		manifestEntries.filter(
			(entry) =>
				(entry.type === 'story' &&
					(entry as unknown as { subtype?: string }).subtype === 'story') ||
				(entry.type === 'docs' &&
					entry.tags?.includes(ATTACHED_MDX_TAG) &&
					(entry as DocsIndexEntry).storiesImports?.length > 0)
		),
		(entry) => entry.id.split('--')[0]
	);

	const components = entriesByUniqueComponent
		.map((entry): AngularComponentManifest | undefined => {
			try {
				const storyFilePath =
					entry.type === 'story'
						? entry.importPath
						: (entry as DocsIndexEntry).storiesImports[0];
				const absoluteImportPath = path.join(process.cwd(), storyFilePath);
				const storyFile = cachedReadFileSync(absoluteImportPath, 'utf-8') as string;
				const csf = loadCsf(storyFile, {
					makeTitle: (title) => title ?? 'No title',
				}).parse();

				const componentName = csf._meta?.component;
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
					manifestEntries,
					compodocDoc
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
				const { description, summary, jsDocTags } = extractComponentDescription(
					csf,
					compodocDoc
				);

				return {
					...base,
					description,
					summary,
					compodocData: compodocDoc,
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
		},
	};
};
