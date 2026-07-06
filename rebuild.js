// Rebuilds the working bundle HTML by injecting the edited template
// (extracted_template.txt) back into the original Claude bundle wrapper.
// Usage: node rebuild.js
const fs = require('fs');
const path = require('path');

const ORIGINAL = path.join(__dirname, 'Volten Gym App (1).html');
const TEMPLATE = path.join(__dirname, 'extracted_template.txt');
const OUTPUT   = path.join(__dirname, 'app.html');

const original = fs.readFileSync(ORIGINAL, 'utf-8');
let newTemplate = fs.readFileSync(TEMPLATE, 'utf-8');

// ── Safety checks: never ship a broken bundle ──────────────────────────────
// 1. Every inline <script> in the template must be valid JavaScript.
for (const m of newTemplate.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
  if (!m[1].trim()) continue;
  try { new Function(m[1]); }
  catch (e) {
    console.error('ABORT: syntax error in inline <script>: ' + e.message);
    process.exit(1);
  }
}
// 2. <div> open/close balance must be exactly zero.
const _opens = (newTemplate.match(/<div/g) || []).length;
const _closes = (newTemplate.match(/<\/div>/g) || []).length;
if (_opens !== _closes) {
  console.error(`ABORT: div imbalance (${_opens} opens vs ${_closes} closes)`);
  process.exit(1);
}

// Stamp a build timestamp so we can tell at a glance (bottom-right corner of
// the app) whether the browser is showing a stale cached copy.
const buildId = new Date().toISOString().replace('T', ' ').slice(0, 19);
newTemplate = newTemplate.replace('__BUILD_ID__', buildId);

// ── Inject local PNG photos into the manifest ──────────────────────────────
// Each entry maps a stable UUID (used in the template) to a local PNG file.
const LOCAL_PHOTOS = {
  'aa000001-0000-0000-0000-000000000001': 'fuerza.png',
  'aa000002-0000-0000-0000-000000000002': 'cardio.png',
  'aa000003-0000-0000-0000-000000000003': 'abdomen.png',
  'aa000004-0000-0000-0000-000000000004': 'pierna.png',
  'aa000005-0000-0000-0000-000000000005': 'principiantes.png',
  'aa000006-0000-0000-0000-000000000006': 'ChatGPT Image 2 jul 2026, 23_38_14.png',
  'aa000007-0000-0000-0000-000000000007': 'ChatGPT Image 3 jul 2026, 10_55_32.png',
  'aa000008-0000-0000-0000-000000000008': 'fuerza 2.png',
  'aa000009-0000-0000-0000-000000000009': 'cardio 2.png',
  'aa000010-0000-0000-0000-000000000010': 'core 2.png',
  'aa000011-0000-0000-0000-000000000011': 'pierno 2.png',
  'aa000012-0000-0000-0000-000000000012': 'principiante 2.png',
  'aa000013-0000-0000-0000-000000000013': 'plan prgramas.png',
  'aa000014-0000-0000-0000-000000000014': 'ensalada.png',
  'aa000015-0000-0000-0000-000000000015': 'bascula.png',
};

let rebuilt = original;

// __bundler_thumbnail patch: el splash de carga era un logo negro gigante —
// se reemplaza por una pantalla blanca con el rayo pequeño y pulso suave.
rebuilt = rebuilt.replace(/<div id="__bundler_thumbnail">[\s\S]*?<\/div>/,
  '<div id="__bundler_thumbnail" style="position:fixed;inset:0;background:#FFFFFF;display:flex;align-items:center;justify-content:center;z-index:9999;">' +
  '<svg width="64" height="64" viewBox="0 0 28 28" fill="none" style="animation:vgsplash 1.2s ease-in-out infinite;"><path d="M16 2L7 15h8l-3 11L22 13h-8z" fill="#F97316"></path></svg>' +
  '<style>@keyframes vgsplash{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.55;transform:scale(0.92)}}#__bundler_loading{position:fixed;bottom:40px;left:0;right:0;text-align:center;font-family:sans-serif;font-size:12px;color:#C0C0C0;background:#FFFFFF00 !important;}</style>' +
  '</div>');


const manifestRe = /(<script type="__bundler\/manifest">)([\s\S]*?)(<\/script>)/;
const manifestMatch = rebuilt.match(manifestRe);
if (manifestMatch) {
  const manifest = JSON.parse(manifestMatch[2]);
  for (const [uuid, filename] of Object.entries(LOCAL_PHOTOS)) {
    const filePath = path.join(__dirname, filename);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath).toString('base64');
      manifest[uuid] = { mime: 'image/png', compressed: false, data };
      console.log(`Injected ${filename} as ${uuid}`);
    } else {
      console.warn(`Warning: ${filename} not found, skipping`);
    }
  }
  rebuilt = rebuilt.replace(manifestRe, (_, open, _old, close) =>
    open + JSON.stringify(manifest) + close
  );
}

// ── Inject the updated template ────────────────────────────────────────────
const templateRe = /(<script type="__bundler\/template">)([\s\S]*?)(<\/script>)/;
if (!templateRe.test(rebuilt)) {
  throw new Error('Could not find __bundler/template script block in original file');
}

rebuilt = rebuilt.replace(templateRe, (_, open, _old, close) => {
  const json = JSON.stringify(newTemplate).replace(/\//g, '\\/');
  return open + json + close;
});

// ── PWA: logo, manifest y service worker (icono en la pestaña + instalable) ─
const PWA_TAGS = '<title>Volten Gym</title>'
  + '<link rel="manifest" href="manifest.json">'
  + '<link rel="icon" type="image/png" href="voltengym.png">'
  + '<link rel="apple-touch-icon" href="voltengym.png">'
  + '<meta name="theme-color" content="#F97316">'
  + '<script>if("serviceWorker" in navigator&&location.protocol.indexOf("http")===0)navigator.serviceWorker.register("sw.js").catch(function(){});</script>';
rebuilt = rebuilt.replace(/<title>[\s\S]*?<\/title>/i, '');
rebuilt = rebuilt.replace(/<head([^>]*)>/i, (m) => m + PWA_TAGS);

fs.writeFileSync(OUTPUT, rebuilt);
console.log('Rebuilt:', OUTPUT, '(' + rebuilt.length + ' bytes)');
