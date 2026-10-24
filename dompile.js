#!/usr/bin/env node
'use strict';

// Dompile v1: dependency-free CLI that packages web source into portable DTML.
const fs = require('node:fs/promises');
const path = require('node:path');
const { version } = require('./package.json');

const HELP = `Dompile — package HTML, CSS, and JavaScript as one .dtml file

Usage:
  dompile -h <file.html> [file.css ...] [file.js ...] [-o output.dtml]
  dompile -w <https://site.example/> [-o output.dtml]
  dompile --website <file.dtml> [-o output.html]
  dompile --application <file.dtml> [-o output-directory]
  dompile --check <file.dtml> [--json]
  dompile -h page.html --define TITLE="Example Page"
  dompile --version
  dompile --features
  dompile -h page.html --config dompile.json
  dompile --help

Options:
  -h              Bundle local HTML/CSS/JS source files into DTML.
  -w              Download a page and bundle supported linked assets.
  --website       Emit browser-ready HTML from a DTML file.
  --application   Generate a minimal Electron app from a DTML file.
  --check         Validate basic DTML/HTML document structure.
  --version       Print the Dompile version.
  --features      List supported features.
  --strict        Treat validation warnings as errors.
  --json          Format validation output as JSON.
  --quiet         Suppress successful operation messages.
  --verbose       Print additional operation details.
  --stats         Report generated output size and elapsed time.
  --no-clobber    Fail if the selected output already exists.
  --config <file> Load defaults from a JSON config file.
  --max-asset-size <bytes> Limit each embedded local asset (default 10485760).
  --define KEY=VALUE Set a template variable (repeatable; use {{KEY}} in HTML).
  -o, --output <path> Set output file or directory.
`;

const FEATURES = [
  'HTML and HTM document input', 'CSS input bundling', 'JavaScript input bundling',
  'MJS input bundling', 'multiple stylesheet inputs', 'multiple script inputs',
  'automatic local stylesheet inlining', 'automatic local classic script inlining',
  'CSS injection into document head', 'JavaScript injection before document end',
  'minimal HTML skeleton generation', 'inline style end-tag escaping',
  'inline script end-tag escaping', 'website download over HTTP',
  'website download over HTTPS', 'HTTP redirect following', 'remote stylesheet inlining',
  'remote classic script inlining', 'relative HTML URL absolutizing',
  'CSS URL absolutizing for downloaded stylesheets', 'static website HTML output',
  'Electron app project output', 'hardened Electron renderer defaults',
  'nested output directory creation', 'version reporting', 'feature listing',
  'DTML structure validation', 'JSON validation output', 'strict validation mode',
  'quiet mode', 'verbose mode', 'custom output paths', 'help text',
  'unsupported extension diagnostics', 'missing source diagnostics',
  'dry-run mode', 'UTF-8 source handling', 'HTML doctype warnings',
  'HTML language warnings', 'HTML title warnings', 'unclosed-tag diagnostics',
  'unexpected-close-tag diagnostics', 'mismatched-nesting diagnostics',
  'duplicate-id diagnostics', 'HTML template variables',
  'safe HTML escaping for template values', 'strict missing-template-variable errors',
  'config-file output defaults', 'config-file validation', 'per-asset byte limits',
  'CSS @import expansion', 'CSS import cycle detection', 'CSS media query import wrapping',
  'CSS local asset data URIs', 'PNG asset embedding', 'JPEG asset embedding',
  'GIF asset embedding', 'WebP asset embedding', 'AVIF asset embedding',
  'SVG asset embedding', 'icon asset embedding', 'WOFF font embedding',
  'WOFF2 font embedding', 'TrueType font embedding', 'OpenType font embedding',
  'EOT font embedding', 'local image source embedding', 'local video source embedding',
  'local audio source embedding', 'local poster embedding', 'local responsive srcset embedding'
  , 'missing HTML root error', 'missing document head warning', 'missing document body warning',
  'missing image alt warnings', 'unresolved fragment-link errors', 'external dependency warnings',
  'new-window rel security warnings', 'deprecated HTML element warnings', 'inline event handler warnings',
  'empty link target warnings', 'empty document title checks', 'duplicate fragment identifier checks',
  'document structure diagnostics in text mode', 'validation diagnostics in JSON mode',
  'CLI configuration file support', 'CLI configuration precedence', 'command option conflict diagnostics',
  'single-mode enforcement', 'single-output-option enforcement', 'repeatable template definitions',
  'validated template variable names', 'CLI output parent directory creation',
  'user-selected Electron output directory', 'Electron macOS activation recovery',
  'Electron minimum window dimensions', 'Electron generated npm start command',
  'long-form output path alias', 'output collision prevention',
  'generated file size reporting'
];

function parseArgs(argv) {
  const o = { files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help') { o.help = true; continue; }
    if (a === '--version') { o.version = true; continue; }
    if (a === '--features') { o.listFeatures = true; continue; }
    if (a === '--quiet') { o.quiet = true; continue; }
    if (a === '--verbose') { o.verbose = true; continue; }
    if (a === '--stats') { o.stats = true; continue; }
    if (a === '--no-clobber') { o.noClobber = true; continue; }
    if (a === '--json') { o.json = true; continue; }
    if (a === '--strict') { o.strict = true; continue; }
    if (a === '--dry-run') { o.dryRun = true; continue; }
    if (a === '--max-asset-size') {
      const value = Number(argv[++i]);
      if (!Number.isSafeInteger(value) || value < 1) throw new Error('--max-asset-size requires a positive integer byte count.');
      o.maxAssetSize = value;
      continue;
    }
    if (a === '--config') {
      o.configFile = argv[++i];
      if (!o.configFile || o.configFile.startsWith('-')) throw new Error('--config requires a JSON file path.');
      continue;
    }
    if (a === '--define' || a === '-D') {
      const assignment = argv[++i];
      const split = assignment?.indexOf('=') ?? -1;
      if (split < 1) throw new Error(`${a} requires KEY=VALUE.`);
      const key = assignment.slice(0, split);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`Invalid template variable name: ${key}`);
      o.defines ||= {};
      o.defines[key] = assignment.slice(split + 1);
      continue;
    }
    if (a === '--check') {
      if (o.mode) throw new Error('--check cannot be combined with a build mode.');
      o.mode = '--check';
      o.input = argv[++i];
      if (!o.input || o.input.startsWith('-')) throw new Error('--check requires a DTML file.');
      continue;
    }
    if (a === '-o' || a === '--output') {
      if (o.output) throw new Error('Use -o only once.');
      o.output = argv[++i];
      if (!o.output || o.output.startsWith('-')) throw new Error('-o requires a path.');
      continue;
    }
    if (['-h', '-w', '--website', '--application'].includes(a)) {
      if (o.mode) throw new Error(`Only one mode can be selected (got ${a}).`);
      o.mode = a;
      o.input = argv[++i];
      if (!o.input || o.input.startsWith('-')) throw new Error(`${a} requires an input.`);
      continue;
    }
    if (a.startsWith('-')) throw new Error(`Unknown option: ${a}`);
    o.files.push(a);
  }
  if (o.help || o.version || o.listFeatures) return o;
  if (!o.mode) throw new Error('Choose a mode: -h, -w, --website, or --application.');
  if (o.mode !== '-h' && o.files.length) throw new Error(`Extra inputs are only supported with -h: ${o.files.join(', ')}`);
  return o;
}

function safeInline(code, tag) {
  // Prevent source text from terminating the surrounding raw-text HTML element.
  return code.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`);
}

function skeleton() {
  return '<!doctype html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>\n';
}

function inject(html, cssChunks, jsChunks) {
  let out = html || skeleton();
  const css = cssChunks.filter(Boolean).join('\n\n');
  const js = jsChunks.filter(Boolean).join('\n\n');
  if (css) {
    const tag = `<style>\n${safeInline(css, 'style')}\n</style>`;
    if (/<\/head\s*>/i.test(out)) out = out.replace(/<\/head\s*>/i, `${tag}\n</head>`);
    else if (/<html\b[^>]*>/i.test(out)) out = out.replace(/<html\b[^>]*>/i, '$&\n<head>\n' + tag + '\n</head>');
    else out = `${tag}\n${out}`;
  }
  if (js) {
    const tag = `<script>\n${safeInline(js, 'script')}\n</script>`;
    if (/<\/body\s*>/i.test(out)) out = out.replace(/<\/body\s*>/i, `${tag}\n</body>`);
    else out += `\n${tag}\n`;
  }
  return out;
}

async function readUtf8(file) {
  try { return await fs.readFile(file, 'utf8'); }
  catch (e) { throw new Error(`Cannot read ${file}: ${e.message}`); }
}

async function applyConfig(opts) {
  if (!opts.configFile) return opts;
  let config;
  try { config = JSON.parse(await readUtf8(opts.configFile)); }
  catch (e) { throw new Error(`Invalid config ${opts.configFile}: ${e.message}`); }
  const allowed = new Set(['output', 'quiet', 'verbose', 'json', 'strict', 'maxAssetSize', 'defines']);
  for (const key of Object.keys(config)) if (!allowed.has(key)) throw new Error(`Unsupported config key: ${key}`);
  if (config.maxAssetSize !== undefined && (!Number.isSafeInteger(config.maxAssetSize) || config.maxAssetSize < 1)) throw new Error('Config maxAssetSize must be a positive integer.');
  for (const key of ['quiet', 'verbose', 'json', 'strict']) if (config[key] !== undefined && typeof config[key] !== 'boolean') throw new Error(`Config ${key} must be true or false.`);
  if (config.defines !== undefined && (!config.defines || typeof config.defines !== 'object' || Array.isArray(config.defines) || Object.keys(config.defines).some(key => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof config.defines[key] !== 'string'))) throw new Error('Config defines must map valid variable names to strings.');
  return { ...config, ...opts, output: opts.output || config.output, quiet: opts.quiet || config.quiet, verbose: opts.verbose || config.verbose, strict: opts.strict || config.strict, json: opts.json || config.json, maxAssetSize: opts.maxAssetSize || config.maxAssetSize, defines: { ...(config.defines || {}), ...(opts.defines || {}) } };
}

function validateHtml(source) {
  const errors = [], warnings = [];
  const html = source.replace(/<!--[\s\S]*?-->/g, '');
  if (!/<html\b/i.test(html)) errors.push('Document has no <html> root element.');
  if (!/<head\b/i.test(html)) warnings.push('Document has no <head> element.');
  if (!/<body\b/i.test(html)) warnings.push('Document has no <body> element.');
  const voids = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  const optional = new Set(['li', 'p', 'dt', 'dd', 'option', 'tr', 'td', 'th', 'thead', 'tbody']);
  const stack = [];
  for (const match of html.matchAll(/<\/?([a-z][\w:-]*)\b[^>]*>/gi)) {
    const token = match[0], name = match[1].toLowerCase();
    if (token.startsWith('</')) {
      const at = stack.lastIndexOf(name);
      if (at < 0) errors.push(`Unexpected closing tag </${name}>.`);
      else {
        for (const opened of stack.slice(at + 1)) if (!optional.has(opened)) errors.push(`Tag <${opened}> is closed by </${name}>.`);
        stack.splice(at);
      }
    } else if (!voids.has(name) && !/\/\s*>$/.test(token)) stack.push(name);
  }
  for (const name of stack) if (!optional.has(name)) errors.push(`Unclosed tag <${name}>.`);
  if (!/^\s*<!doctype\s+html\s*>/i.test(source)) warnings.push('Document does not declare <!doctype html>.');
  if (!/<html\b[^>]*\blang\s*=/i.test(source)) warnings.push('HTML element has no lang attribute.');
  if (!/<title\b[^>]*>\s*[^<]/i.test(source)) warnings.push('Document has no non-empty title.');
  const ids = new Set();
  for (const match of source.matchAll(/\bid\s*=\s*(["'])(.*?)\1/gi)) {
    if (ids.has(match[2])) errors.push(`Duplicate id "${match[2]}".`);
    ids.add(match[2]);
  }
  for (const match of source.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi)) {
    const tag = match[1].toLowerCase(), attrs = match[2];
    if (tag === 'img' && !/\balt\s*=/i.test(attrs)) warnings.push('Image has no alt attribute.');
    if (['center', 'font', 'marquee', 'big', 'strike'].includes(tag)) warnings.push(`Deprecated element <${tag}>.`);
    if (/\bon[a-z]+\s*=/i.test(attrs)) warnings.push(`Inline event handler found on <${tag}>.`);
    if (/\btarget\s*=\s*["']?_blank\b/i.test(attrs) && !/\brel\s*=\s*["'][^"']*\bnoopener\b/i.test(attrs)) warnings.push('target="_blank" link should include rel="noopener".');
    if (tag === 'a') {
      const href = (attrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i) || []).slice(1).find(v => v !== undefined);
      if (href === '') warnings.push('Link has an empty href attribute.');
      if (href && href.startsWith('#') && href.length > 1 && !ids.has(href.slice(1))) errors.push(`Link target "${href}" does not exist.`);
    }
    if (/(?:src|href|poster)\s*=\s*["']https?:\/\//i.test(attrs)) warnings.push('Document references an external URL.');
  }
  return { valid: errors.length === 0, errors, warnings };
}

async function writeFile(output, contents) {
  await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await fs.writeFile(output, contents, 'utf8');
}

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.wav': 'audio/wav'
};

async function processCss(source, baseDir, active = new Set(), maxAssetSize = 10 * 1024 * 1024) {
  let output = source;
  const imports = [...output.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?\s*([^;]*);/gi)].reverse();
  for (const match of imports) {
    const ref = match[1].trim();
    if (/^(?:[a-z]+:|\/\/|#|data:)/i.test(ref)) continue;
    const file = path.resolve(baseDir, decodeURIComponent(ref.split(/[?#]/, 1)[0]));
    if (active.has(file)) { output = output.slice(0, match.index) + '/* Dompile: cyclic CSS import omitted */' + output.slice(match.index + match[0].length); continue; }
    let nested;
    try { nested = await fs.readFile(file, 'utf8'); }
    catch (e) { throw new Error(`Could not read CSS import ${ref}: ${e.message}`); }
    const nextActive = new Set(active); nextActive.add(file);
    nested = await processCss(nested, path.dirname(file), nextActive, maxAssetSize);
    const media = match[2].trim();
    const replacement = media ? `@media ${media} {\n${nested}\n}` : nested;
    output = output.slice(0, match.index) + replacement + output.slice(match.index + match[0].length);
  }
  const urls = [...output.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)].reverse();
  for (const match of urls) {
    const ref = match[2].trim();
    if (!ref || /^(?:[a-z]+:|\/\/|#|data:)/i.test(ref)) continue;
    const file = path.resolve(baseDir, decodeURIComponent(ref.split(/[?#]/, 1)[0]));
    let buffer;
    try { buffer = await fs.readFile(file); }
    catch (e) { throw new Error(`Could not read CSS asset ${ref}: ${e.message}`); }
    if (buffer.length > maxAssetSize) throw new Error(`CSS asset ${ref} is ${buffer.length} bytes, above the ${maxAssetSize}-byte limit.`);
    const mime = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const replacement = `url("data:${mime};base64,${buffer.toString('base64')}")`;
    output = output.slice(0, match.index) + replacement + output.slice(match.index + match[0].length);
  }
  return output;
}

async function dataUriFor(file, maxAssetSize) {
  const buffer = await fs.readFile(file);
  if (buffer.length > maxAssetSize) throw new Error(`Asset ${file} is ${buffer.length} bytes, above the ${maxAssetSize}-byte limit.`);
  const mime = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

async function inlineHtmlMedia(html, baseDir, maxAssetSize) {
  const tags = [...html.matchAll(/<(img|picture|source|video|audio|track|input|object|embed)\b[^>]*>/gi)].reverse();
  for (const match of tags) {
    let tag = match[0];
    const attrs = [...tag.matchAll(/\b(src|poster|data|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)].reverse();
    for (const attr of attrs) {
      const name = attr[1].toLowerCase();
      const ref = attr[2] ?? attr[3] ?? attr[4] ?? '';
      const makeUrl = async value => {
        const fileRef = value.trim();
        if (!fileRef || /^(?:[a-z]+:|\/\/|#)/i.test(fileRef)) return fileRef;
        const file = path.resolve(baseDir, decodeURIComponent(fileRef.split(/[?#]/, 1)[0]));
        try { return await dataUriFor(file, maxAssetSize); }
        catch (e) { throw new Error(`Could not bundle media ${fileRef}: ${e.message}`); }
      };
      let replacement;
      if (name === 'srcset') {
        const pieces = [];
        for (const item of ref.split(',')) {
          const [url, ...descriptor] = item.trim().split(/\s+/);
          pieces.push(`${await makeUrl(url)}${descriptor.length ? ` ${descriptor.join(' ')}` : ''}`);
        }
        replacement = pieces.join(', ');
      } else replacement = await makeUrl(ref);
      const quote = attr[2] !== undefined ? '"' : attr[3] !== undefined ? "'" : '';
      const valuePattern = new RegExp(`(\\b${name}\\s*=\\s*)(?:"[^"]*"|'[^']*'|[^\\s>]+)`, 'i');
      tag = tag.replace(valuePattern, `$1${quote}${replacement}${quote}`);
    }
    html = html.slice(0, match.index) + tag + html.slice(match.index + match[0].length);
  }
  return html;
}

function applyTemplateValues(html, defines = {}, strict = false) {
  return html.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (whole, key) => {
    if (!Object.hasOwn(defines, key)) {
      if (strict) throw new Error(`No value provided for template variable ${key}.`);
      return whole;
    }
    return String(defines[key]).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  });
}

async function bundleFiles(inputs, output, options = {}) {
  const maxAssetSize = options.maxAssetSize || 10 * 1024 * 1024;
  let html = '';
  const css = [], js = [];
  for (const file of inputs) {
    const ext = path.extname(file).toLowerCase();
    const content = await readUtf8(file);
    if (['.html', '.htm'].includes(ext)) {
      if (html) throw new Error('Provide at most one HTML file.');
      html = content;
    } else if (ext === '.css') css.push(`/* ${path.basename(file).replace(/[*/]/g, '')} */\n${await processCss(content, path.dirname(path.resolve(file)), new Set(), maxAssetSize)}`);
    else if (['.js', '.mjs'].includes(ext)) js.push(`// ${path.basename(file).replace(/[\r\n]/g, '')}\n${content}`);
    else throw new Error(`Unsupported input type: ${file} (expected .html, .htm, .css, .js, or .mjs).`);
  }
  if (!inputs.length) throw new Error('-h requires at least one HTML, CSS, or JavaScript file.');
  // Inline local assets already referenced by the HTML document as well as
  // explicitly supplied files. Remote URLs intentionally stay as references.
  const htmlFile = inputs.find(file => ['.html', '.htm'].includes(path.extname(file).toLowerCase()));
  if (html && htmlFile) {
    const base = path.dirname(path.resolve(htmlFile));
    const inlineLocal = async (tag, kind, reference) => {
      if (/^(?:[a-z]+:|\/\/|#|data:)/i.test(reference)) return tag;
      const target = path.resolve(base, decodeURIComponent(reference.split(/[?#]/, 1)[0]));
      let code;
      try { code = await readUtf8(target); }
      catch (e) { throw new Error(`Could not bundle local ${kind} asset ${reference}: ${e.message}`); }
      if (kind === 'css') return `<style>\n${safeInline(await processCss(code, path.dirname(target), new Set(), maxAssetSize), 'style')}\n</style>`;
      return tag.replace(/\s+src\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, '')
        .replace(/>\s*<\/script\s*>$/i, `>\n${safeInline(code, 'script')}\n</script>`);
    };
    const replaceTags = async (source, regex, getTask) => {
      const matches = [...source.matchAll(regex)];
      for (const match of matches.reverse()) {
        const task = getTask(match);
        if (task) source = source.slice(0, match.index) + await inlineLocal(match[0], task.kind, task.ref) + source.slice(match.index + match[0].length);
      }
      return source;
    };
    html = await replaceTags(html, /<link\b[^>]*>/gi, match => {
      const tag = match[0];
      const rel = (tag.match(/\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i) || []).slice(1).find(Boolean) || '';
      const ref = (tag.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i) || []).slice(1).find(Boolean);
      return /stylesheet/i.test(rel) && ref ? { kind: 'css', ref } : null;
    });
    html = await replaceTags(html, /<script\b[^>]*\bsrc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)[^>]*>\s*<\/script\s*>/gi, match => {
      const ref = (match[0].match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i) || []).slice(1).find(Boolean);
      return ref ? { kind: 'js', ref } : null;
    });
    for (const match of [...html.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style\s*>/gi)].reverse()) {
      const replacement = `<style${match[1]}>\n${safeInline(await processCss(match[2], base, new Set(), maxAssetSize), 'style')}\n</style>`;
      html = html.slice(0, match.index) + replacement + html.slice(match.index + match[0].length);
    }
    html = await inlineHtmlMedia(html, base, maxAssetSize);
  }
  html = applyTemplateValues(html, options.defines, options.strict);
  await writeFile(output, inject(html, css, js));
}

function absoluteUrl(reference, base) {
  try { const u = new URL(reference, base); return ['http:', 'https:'].includes(u.protocol) ? u : null; }
  catch { return null; }
}

async function request(url) {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'Dompile/1.0 (+https://example.invalid)' } });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response;
}

async function downloadPage(address, output) {
  const start = absoluteUrl(address);
  if (!start) throw new Error('Website input must be a valid http:// or https:// URL.');
  const response = await request(start);
  const finalUrl = response.url || start.href;
  const type = response.headers.get('content-type') || '';
  if (type && !/html|xhtml/i.test(type)) throw new Error(`Expected an HTML page, received ${type}.`);
  let html = await response.text();
  const css = [], js = [];
  const tasks = [];
  // Capture classic stylesheets and scripts, preserving order within each type.
  html.replace(/<link\b[^>]*>/gi, tag => {
    const rel = (tag.match(/\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i) || []).slice(1).find(Boolean) || '';
    const href = (tag.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i) || []).slice(1).find(Boolean);
    if (/stylesheet/i.test(rel) && href) tasks.push({ kind: 'css', tag, url: absoluteUrl(href, finalUrl) });
    return tag;
  });
  html.replace(/<script\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>\s*<\/script\s*>/gi, (tag, a, b, c) => {
    tasks.push({ kind: 'js', tag, url: absoluteUrl(a || b || c, finalUrl) }); return tag;
  });
  for (const task of tasks) {
    if (!task.url) continue;
    try {
      const asset = await request(task.url);
      let code = await asset.text();
      if (task.kind === 'css') {
        code = code.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (whole, quote, ref) => {
          const resolved = absoluteUrl(ref.trim(), task.url.href);
          return resolved ? `url("${resolved.href}")` : whole;
        });
        css.push(`/* ${task.url.href} */\n${code}`);
      }
      else js.push(`// ${task.url.href}\n${code}`);
      html = html.replace(task.tag, '');
    } catch (e) {
      process.stderr.write(`Dompile: skipped ${task.url.href}: ${e.message}\n`);
    }
  }
  // Keep relative links/images usable after moving the page to a local file.
  html = html.replace(/\b(src|href|poster)=(['"])(?!#|data:|mailto:|tel:|javascript:|https?:|\/\/)([^'"]+)\2/gi,
    (full, attr, quote, value) => { const resolved = absoluteUrl(value, finalUrl); return resolved ? `${attr}=${quote}${resolved.href}${quote}` : full; });
  await writeFile(output, inject(html, css, js));
}

async function makeApplication(input, directory) {
  const html = await readUtf8(input);
  await fs.mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'index.html'), html);
  await writeFile(path.join(directory, 'main.js'), `const { app, BrowserWindow } = require('electron');
const path = require('node:path');

function createWindow() {
  const window = new BrowserWindow({
    width: 1100, height: 760, minWidth: 640, minHeight: 480,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  window.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
`);
  const name = path.basename(path.resolve(directory)).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[^a-z0-9]+/, '') || 'dompile-app';
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name, version: '1.0.0', private: true, description: 'Dompile generated Electron application', main: 'main.js', scripts: { start: 'electron .' }, devDependencies: { electron: 'latest' } }, null, 2) + '\n');
}

async function main(argv = process.argv.slice(2)) {
  let opts = parseArgs(argv);
  if (opts.help) { process.stdout.write(HELP); return; }
  if (opts.version) { process.stdout.write(`Dompile ${version}\n`); return; }
  if (opts.listFeatures) { process.stdout.write(FEATURES.map((feature, i) => `${String(i + 1).padStart(3, '0')}. ${feature}`).join('\n') + '\n'); return; }
  opts = await applyConfig(opts);
  if (opts.mode === '--check') {
    const result = validateHtml(await readUtf8(opts.input));
    if (opts.json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    else {
      for (const message of result.errors) process.stdout.write(`ERROR ${message}\n`);
      for (const message of result.warnings) process.stdout.write(`WARN  ${message}\n`);
      if (result.valid && !result.warnings.length) process.stdout.write('DTML structure looks good.\n');
    }
    if (!result.valid || (opts.strict && result.warnings.length)) process.exitCode = 1;
    return;
  }
  if (opts.quiet && opts.verbose) throw new Error('--quiet and --verbose cannot be used together.');
  const target = opts.output || (opts.mode === '-h'
    ? `${path.basename(opts.input, path.extname(opts.input))}.dtml`
    : opts.mode === '-w' ? 'website.dtml'
      : opts.mode === '--website' ? `${path.basename(opts.input, path.extname(opts.input))}.html`
        : path.basename(opts.input, path.extname(opts.input)));
  if (opts.dryRun) {
    for (const file of [opts.input, ...opts.files]) if (file && opts.mode !== '-w') await fs.access(file);
    if (opts.mode === '-w') absoluteUrl(opts.input) || (() => { throw new Error('Website input must be a valid http:// or https:// URL.'); })();
    if (!opts.quiet) process.stdout.write(`Dry run OK: ${opts.mode} ${opts.input} -> ${target}\n`);
    return;
  }
  if (opts.json && opts.mode !== '--check') throw new Error('--json is currently supported with --check only.');
  if (opts.noClobber) {
    try { await fs.access(target); throw new Error(`Output already exists: ${target}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const started = process.hrtime.bigint();
  if (opts.mode === '-h') await bundleFiles([opts.input, ...opts.files], target, opts);
  else if (opts.mode === '-w') await downloadPage(opts.input, target);
  else if (opts.mode === '--website') await writeFile(target, await readUtf8(opts.input));
  else if (opts.mode === '--application') await makeApplication(opts.input, target);
  if (!opts.quiet) process.stdout.write(`Created ${target}\n`);
  if (opts.verbose) process.stdout.write(`Mode: ${opts.mode}; Node.js ${process.version}\n`);
  if (opts.stats) {
    const paths = opts.mode === '--application' ? ['index.html', 'main.js', 'package.json'].map(file => path.join(target, file)) : [target];
    const stats = await Promise.all(paths.map(file => fs.stat(file)));
    const bytes = stats.reduce((sum, item) => sum + item.size, 0);
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    process.stdout.write(`Stats: ${bytes} bytes in ${elapsedMs.toFixed(1)} ms\n`);
  }
}

if (require.main === module) main().catch(error => { process.stderr.write(`Dompile: ${error.message}\n`); process.exitCode = 1; });

module.exports = { parseArgs, inject, bundleFiles, downloadPage, makeApplication, validateHtml, applyConfig, main, FEATURES };
