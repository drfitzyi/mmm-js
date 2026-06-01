import { defineConfig } from 'vite';

// GitHub Pages project sites are served from https://<user>.github.io/<repo>/,
// so the production base must match the repo name. Dev/preview use '/'.
// Override with `VITE_BASE` if the repo is renamed or served elsewhere.
const repoBase = process.env.VITE_BASE ?? '/mmm-js/';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? repoBase : '/',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  worker: {
    format: 'es',
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
  },
}));
