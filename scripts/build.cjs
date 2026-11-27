const { mkdirSync, readFileSync, writeFileSync, copyFileSync, cpSync } = require('node:fs');
const { join, extname } = require('node:path');
const { execFileSync } = require('node:child_process');
const { buildSync } = require('esbuild');

const project = join(__dirname, '..');
const output = process.argv[2] || join(project, 'dist', 'ciyu-study');
const runtime = ['core.js', 'model.js', 'dictionaries.js', 'system-lookup.js', 'main.js', 'forms.js', 'notes.js', 'exam-import.js', 'cet6-catalog.js', 'ui.js', 'settings-ui.js'];
const code = runtime.map(file =>
  '// src/' + file + '\n' + readFileSync(join(project, 'src', file), 'utf8'),
).join('\n');
const bundle = buildSync({
  absWorkingDir: project,
  entryPoints: ['src/ciyu-ui/index.ts'],
  outfile: 'ciyu-ui.js',
  write: false,
  bundle: true,
  format: 'iife',
  globalName: 'CiyuUI',
  target: 'chrome116',
}).outputFiles;
const bundled = extension => bundle.find(file => extname(file.path) === extension).text;
mkdirSync(output, { recursive: true });
writeFileSync(join(output, 'main.js'), "'use strict';\n" + bundled('.js') + '\n' + code);
writeFileSync(join(output, 'styles.css'), bundled('.css') + '\n' + readFileSync(join(project, 'styles.css'), 'utf8'));
for (const file of ['manifest.json', 'LICENSE', 'THIRD-PARTY-NOTICES.txt']) copyFileSync(join(project, file), join(output, file));

cpSync(join(project, 'dictionaries'), join(output, 'dictionaries'), { recursive: true });

if (process.platform === 'darwin') {
  const native = join(output, 'native');
  mkdirSync(native, { recursive: true });
  execFileSync('xcrun', ['clang', '-arch', 'arm64', '-arch', 'x86_64', '-mmacosx-version-min=11.0',
    '-Os', '-fobjc-arc', '-framework', 'AppKit', join(project, 'native', 'youdao-service.m'),
    '-o', join(native, 'youdao-service')], { stdio: 'inherit' });
  execFileSync('xcrun', ['clang', '-arch', 'arm64', '-arch', 'x86_64', '-mmacosx-version-min=11.0',
    '-Os', '-fobjc-arc', '-framework', 'AppKit', '-framework', 'PDFKit', '-framework', 'Vision',
    join(project, 'native', 'exam-ocr.m'), '-o', join(native, 'exam-ocr')], { stdio: 'inherit' });
  execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', join(native, 'exam-ocr')], { stdio: 'inherit' });
  execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', join(native, 'youdao-service')], { stdio: 'inherit' });
}
