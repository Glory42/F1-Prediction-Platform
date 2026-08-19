export default {
  'apps/api/**/*.ts': () => 'bun run --cwd apps/api typecheck',
  'apps/web/**/*.{ts,tsx,astro}': () => 'bun run --cwd apps/web typecheck',
};
