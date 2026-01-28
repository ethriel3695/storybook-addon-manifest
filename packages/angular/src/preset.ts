/**
 * Storybook preset for Angular component manifest generation.
 *
 * This preset exports the experimental_manifests function that generates
 * component manifests for Angular components using Compodoc documentation.
 *
 * Usage in .storybook/main.js:
 * ```js
 * export default {
 *   addons: [
 *     'storybook-addon-angular-manifest',
 *     '@storybook/addon-docs',
 *     '@storybook/addon-mcp',
 *   ],
 * };
 * ```
 */
export { manifests as experimental_manifests } from './generator.js';
