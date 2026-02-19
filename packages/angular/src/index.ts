/**
 * storybook-addon-angular-manifest
 *
 * A Storybook addon that generates component manifests for Angular components
 * using Compodoc documentation. This enables AI-powered tools like MCP to
 * understand your Angular component library.
 *
 * @example
 * ```js
 * // .storybook/main.js
 * export default {
 *   addons: [
 *     'storybook-addon-angular-manifest',
 *     '@storybook/addon-docs',
 *     '@storybook/addon-mcp',
 *   ],
 * };
 * ```
 */

// Types
export type {
	CompodocDocObj,
	CompodocJson,
	CompodocResult,
	Component,
	Directive,
	Injectable,
	Pipe,
	Class,
	Property,
	Method,
} from './types.js';

// Compodoc utilities
export {
	findCompodocJson,
	findCompodocJsonFromStoryPaths,
	loadCompodocJson,
	findComponentByName,
	getCompodocForComponent,
	getImportTag,
	resolveCompodocPath,
} from './compodocReader.js';

// Code snippet generation
export {
	generateAngularSnippet,
	type GenerateAngularSnippetOptions,
} from './generateCodeSnippet.js';

// JSDoc utilities
export { extractJSDocInfo } from './jsdocTags.js';

// Generator
export { manifests, type AngularComponentManifest } from './generator.js';
