// Renders the LiftLog icon to PNGs for the PWA manifest and iOS home screen.
// Usage: npm run icons  (uses Playwright's Chromium)
import { chromium } from 'playwright-core';
import { writeFile } from 'node:fs/promises';

const mark = (size, { padding = 0, radius = 0.25, bg = '#C6F432', outer = 'transparent' } = {}) => {
  const inner = size - padding * 2;
  return `<!doctype html><html><body style="margin:0;background:transparent">
  <div style="width:${size}px;height:${size}px;background:${outer};display:flex;align-items:center;justify-content:center">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${inner}" height="${inner}">
    <rect width="64" height="64" rx="${64 * radius}" fill="${bg}"/>
    <g fill="#0A0B0D"><rect x="10" y="22" width="7" height="20" rx="2.5"/><rect x="18.5" y="17" width="7" height="30" rx="2.5"/><rect x="38.5" y="17" width="7" height="30" rx="2.5"/><rect x="47" y="22" width="7" height="20" rx="2.5"/><rect x="25" y="29" width="14" height="6" rx="2"/></g>
  </svg></div></body></html>`;
};

const targets = [
  { file: 'public/pwa-192x192.png', size: 192, opts: { radius: 0.22 } },
  { file: 'public/pwa-512x512.png', size: 512, opts: { radius: 0.22 } },
  // Maskable: full-bleed background, artwork inside the safe zone.
  { file: 'public/maskable-512x512.png', size: 512, opts: { radius: 0, padding: 72, outer: '#C6F432' } },
  // iOS applies its own rounding; use a square, opaque icon.
  { file: 'public/apple-touch-icon.png', size: 180, opts: { radius: 0 } },
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage();
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(mark(t.size, t.opts));
  const buf = await page.screenshot({ omitBackground: t.opts.radius > 0, clip: { x: 0, y: 0, width: t.size, height: t.size } });
  await writeFile(t.file, buf);
  console.log('wrote', t.file);
}
await browser.close();
