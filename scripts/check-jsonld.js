#!/usr/bin/env node

// The JSON-LD in index.html repeats the FAQ and the prices for search engines.
// Editing the visible copy without it lets the two drift, hence this guard.

const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'docs', 'index.html'), 'utf8');
const errors = [];

const entities = { amp: '&', quot: '"', lt: '<', gt: '>', nbsp: '\u00a0', mdash: '\u2014', rarr: '\u2192', middot: '\u00b7' };
function text(fragment) {
  return fragment
    .replace(/<[^>]+>/g, '')
    .replace(/&(\w+);/g, (all, name) => entities[name] || all)
    .replace(/\s+/g, ' ')
    .trim();
}

const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
const data = [];
for (const [, json] of blocks) {
  try {
    data.push(JSON.parse(json));
  } catch (error) {
    errors.push(`JSON-LD does not parse: ${error.message}`);
  }
}

const faq = data.find(item => item['@type'] === 'FAQPage');
const visibleFaq = [...html.matchAll(/<details>\s*<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>\s*<\/details>/g)]
  .map(([, question, answer]) => ({ question: text(question), answer: text(answer) }));
if (!faq) {
  errors.push('no FAQPage JSON-LD');
} else {
  const listed = faq.mainEntity.map(entry => ({ question: entry.name, answer: entry.acceptedAnswer.text }));
  if (listed.length !== visibleFaq.length) {
    errors.push(`FAQPage lists ${listed.length} questions, the page shows ${visibleFaq.length}`);
  }
  visibleFaq.forEach((visible, i) => {
    const entry = listed[i] || {};
    if (entry.question !== visible.question) errors.push(`FAQ ${i + 1}: question differs from the page: "${visible.question}"`);
    if (entry.answer !== visible.answer) errors.push(`FAQ ${i + 1}: answer differs from the page ("${visible.question}")`);
  });
}

const product = data.find(item => item['@type'] === 'Product');
if (!product) {
  errors.push('no Product JSON-LD');
} else {
  for (const offer of product.offers) {
    const card = html.match(new RegExp(`<h3>${offer.name}</h3>([\\s\\S]*?)</div>`));
    if (!card) {
      errors.push(`offer "${offer.name}" has no pricing card`);
      continue;
    }
    const shown = text((card[1].match(/<p class="price">([\s\S]*?)<\/p>/) || [, ''])[1].replace(/<s>[\s\S]*?<\/s>/, ''));
    if (shown !== `$${offer.price}`) errors.push(`offer "${offer.name}" is $${offer.price}, the card shows ${shown}`);
    if (!card[1].includes(`href="${offer.url}"`)) errors.push(`offer "${offer.name}" URL is not the card's checkout link`);
  }
}

if (errors.length > 0) {
  console.error('JSON-LD check failed:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('JSON-LD check passed.');
