'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { parseArgs, applyConfig, inject, bundleFiles, makeApplication, validateHtml, main, FEATURES } = require('../dompile');

async function tempDir(t, prefix = 'dompile-test-') {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('1. parses modes, aliases, options, and repeatable template values', () => {
  const opts = parseArgs(['-h', 'page.html', 'site.css', '--output', 'out/page.dtml', '-D', 'TITLE=Hi']);
  assert.deepEqual(opts.files, ['site.css']);
  assert.equal(opts.mode, '-h');
  assert.equal(opts.output, 'out/page.dtml');
  assert.deepEqual(opts.defines, { TITLE: 'Hi' });
  assert.equal(parseArgs(['--version']).version, true);
  assert.equal(parseArgs(['--features']).listFeatures, true);
  assert.equal(FEATURES.length, 100);
});

test('2. rejects invalid arguments and conflicting modes', () => {
  assert.throws(() => parseArgs(['--wat']), /Unknown option/);
  assert.throws(() => parseArgs(['-h', 'a.html', '--website', 'b.dtml']), /Only one mode/);
  assert.throws(() => parseArgs(['-h', 'a.html', '-o', 'a.dtml', '--output', 'b.dtml']), /only once/);
  assert.throws(() => parseArgs(['-h', 'a.html', '-D', '9BAD=x']), /Invalid template/);
  assert.throws(() => parseArgs(['--check']), /requires a DTML file/);
});

test('3. injects style and script in the right places and safely handles missing wrappers', () => {
  const html = inject('<html><body><h1>Hi</h1>', ['h1 { color: red }'], ['window.ready = true;']);
  assert.match(html, /<head>[\s\S]*<style>[\s\S]*color: red[\s\S]*<\/head>/);
  assert.match(html, /<script>[\s\S]*window\.ready = true;[\s\S]*<\/script>/);
  const escaped = inject('', ['x::after{content:"</style>"}'], ['const x="</script>";']);
  assert.match(escaped, /<!doctype html>/i);
  assert.match(escaped, /<\\\/style>/);
  assert.match(escaped, /<\\\/script>/);
});

test('4. bundles explicit HTML, CSS, and JavaScript into nested output paths', async t => {
  const dir = await tempDir(t);
  const html = path.join(dir, 'index.html'), css = path.join(dir, 'page.css'), js = path.join(dir, 'app.js');
  await fs.writeFile(html, '<html><head></head><body></body></html>');
  await fs.writeFile(css, 'body { color: blue; }');
  await fs.writeFile(js, 'window.ready = true;');
  const out = path.join(dir, 'dist', 'page.dtml');
  await bundleFiles([html, css, js], out);
  const result = await fs.readFile(out, 'utf8');
  assert.match(result, /body \{ color: blue; \}/);
  assert.match(result, /window\.ready = true;/);
});

test('5. inlines local linked stylesheets and classic scripts', async t => {
  const dir = await tempDir(t);
  await fs.mkdir(path.join(dir, 'assets'));
  const html = path.join(dir, 'index.html');
  await fs.writeFile(html, '<html><head><link rel="stylesheet" href="assets/site.css"></head><body><script src="assets/site.js"></script></body></html>');
  await fs.writeFile(path.join(dir, 'assets/site.css'), 'h1 { color: rebeccapurple; }');
  await fs.writeFile(path.join(dir, 'assets/site.js'), 'window.loaded = true;');
  const out = path.join(dir, 'single.dtml');
  await bundleFiles([html], out);
  const result = await fs.readFile(out, 'utf8');
  assert.match(result, /h1 \{ color: rebeccapurple; \}/);
  assert.match(result, /window\.loaded = true;/);
  assert.doesNotMatch(result, /assets\/site\.(?:css|js)/);
});

test('6. expands local CSS imports and embeds referenced image bytes', async t => {
  const dir = await tempDir(t);
  await fs.mkdir(path.join(dir, 'assets'));
  await fs.writeFile(path.join(dir, 'index.html'), '<html><head><link rel="stylesheet" href="assets/main.css"></head><body></body></html>');
  await fs.writeFile(path.join(dir, 'assets/main.css'), '@import "theme.css";\n.hero { background: url("pixel.png"); }');
  await fs.writeFile(path.join(dir, 'assets/theme.css'), '.theme { color: teal; }');
  await fs.writeFile(path.join(dir, 'assets/pixel.png'), Buffer.from([137, 80, 78, 71]));
  const out = path.join(dir, 'bundle.dtml');
  await bundleFiles([path.join(dir, 'index.html')], out);
  const result = await fs.readFile(out, 'utf8');
  assert.match(result, /\.theme \{ color: teal; \}/);
  assert.match(result, /data:image\/png;base64,iVBORw==/);
});

test('7. embeds local media and safely substitutes HTML template values', async t => {
  const dir = await tempDir(t);
  const html = path.join(dir, 'index.html');
  await fs.writeFile(path.join(dir, 'pixel.png'), Buffer.from([1, 2, 3]));
  await fs.writeFile(html, '<html><head><title>{{TITLE}}</title></head><body><img src="pixel.png" srcset="pixel.png 1x"></body></html>');
  const out = path.join(dir, 'bundle.dtml');
  await bundleFiles([html], out, { defines: { TITLE: '<Hello & goodbye>' }, strict: true });
  const result = await fs.readFile(out, 'utf8');
  assert.match(result, /&lt;Hello &amp; goodbye&gt;/);
  assert.equal((result.match(/data:image\/png;base64,AQID/g) || []).length, 2);
  await assert.rejects(bundleFiles([html], path.join(dir, 'strict.dtml'), { strict: true }), /No value provided/);
});

test('8. validates structure, IDs, links, accessibility, and strict warnings', () => {
  const result = validateHtml('<!doctype html><html lang="en"><head><title>Page</title></head><body><img src="a.png"><a href="#missing" target="_blank">go</a></body></html>');
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(message => /does not exist/.test(message)));
  assert.ok(result.warnings.some(message => /alt attribute/.test(message)));
  assert.ok(result.warnings.some(message => /noopener/.test(message)));
  assert.equal(validateHtml('<!doctype html><html lang="en"><head><title>Ok</title></head><body></body></html>').valid, true);
});

test('9. merges validated config defaults and protects outputs in dry-run/no-clobber modes', async t => {
  const dir = await tempDir(t);
  const config = path.join(dir, 'dompile.json');
  await fs.writeFile(config, JSON.stringify({ output: 'from-config.dtml', quiet: true, defines: { A: 'config', B: 'two' } }));
  const opts = await applyConfig(parseArgs(['-h', 'page.html', '-D', 'A=cli', '--config', config, '--output', 'from-cli.dtml']));
  assert.equal(opts.output, 'from-cli.dtml');
  assert.equal(opts.quiet, true);
  assert.deepEqual(opts.defines, { A: 'cli', B: 'two' });
  const input = path.join(dir, 'index.html'), existing = path.join(dir, 'existing.dtml');
  await fs.writeFile(input, '<html></html>');
  await fs.writeFile(existing, 'keep');
  await assert.rejects(main(['-h', input, '--output', existing, '--no-clobber']), /already exists/);
  assert.equal(await fs.readFile(existing, 'utf8'), 'keep');
  await main(['-h', input, '--output', path.join(dir, 'dry.dtml'), '--dry-run', '--quiet']);
  await assert.rejects(fs.access(path.join(dir, 'dry.dtml')));
});

test('10. creates hardened Electron projects and exports DTML as HTML', async t => {
  const dir = await tempDir(t);
  const source = path.join(dir, 'page.dtml');
  const contents = '<!doctype html><html><body>app</body></html>\n';
  await fs.writeFile(source, contents);
  const app = path.join(dir, 'desktop-app');
  await makeApplication(source, app);
  const mainFile = await fs.readFile(path.join(app, 'main.js'), 'utf8');
  const packageJson = JSON.parse(await fs.readFile(path.join(app, 'package.json'), 'utf8'));
  assert.match(mainFile, /contextIsolation: true/);
  assert.match(mainFile, /nodeIntegration: false/);
  assert.match(mainFile, /sandbox: true/);
  assert.equal(packageJson.scripts.start, 'electron .');
  const website = path.join(dir, 'dist', 'index.html');
  await main(['--website', source, '--output', website]);
  assert.equal(await fs.readFile(website, 'utf8'), contents);
});
