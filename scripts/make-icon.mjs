// Renders media/icon.svg to media/icon.png (128x128). Run with: node scripts/make-icon.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const media = fileURLToPath(new URL('../media/', import.meta.url));
const svg = readFileSync(`${media}icon.svg`, 'utf8');
const png = new Resvg(svg, {
  fitTo: { mode: 'width', value: 128 },
  font: { loadSystemFonts: true },
})
  .render()
  .asPng();
writeFileSync(`${media}icon.png`, png);
console.log(`Wrote ${media}icon.png (${png.length} bytes)`);
