import { defineConfig } from 'vite';

// GitHub Pages serveix l'app des d'una subcarpeta (/monopoly-trrj/), per això els camins són relatius.
export default defineConfig({
  base: './',
  build: { outDir: 'dist' },
});
