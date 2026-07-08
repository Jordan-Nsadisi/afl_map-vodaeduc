import { defineConfig } from 'vite'

export default defineConfig({
  // Base relative obligatoire pour un bon fonctionnement dans une iframe
  // depuis un sous-dossier Moodle (sans path absolu racine).
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
  }
})
