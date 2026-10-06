#!/usr/bin/env node

// GitHub Pages cannot set response headers, so the CSP only exists as a <meta>
// tag on each page. Deleting one is a silent security regression, hence this
// guard.

const fs = require('fs');
const path = require('path');

const docsDir = path.resolve(__dirname, '..', 'docs');
const requiredDirectives = ['default-src', 'base-uri', 'form-action'];
// Cloudflare auto-injects its Web Analytics beacon into every page; it reports
// back to the same origin.
const requiredSources = [
  ['script-src', 'https://static.cloudflareinsights.com/beacon.min.js/'],
  ['connect-src', "'self'"]
];
const errors = [];

for (const file of fs.readdirSync(docsDir).filter(name => name.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(docsDir, file), 'utf8');
  const match = html.match(
    /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i
  );
  if (!match) {
    errors.push(`${file}: no Content-Security-Policy meta tag`);
    continue;
  }
  for (const directive of requiredDirectives) {
    if (!match[1].includes(`${directive} `)) {
      errors.push(`${file}: CSP is missing the ${directive} directive`);
    }
  }
  for (const [directive, source] of requiredSources) {
    const value = match[1].split(';').map(part => part.trim().split(/\s+/))
      .find(([name]) => name === directive);
    if (!value || !value.includes(source)) {
      errors.push(`${file}: ${directive} must allow ${source} for Cloudflare Web Analytics`);
    }
  }
}

if (errors.length > 0) {
  console.error('CSP check failed:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('CSP check passed.');
