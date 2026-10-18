// iPhone-ähnlicher Test (390×844, DPR 3, Touch, iOS-UA): Übersicht, mittlerer Zoom, Max-Zoom; prüft Vollbild + HUD-Lage.
// Aufruf: node tools/verify_mobile.mjs   (APP_URL=… optional, Standard http://localhost:5173/)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const URL = process.env.APP_URL || 'http://localhost:5173/';
const PREFIX = process.env.PREFIX || '10_mobil';
fs.mkdirSync('screens', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
const settle = async (extra = 600) => {
  await page.waitForFunction(() => window.__monsters?.ready() && !window.__monsters.cam.animating, null, { timeout: 60000 });
  await page.waitForTimeout(extra);
  await page.waitForFunction(() => window.__monsters.ready(), null, { timeout: 60000 });
};
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__monsters, null, { timeout: 60000 });
await settle(1000);
const layout = await page.evaluate(() => {
  const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) }; };
  const c = document.querySelector('#app canvas');
  return { inner: [innerWidth, innerHeight], app: r('#app'), canvas: r('#app canvas'), canvasPx: c ? [c.width, c.height] : null,
    resbar: r('.resbar'), bottomBar: r('.bottom'), dpr: devicePixelRatio, maxZoom: window.__monsters.cam.maxZoom,
    safeTop: getComputedStyle(document.documentElement).getPropertyValue('--safe-top') };
});
await page.screenshot({ path: `screens/${PREFIX}_1_uebersicht.png` });
// mittlerer Zoom (Nester sichtbar)
await page.evaluate(() => { const m = window.__monsters, c = m.cam, o = m.store.own, p = m.store.position(o); c.center = { x: p.x, y: p.y }; c.setZoom(3.6); });
await settle();
await page.screenshot({ path: `screens/${PREFIX}_2_mittel.png` });
// Max-Zoom
await page.evaluate(() => { const m = window.__monsters, c = m.cam, o = m.store.own, p = m.store.position(o); c.center = { x: p.x + 40, y: p.y + 10 }; c.setZoom(c.maxZoom); });
await settle(1200);
const st = await page.evaluate(() => { const m = window.__monsters, c = m.cam;
  const L = (l) => l ? l.container.children.filter((s) => s.visible).length : -1;
  return { zoom: c.zoom, scale: c.scale, maxZoom: c.maxZoom, d3: L(m.map.detail3), d4: L(m.map.detail4), d4alpha: m.map.detail4?.container.alpha }; });
await page.screenshot({ path: `screens/${PREFIX}_3_maxzoom.png` });
console.log(JSON.stringify({ layout, maxzoom: st, errors }, null, 1));
await browser.close();
