import type { CsfFile } from 'storybook/internal/csf-tools';
import type { CompodocDocObj } from './compodocReader.js';

export interface GenerateAngularSnippetOptions {
	selectorPrefix?: string;
}

/**
 * Generate an Angular template snippet from story args
 *
 * For Angular, we generate template-based snippets showing how to use the component
 * in an Angular template context.
 */
export function generateAngularSnippet(
	csf: CsfFile,
	storyName: string,
	componentName: string | undefined,
	compodocDoc: CompodocDocObj | undefined,
	options: GenerateAngularSnippetOptions = {}
): string {
	if (!componentName) {
		return `// Unable to generate snippet: component name not found`;
	}

	// Get the story's args from the CSF
	const storyNode = csf._stories[storyName];
	const metaArgs = getArgsFromNode(csf._metaNode);
	const storyArgs = storyNode ? getArgsFromStory(csf, storyName) : {};
	const mergedArgs = { ...metaArgs, ...storyArgs };

	// Generate the selector
	const selector = getSelector(
		componentName,
		compodocDoc,
		options.selectorPrefix
	);

	// Build the template attributes
	const attrs = buildTemplateAttributes(mergedArgs, compodocDoc);
	const attrsString = attrs.length > 0 ? ` ${attrs.join(' ')}` : '';

	// Check if there are children/content
	const hasChildren = 'children' in mergedArgs || 'content' in mergedArgs;
	const childContent = mergedArgs.children || mergedArgs.content || '';

	if (hasChildren && childContent) {
		return `<${selector}${attrsString}>${childContent}</${selector}>`;
	}

	return `<${selector}${attrsString}></${selector}>`;
}

/**
 * Get the Angular selector for a component
 */
function getSelector(
	componentName: string,
	compodocDoc: CompodocDocObj | undefined,
	selectorPrefix?: string
): string {
	// If Compodoc has the selector, use it
	if (compodocDoc?.selector) {
		return compodocDoc.selector;
	}

	// Convert PascalCase to kebab-case
	const nameWithoutComponent = componentName.replace(/Component$/, '');
	const kebabCase = nameWithoutComponent
		.replace(/([a-z])([A-Z])/g, '$1-$2')
		.replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
		.toLowerCase();

	const normalizedPrefix = selectorPrefix?.trim();
	if (normalizedPrefix) {
		return `${normalizedPrefix}-${kebabCase}`;
	}

	return kebabCase;
}

/**
 * Build Angular template attributes from args
 */
function buildTemplateAttributes(
	args: Record<string, unknown>,
	compodocDoc: CompodocDocObj | undefined
): string[] {
	const attrs: string[] = [];
	const inputs = new Set(compodocDoc?.inputs?.map((i) => i.name) ?? []);
	const outputs = new Set(compodocDoc?.outputs?.map((o) => o.name) ?? []);

	for (const [key, value] of Object.entries(args)) {
		// Skip children/content as they go inside the element
		if (key === 'children' || key === 'content') {
			continue;
		}

		// Skip functions that look like event handlers
		if (typeof value === 'function') {
			if (outputs.has(key) || key.startsWith('on')) {
				// Output binding
				const eventName = key.startsWith('on')
					? key.slice(2).toLowerCase()
					: key;
				attrs.push(`(${eventName})="handleEvent($event)"`);
			}
			continue;
		}

		// Determine if this is an input property
		const isInput = inputs.has(key) || !outputs.has(key);

		if (isInput) {
			const attrValue = formatAttributeValue(key, value);
			if (attrValue !== null) {
				attrs.push(attrValue);
			}
		}
	}

	return attrs;
}

/**
 * Format an attribute value for Angular template syntax
 */
function formatAttributeValue(key: string, value: unknown): string | null {
	if (value === undefined || value === null) {
		return null;
	}

	// Boolean true - just the attribute name
	if (value === true) {
		return key;
	}

	// Boolean false - property binding
	if (value === false) {
		return `[${key}]="false"`;
	}

	// String - regular attribute
	if (typeof value === 'string') {
		return `${key}="${escapeHtml(value)}"`;
	}

	// Number - property binding
	if (typeof value === 'number') {
		return `[${key}]="${value}"`;
	}

	// Object or array - property binding with JSON
	if (typeof value === 'object') {
		const jsonValue = JSON.stringify(value).replace(/"/g, "'");
		return `[${key}]="${jsonValue}"`;
	}

	return null;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/**
 * Extract args from the meta node
 */
function getArgsFromNode(metaNode: any): Record<string, unknown> {
	if (!metaNode || typeof metaNode !== 'object') {
		return {};
	}

	const args: Record<string, unknown> = {};

	// Find the args property in the meta object
	if (metaNode.properties) {
		for (const prop of metaNode.properties) {
			if (prop.key?.name === 'args' && prop.value?.properties) {
				for (const argProp of prop.value.properties) {
					if (argProp.key?.name && argProp.value) {
						args[argProp.key.name] = evaluateNode(argProp.value);
					}
				}
			}
		}
	}

	return args;
}

/**
 * Extract args from a story
 */
function getArgsFromStory(
	csf: CsfFile,
	storyName: string
): Record<string, unknown> {
	const args: Record<string, unknown> = {};

	// Try to get args from the story's declaration
	// Using `any` cast because _storyDeclarationPath is an internal property
	const storyDecl = (csf as any)._storyDeclarationPath?.[storyName];
	if (!storyDecl) {
		return args;
	}

	// Navigate to find the args object
	const node = storyDecl.node as any;
	if (!node) {
		return args;
	}

	// Handle VariableDeclarator
	const init = node.init || node;

	// Handle object expression (StoryObj)
	if (init?.properties) {
		for (const prop of init.properties) {
			if (prop.key?.name === 'args' && prop.value?.properties) {
				for (const argProp of prop.value.properties) {
					if (argProp.key?.name && argProp.value) {
						args[argProp.key.name] = evaluateNode(argProp.value);
					}
				}
			}
		}
	}

	return args;
}

/**
 * Evaluate a simple AST node to a JavaScript value
 */
function evaluateNode(node: any): unknown {
	if (!node) return undefined;

	switch (node.type) {
		case 'StringLiteral':
			return node.value;
		case 'NumericLiteral':
			return node.value;
		case 'BooleanLiteral':
			return node.value;
		case 'NullLiteral':
			return null;
		case 'Identifier':
			if (node.name === 'undefined') return undefined;
			// Return a placeholder for other identifiers (like fn())
			return `{{${node.name}}}`;
		case 'ArrayExpression':
			return node.elements?.map(evaluateNode) ?? [];
		case 'ObjectExpression':
			return Object.fromEntries(
				(node.properties ?? [])
					.filter((p: any) => p.key?.name || p.key?.value)
					.map((p: any) => [p.key.name || p.key.value, evaluateNode(p.value)])
			);
		case 'CallExpression':
			// For function calls like fn(), return a placeholder
			return `{{function}}`;
		default:
			return undefined;
	}
}
