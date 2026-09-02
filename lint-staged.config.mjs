export default {
  'apps/api/**/*.ts': () => [
    'bun run --cwd apps/api typecheck',
    'bun run --cwd apps/api lint',
  ],
  'apps/web/**/*.{ts,tsx,astro}': () => [
    'bun run --cwd apps/web typecheck',
    'bun run --cwd apps/web lint',
  ],
};
