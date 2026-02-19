import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'pathe';

import {
	findCompodocJson,
	findCompodocJsonFromStoryPaths,
	loadCompodocJson,
	resolveCompodocPath,
} from './compodocReader.js';

const tempDirs: string[] = [];

function createWorkspace(): string {
	const dir = mkdtempSync(path.join(tmpdir(), 'storybook-addon-angular-manifest-'));
	tempDirs.push(dir);
	return dir;
}

function writeCompodocJson(filePath: string) {
	writeFileSync(
		filePath,
		JSON.stringify({
			directives: [],
			components: [],
			pipes: [],
			injectables: [],
			classes: [],
		}),
		'utf-8'
	);
}

afterEach(() => {
	for (const dir of tempDirs.splice(0, tempDirs.length)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe('compodocReader', () => {
	it('resolves relative compodoc paths from cwd', () => {
		const cwd = '/repo/workspace';
		expect(resolveCompodocPath('libs/ui/documentation.json', cwd)).toBe(
			path.resolve(cwd, 'libs/ui/documentation.json')
		);
	});

	it('loads compodoc JSON from explicit relative path', () => {
		const cwd = createWorkspace();
		const compodocPath = path.join(cwd, 'libs/ui/documentation.json');
		mkdirSync(path.dirname(compodocPath), { recursive: true });
		writeCompodocJson(compodocPath);

		const loaded = loadCompodocJson('libs/ui/documentation.json', cwd);
		expect(loaded).toBeTruthy();
		expect(loaded?.components).toEqual([]);
	});

	it('finds compodoc JSON from cwd defaults', () => {
		const cwd = createWorkspace();
		const compodocPath = path.join(cwd, '.compodoc/documentation.json');
		mkdirSync(path.dirname(compodocPath), { recursive: true });
		writeCompodocJson(compodocPath);

		expect(findCompodocJson(cwd)).toBe(compodocPath);
	});

	it('finds project-level compodoc JSON by walking up story paths', () => {
		const cwd = createWorkspace();
		const projectCompodocPath = path.join(
			cwd,
			'libs/tile-selector-modal/documentation.json'
		);
		mkdirSync(path.dirname(projectCompodocPath), { recursive: true });
		writeCompodocJson(projectCompodocPath);

		const storyPath = 'libs/tile-selector-modal/src/lib/tile-selector.stories.ts';
		const found = findCompodocJsonFromStoryPaths([storyPath], cwd);
		expect(found).toBe(projectCompodocPath);
	});

	it('prefers nearest compodoc JSON over workspace root', () => {
		const cwd = createWorkspace();
		const rootCompodocPath = path.join(cwd, 'documentation.json');
		const projectCompodocPath = path.join(cwd, 'libs/button/documentation.json');

		mkdirSync(path.dirname(rootCompodocPath), { recursive: true });
		mkdirSync(path.dirname(projectCompodocPath), { recursive: true });
		writeCompodocJson(rootCompodocPath);
		writeCompodocJson(projectCompodocPath);

		const storyPath = 'libs/button/src/button.stories.ts';
		const found = findCompodocJsonFromStoryPaths([storyPath], cwd);
		expect(found).toBe(projectCompodocPath);
	});
});
