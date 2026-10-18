import './style.css';
import { Camera, LOD, NestStore, WorldGrid, loadMapData, zoomStageLabel } from './core';
import { attachGestures } from './input/gestures';
import { MapRenderer } from './render/MapRenderer';
import { Hud } from './ui/hud';
import { GridEditor } from './ui/editor';
import { MAX_MAGNIFY } from './core/lod';

async function start(): Promise<void> {
  const root = document.getElementById('app')!;
  const loading = Object.assign(document.createElement('div'), { className: 'loading', textContent: 'Karte wird geladen …' });
  root.appendChild(loading);

  const data = await loadMapData();
  const grid = new WorldGrid(data.grid);
  const store = new NestStore(data.nests.nests, grid);
  const cam = new Camera(data.tiles.world);
  // Max-Zoom: schärfste Ebene höchstens MAX_MAGNIFY-fach (CSS-px pro Quell-Pixel) vergrößern
  const sharpest = data.tiles.layers.detail3 ?? data.tiles.layers.detail;
  cam.maxScale = (sharpest.width / data.tiles.world.width) * MAX_MAGNIFY;
  const map = new MapRenderer(cam, data.tiles, grid, store);
  await map.init(root);
  loading.remove();

  const resize = () => cam.resize(root.clientWidth, root.clientHeight);
  resize();
  window.addEventListener('resize', resize);

  const flyToOwn = () => {
    const own = store.own;
    if (!own) return;
    cam.flyTo(store.position(own), 6);
    window.setTimeout(() => { map.nests.select(own); hud.showNest(own, { cell: `${own.cx} / ${own.cy}` }); }, 1450);
  };
  const toggleGrid = () => map.grid.toggle();

  const hud = new Hud(root, { nahrung: 12480, holz: 3260, stein: 1875, uran: 42 }, {
    onMyNest: flyToOwn,
    onToggleGrid: toggleGrid,
    onZoomIn: () => cam.animateZoomAt(1.6, { x: cam.viewW / 2, y: cam.viewH / 2 }),
    onZoomOut: () => cam.animateZoomAt(1 / 1.6, { x: cam.viewW / 2, y: cam.viewH / 2 }),
  });

  const editor = new GridEditor(root, cam, grid, map.grid, (on) => hud.setGrid(on));

  attachGestures(map.app.canvas, cam, {
    onTap: (p) => {
      if (editor.active) return;
      if (cam.zoom < LOD.nestsTapMin) { map.nests.select(null); hud.showNest(null); return; }
      const w = cam.screenToWorld(p);
      const n = store.nearest(w, Math.max(10, 22 / cam.scale)); // mind. ~22 px Trefferradius
      map.nests.select(n);
      hud.showNest(n, n ? { cell: `${n.cx} / ${n.cy}` } : undefined);
    },
  });

  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (e.key === 'g' || e.key === 'G') hud.setGrid(toggleGrid());
    if (e.key === 'e' || e.key === 'E') editor.toggle();
    if (e.key === 'Escape') { map.nests.select(null); hud.showNest(null); }
  });

  let last = performance.now();
  map.app.ticker.add(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    cam.update(dt);
    map.render(dt);
    hud.setZoom(cam.zoom, zoomStageLabel(cam.zoom, cam.scale));
    // Nester ausgeblendet → Auswahl/Infopanel schließen
    if (cam.zoom < LOD.nestsFrom && hud.nestShown) { map.nests.select(null); hud.showNest(null); }
  });

  // Test-/Debug-Zugriff (z. B. für automatisierte Screenshots)
  (window as unknown as Record<string, unknown>).__monsters = { cam, grid, store, map, hud, editor,
    ready: () => map.pendingTiles === 0 };
}

start().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#fff;padding:20px">Fehler: ${String(err)}</pre>`);
});
