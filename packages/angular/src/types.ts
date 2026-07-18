/**
 * Compodoc type definitions for Angular component documentation.
 * These types represent the structure of Compodoc's JSON output.
 */

export interface Method {
	name: string;
	args: Argument[];
	returnType: string;
	decorators?: Decorator[];
	description?: string;
	rawdescription?: string;
}

export interface JsDocTag {
	comment?: string;
	tagName?: {
		escapedText?: string;
	};
}

export interface Property {
	name: string;
	decorators?: Decorator[];
	type: string;
	optional: boolean;
	defaultValue?: string;
	description?: string;
	rawdescription?: string;
	jsdoctags?: JsDocTag[];
}

export interface Class {
	name: string;
	ngname: string;
	type: 'pipe';
	properties: Property[];
	methods: Method[];
	description?: string;
	rawdescription?: string;
}

export interface Injectable {
	name: string;
	type: 'injectable';
	properties: Property[];
	methods: Method[];
	description?: string;
	rawdescription?: string;
}

export interface Pipe {
	name: string;
	type: 'class';
	properties: Property[];
	methods: Method[];
	description?: string;
	rawdescription?: string;
}

export interface Directive {
	name: string;
	selector?: string;
	type: 'directive' | 'component';
	propertiesClass: Property[];
	inputsClass: Property[];
	outputsClass: Property[];
	methodsClass: Method[];
	description?: string;
	rawdescription?: string;
}

export type Component = Directive;

export interface Argument {
	name: string;
	type: string;
	optional?: boolean;
}

export interface Decorator {
	name: string;
}

export interface TypeAlias {
	name: string;
	ctype: string;
	subtype: string;
	rawtype: string;
	file: string;
	kind: number;
	description?: string;
	rawdescription?: string;
}

export interface EnumType {
	name: string;
	childs: EnumTypeChild[];
	ctype: string;
	subtype: string;
	file: string;
	description?: string;
	rawdescription?: string;
}

export interface EnumTypeChild {
	name: string;
	value?: string;
}

export interface CompodocJson {
	directives: Directive[];
	components: Component[];
	pipes: Pipe[];
	injectables: Injectable[];
	classes: Class[];
	miscellaneous?: {
		typealiases?: TypeAlias[];
		enumerations?: EnumType[];
	};
}

/**
 * Compodoc documentation data structure representing a component's metadata.
 * This is used in the manifest to provide prop information for Angular components.
 */
export interface CompodocDocObj {
	name: string;
	selector?: string;
	description?: string;
	rawdescription?: string;
	file?: string;
	type: 'component' | 'directive' | 'pipe' | 'injectable' | 'class';
	inputs: Array<{
		name: string;
		type: string;
		description?: string;
		rawdescription?: string;
		defaultValue?: string;
		optional: boolean;
	}>;
	outputs: Array<{
		name: string;
		type: string;
		description?: string;
		rawdescription?: string;
	}>;
	properties: Array<{
		name: string;
		type: string;
		description?: string;
		rawdescription?: string;
		defaultValue?: string;
		optional: boolean;
	}>;
	methods: Array<{
		name: string;
		description?: string;
		rawdescription?: string;
		args: Array<{ name: string; type: string; optional?: boolean }>;
		returnType: string;
	}>;
}

export type CompodocResult =
	| { type: 'success'; data: CompodocDocObj }
	| { type: 'error'; error: { name: string; message: string } };
