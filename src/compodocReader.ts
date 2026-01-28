import { existsSync } from 'node:fs';
import path from 'pathe';

import type {
	Class,
	CompodocDocObj,
	CompodocJson,
	CompodocResult,
	Component,
	Directive,
	Injectable,
	Pipe,
	Property,
} from './types.js';
import { cachedReadFileSync } from './utils.js';

/**
 * Default paths where Compodoc JSON might be located
 */
const COMPODOC_PATHS = ['documentation.json', '.compodoc/documentation.json'];

/**
 * Find the Compodoc JSON file in the project
 */
export function findCompodocJson(cwd: string = process.cwd()): string | undefined {
	for (const relativePath of COMPODOC_PATHS) {
		const fullPath = path.join(cwd, relativePath);
		if (existsSync(fullPath)) {
			return fullPath;
		}
	}

	return undefined;
}

/**
 * Load and parse the Compodoc JSON file
 */
export function loadCompodocJson(compodocPath?: string): CompodocJson | undefined {
	const filePath = compodocPath ?? findCompodocJson();

	if (!filePath) {
		return undefined;
	}

	try {
		const content = cachedReadFileSync(filePath, 'utf-8') as string;
		return JSON.parse(content) as CompodocJson;
	} catch (error) {
		console.warn(`Failed to parse Compodoc JSON at ${filePath}: ${error}`);
		return undefined;
	}
}

/**
 * Find a component or directive by name in the Compodoc JSON
 */
export function findComponentByName(
	name: string,
	compodocJson: CompodocJson
): Component | Directive | Pipe | Injectable | Class | undefined {
	return (
		compodocJson.components?.find((c) => c.name === name) ||
		compodocJson.directives?.find((c) => c.name === name) ||
		compodocJson.pipes?.find((c) => c.name === name) ||
		compodocJson.injectables?.find((c) => c.name === name) ||
		compodocJson.classes?.find((c) => c.name === name)
	);
}

/**
 * Convert a Property to a normalized input format
 */
function normalizeProperty(prop: Property) {
	return {
		name: prop.name,
		type: prop.type || 'any',
		description: prop.description,
		rawdescription: prop.rawdescription,
		defaultValue: prop.defaultValue,
		optional: prop.optional ?? false,
	};
}

/**
 * Convert a Compodoc component/directive to a normalized CompodocDocObj
 */
function normalizeComponentDoc(
	component: Component | Directive | Pipe | Injectable | Class
): CompodocDocObj {
	const isComponentOrDirective = 'inputsClass' in component;
	const type = isComponentOrDirective
		? (component as Directive).type
		: 'properties' in component
			? 'class'
			: 'injectable';

	const base: CompodocDocObj = {
		name: component.name,
		description: component.description,
		rawdescription: component.rawdescription,
		type: type as CompodocDocObj['type'],
		inputs: [],
		outputs: [],
		properties: [],
		methods: [],
	};

	if (isComponentOrDirective) {
		const comp = component as Directive;
		base.inputs = (comp.inputsClass || []).map(normalizeProperty);
		base.outputs = (comp.outputsClass || []).map((prop) => ({
			name: prop.name,
			type: prop.type || 'EventEmitter<any>',
			description: prop.description,
			rawdescription: prop.rawdescription,
		}));
		base.properties = (comp.propertiesClass || []).map(normalizeProperty);
		base.methods = (comp.methodsClass || []).map((m) => ({
			name: m.name,
			description: m.description,
			rawdescription: m.rawdescription,
			args: m.args.map((a) => ({
				name: a.name,
				type: a.type,
				optional: a.optional,
			})),
			returnType: m.returnType,
		}));
	} else {
		const cls = component as Class | Injectable | Pipe;
		base.properties = (cls.properties || []).map(normalizeProperty);
		base.methods = (cls.methods || []).map((m) => ({
			name: m.name,
			description: m.description,
			rawdescription: m.rawdescription,
			args: m.args.map((a) => ({
				name: a.name,
				type: a.type,
				optional: a.optional,
			})),
			returnType: m.returnType,
		}));
	}

	return base;
}

/**
 * Get Compodoc documentation for a component by name
 */
export function getCompodocForComponent(
	componentName: string,
	compodocJson?: CompodocJson
): CompodocResult {
	const json = compodocJson ?? loadCompodocJson();

	if (!json) {
		return {
			type: 'error',
			error: {
				name: 'Compodoc JSON not found',
				message: `Could not find documentation.json. Run 'npx compodoc -p tsconfig.json' to generate it.
        
For more information, see: https://compodoc.app/guides/getting-started.html`,
			},
		};
	}

	const component = findComponentByName(componentName, json);

	if (!component) {
		return {
			type: 'error',
			error: {
				name: 'Component not found in Compodoc',
				message: `Component "${componentName}" was not found in the Compodoc JSON.
Make sure the component is included in your tsconfig and regenerate the documentation.`,
			},
		};
	}

	return {
		type: 'success',
		data: normalizeComponentDoc(component),
	};
}

/**
 * Get the import statement tag from Compodoc JSDoc comments
 */
export function getImportTag(compodocDoc: CompodocDocObj): string | undefined {
	// Compodoc doesn't have a standard way to specify imports in JSDoc
	// This could be extended to parse @import tags if present in the description
	const description = compodocDoc.rawdescription || compodocDoc.description || '';
	const importMatch = description.match(/@import\s+(.+)/);
	return importMatch?.[1]?.trim();
}

export type { CompodocDocObj, CompodocJson, CompodocResult };
