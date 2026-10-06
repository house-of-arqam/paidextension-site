#!/usr/bin/env node

// Appends ?v=<content hash> to every local stylesheet and script reference in
// docs/*.html. GitHub Pages serves assets with a 4-hour max-age, so without a
// changing URL a visitor can get new HTML with a stale stylesheet.
// `--check` fails instead of writing when any stamp is missing or out of date.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const docsDir = path.resolve(__dirname, '..', 'docs');
const check = process.argv.includes('--check');
const refPattern = /((?:href|src)\s*=\s*")(\/?assets\/[^"?#]+\.(?:css|js))(?:\?v=[^"]*)?(")/g;
const hashes = new Map();
const stale = [];

const hashOf = ref => {
  if (!hashes.has(ref)) {
    const file = path.join(docsDir, ref.replace(/^\//, ''));
    hashes.set(ref, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 10));
  }
  return hashes.get(ref);
};

for (const name of fs.readdirSync(docsDir).filter(file => file.endsWith('.html'))) {
  const file = path.join(docsDir, name);
  const html = fs.readFileSync(file, 'utf8');
  const stamped = html.replace(refPattern, (_, before, ref, after) => `${before}${ref}?v=${hashOf(ref)}${after}`);
  if (stamped === html) continue;
  if (check) stale.push(name);
  else fs.writeFileSync(file, stamped);
}

if (stale.length > 0) {
  console.error(`Asset stamps out of date in: ${stale.join(', ')}. Run npm run stamp.`);
  process.exit(1);
}

console.log(check ? 'Asset stamp check passed.' : 'Asset references stamped.');
