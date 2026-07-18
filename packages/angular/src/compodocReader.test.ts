import { describe, expect, it } from 'vitest';

import { getCompodocForComponent } from './compodocReader.js';
import type { CompodocJson } from './types.js';

describe('getCompodocForComponent', () => {
	it('preserves the component selector in the normalized output', () => {
		const compodocJson: CompodocJson = {
			components: [
				{
					name: 'MyButton',
					selector: 'my-button',
					type: 'component',
					propertiesClass: [],
					inputsClass: [],
					outputsClass: [],
					methodsClass: [],
				},
			],
			directives: [],
			pipes: [],
			injectables: [],
			classes: [],
		};

		const result = getCompodocForComponent('MyButton', compodocJson);

		expect(result.type).toBe('success');
		if (result.type === 'success') {
			expect(result.data.selector).toBe('my-button');
		}
	});
});
