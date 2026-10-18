// Headless-Test: lädt die gebaute App, prüft Konsole, macht Screenshots in screens/.
// Aufruf: npm run verify   (Server muss auf :5173 laufen, z. B. npm run preview)
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL = process.env.APP_URL || 'http://localhost:5173/';
const EXE = process.env.CHROME || '/usr/bin/google-chrome';
fs.mkdirSync('screens', { recursive: true });

const browser = await chromium.launch({ executablePath: EXE, headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const watch = (page) => {
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`[requestfailed] ${r.url()}`));
};
const settle = async (page, extra = 400) => {
  await page.waitForFunction(() => window.__monsters?.ready() && !window.__monsters.cam.animating, null, { timeout: 30000 });
  await page.waitForTimeout(extra);
  await page.waitForFunction(() => window.__monsters.ready(), null, { timeout: 30000 });
};

// Desktop
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
watch(page);
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.__monsters, null, { timeout: 30000 });
await settle(page, 800);
await page.screenshot({ path: 'screens/01_uebersicht.png' });

// Zoomstufe 2 (Detail-Ebene voll eingeblendet, Nester noch aus)
await page.evaluate(() => { const c = window.__monsters.cam; c.center = { x: 1650, y: 1250 }; c.setZoom(2.4); });
await settle(page);
await page.screenshot({ path: 'screens/02_zoom2_ueberblendung.png' });
await page.evaluate(() => { const c = window.__monsters.cam; c.center = { x: 1650, y: 1250 }; c.setZoom(3.0); });
await settle(page);
await page.screenshot({ path: 'screens/02b_zoom2.png' });

// Mausrad-Zoom testen
await page.mouse.move(640, 360);
for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -200); await page.waitForTimeout(60); }
const zWheel = await page.evaluate(() => window.__monsters.cam.zoom);

// "Mein Nest": Kamerafahrt + Infopanel
await page.click('[data-act=nest]');
await page.waitForTimeout(1700);
await settle(page);
await page.screenshot({ path: 'screens/03_nester_mein_nest.png' });

// Tipp auf ein anderes Nest
const tapInfo = await page.evaluate(() => {
  const m = window.__monsters; const c = m.cam;
  const v = c.visible;
  const n = m.store.nests.find((n) => { const p = m.store.position(n); return !n.own && p.x > v.x + 60 && p.x < v.x + v.w - 60 && p.y > v.y + 80 && p.y < v.y + v.h - 120; });
  if (!n) return null;
  const s = c.worldToScreen(m.store.position(n));
  return { x: s.x, y: s.y - 6, player: n.player };
});
let tapped = null;
if (tapInfo) {
  await page.mouse.click(tapInfo.x, tapInfo.y);
  await page.waitForTimeout(500);
  tapped = await page.textContent('.panel .ptitle');
  await page.screenshot({ path: 'screens/04_nest_info.png' });
}

// Raster-Debug (Taste G)
await page.keyboard.press('g');
await page.waitForTimeout(300);
await page.screenshot({ path: 'screens/05_raster_debug.png' });
await page.evaluate(() => { const c = window.__monsters.cam; c.setZoom(1.6); });
await settle(page);
await page.screenshot({ path: 'screens/05b_raster_debug_weit.png' });
await page.keyboard.press('g');

// Mobil (Touch, Hochformat)
const mob = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
watch(mob);
await mob.goto(URL, { waitUntil: 'networkidle' });
await mob.waitForFunction(() => !!window.__monsters, null, { timeout: 30000 });
await settle(mob, 600);
await mob.screenshot({ path: 'screens/06_mobil_uebersicht.png' });
await mob.tap('[data-act=nest]');
await mob.waitForTimeout(1700);
await settle(mob);
await mob.screenshot({ path: 'screens/07_mobil_mein_nest.png' });

// Zoomstufe 3: maximaler Zoom (Desktop, DPR 1) am eigenen Nest
const OLD_URL = process.env.OLD_URL || 'http://localhost:5174/';
const spot = await page.evaluate(() => { const m = window.__monsters; const p = m.store.position(m.store.own); return { x: p.x + 40, y: p.y - 10 }; });
await page.evaluate(() => { const m = window.__monsters; m.map.nests.select(null); m.hud.showNest(null); });
await page.evaluate((p) => { const c = window.__monsters.cam; c.stopAnimations(); c.center = { ...p }; c.setZoom(1e9); }, spot);
await settle(page, 800);
await page.screenshot({ path: 'screens/08_max_zoom.png' });
const maxInfo = await page.evaluate(() => { const m = window.__monsters, c = m.cam; const d3 = m.map.detail3;
  return { zoom: +c.zoom.toFixed(2), scale: +c.scale.toFixed(3), maxScale: +c.maxScale.toFixed(3),
    cssPxPerSrcPx: +(c.scale / (11861 / 5040)).toFixed(3), detail3Visible: !!d3 && d3.container.visible && d3.container.alpha > 0.99,
    detail2Visible: m.map.detail.container.visible, stage: document.querySelector('.stage')?.textContent }; });

// Vorher (alter Build auf :5174, dessen Max-Zoom = 8× Übersicht) an derselben Stelle
let oldInfo = null;
try {
  const old = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await old.goto(OLD_URL, { waitUntil: 'networkidle' });
  await old.waitForFunction(() => !!window.__monsters, null, { timeout: 30000 });
  await old.evaluate((p) => { const c = window.__monsters.cam; c.stopAnimations(); c.center = { ...p }; c.setZoom(1e9); }, spot);
  await settle(old, 800);
  await old.screenshot({ path: 'screens/08_vorher_max_zoom.png' });
  oldInfo = await old.evaluate(() => { const c = window.__monsters.cam; return { zoom: +c.zoom.toFixed(2), scale: +c.scale.toFixed(3) }; });
  await old.close();
} catch (e) { errors.push('[vorher] ' + e.message); }

// Raster-Editor (Taste E): ein paar Zellen malen, Export prüfen
await page.evaluate(() => { const c = window.__monsters.cam; c.setZoom(5); });
await settle(page);
await page.keyboard.press('e');
await page.waitForTimeout(200);
const before = await page.evaluate(() => window.__monsters.grid.countBuildable());
await page.mouse.move(560, 300); await page.mouse.down(); await page.mouse.move(720, 300, { steps: 8 }); await page.mouse.up();
await page.waitForTimeout(300);
const afterPaint = await page.evaluate(() => window.__monsters.grid.countBuildable());
await page.screenshot({ path: 'screens/09_editor.png' });
const dl = page.waitForEvent('download', { timeout: 5000 });
await page.click('[data-ed=export]');
const download = await dl;
await download.saveAs('screens/09_editor_export_grid.json');
const exported = JSON.parse(fs.readFileSync('screens/09_editor_export_grid.json', 'utf8'));
await page.keyboard.press('Control+z');
await page.waitForTimeout(100);
const afterUndo = await page.evaluate(() => window.__monsters.grid.countBuildable());
await page.keyboard.press('e');
const editor = { before, afterPaint, exportedCount: exported.buildableCount, exportedCols: exported.cols, afterUndo };

const stats = await page.evaluate(() => {
  const m = window.__monsters;
  return { cells: m.grid.cellCount, cols: m.grid.cols, rows: m.grid.rows, buildable: m.grid.countBuildable(), nests: m.store.nests.length,
    renderer: m.map.app.renderer.name };
});
console.log(JSON.stringify({ stats, maxInfo, oldInfo, editor, zoomAfterWheel: +zWheel.toFixed(2), tapped, tapExpected: tapInfo?.player, errors }, null, 1));
await browser.close();
process.exit(errors.filter((e) => !e.includes('GPU stall')).length ? 1 : 0);
