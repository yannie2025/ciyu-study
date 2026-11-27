const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { buildSync } = require('esbuild');

const root = join(__dirname, '..');
const outDir = join(root, 'preview', 'dist');
mkdirSync(outDir, { recursive: true });

buildSync({
  absWorkingDir: root,
  entryPoints: ['preview/main.ts'],
  outfile: join(outDir, 'preview.js'),
  bundle: true,
  format: 'iife',
  target: 'chrome116',
  sourcemap: true,
});

console.log('Preview bundle built -> preview/index.html');
