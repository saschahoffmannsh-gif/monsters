import { chromium } from 'playwright-core';
const URL = 'https://saschahoffmannsh-gif.github.io/monsters/';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [], bad = []; let tiles = 0;
p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
p.on('pageerror', e => errs.push(e.message));
p.on('response', r => { if (r.status() >= 400) bad.push(r.status()+' '+r.url()); if (r.url().includes('/tiles/') && r.ok()) tiles++; });
p.on('requestfailed', r => bad.push('failed '+r.url()));
await p.goto(URL, { waitUntil: 'networkidle' });
await p.waitForFunction(() => window.__monsters?.ready(), null, { timeout: 60000 });
const settle = async () => { await p.waitForTimeout(800); await p.waitForFunction(() => window.__monsters.ready() && !window.__monsters.cam.animating, null, { timeout: 60000 }); await p.waitForTimeout(500); };
await p.mouse.move(640,360); for (let i=0;i<25;i++){ await p.mouse.wheel(0,-300); await p.waitForTimeout(50); }
await settle();
const info = await p.evaluate(() => { const m = window.__monsters, c = m.cam; return { zoom:+c.zoom.toFixed(2), maxZoom:+c.maxZoom.toFixed(2), scale:+c.scale.toFixed(3), d3: m.map.detail3?.container.visible, d3tiles: m.map.detail3?.loadedCount, stage: document.querySelector('.stage')?.textContent }; });
await p.screenshot({ path: 'screens/live.png' });
console.log(JSON.stringify({ info, tilesLoaded: tiles, bad, errs }, null, 1));
await b.close();
