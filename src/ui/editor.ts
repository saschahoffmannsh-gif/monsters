import type { Camera } from '../core/camera';
import type { WorldGrid } from '../core/grid';
import type { GridOverlay } from '../render/GridOverlay';

const LS_KEY = 'monsters.gridEdits.v1';

/**
 * Raster-Editor (Taste E): Zellen von Hand als bebaubar / blockiert malen und grid.json exportieren.
 *  - Linke Maustaste / ein Finger: malen (Modus „Bebaubar“ oder „Blockiert“, Umschalten mit B)
 *  - Shift + Linksklick oder Rechtsklick: jeweils den Gegen-Modus malen
 *  - Leertaste gedrückt halten (oder mittlere Maustaste / zwei Finger): Karte verschieben; Mausrad zoomt
 *  - [ / ] Pinselgröße, Strg+Z rückgängig (pro Strich)
 * Änderungen werden im localStorage gehalten, bis „Zurücksetzen“ gedrückt wird.
 */
export class GridEditor {
  active = false;
  mode: 'build' | 'block' = 'build';
  brush = 1;
  private panel: HTMLDivElement;
  private space = false;
  private painting: null | { pointerId: number; value: boolean } = null;
  private stroke: Map<number, boolean> | null = null;
  private undo: Map<number, boolean>[] = [];
  private touches = new Set<number>();
  private readonly original: string;

  constructor(private readonly root: HTMLElement, private readonly cam: Camera, private readonly grid: WorldGrid,
    private readonly overlay: GridOverlay, private readonly onGridShown: (on: boolean) => void) {
    this.original = grid.toBase64();
    this.restore();
    this.panel = document.createElement('div');
    this.panel.className = 'editor';
    this.panel.hidden = true;
    root.appendChild(this.panel);
    this.panel.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('[data-ed]')?.getAttribute('data-ed');
      if (a === 'build' || a === 'block') { this.mode = a; this.renderPanel(); }
      else if (a === 'export') this.exportJson();
      else if (a === 'reset') this.reset();
      else if (a === 'close') this.toggle(false);
      else if (a === 'b-') this.setBrush(this.brush - 1);
      else if (a === 'b+') this.setBrush(this.brush + 1);
    });
    // Capture-Phase am Wurzel-Element: vor den Karten-Gesten (Pan/Tap) am Canvas
    root.addEventListener('pointerdown', this.onDown, true);
    root.addEventListener('pointermove', this.onMove, true);
    root.addEventListener('pointerup', this.onUp, true);
    root.addEventListener('pointercancel', this.onUp, true);
    root.addEventListener('contextmenu', (e) => { if (this.active) e.preventDefault(); });
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.code === 'Space') { this.space = true; e.preventDefault(); }
      if (e.key === 'b' || e.key === 'B') { this.mode = this.mode === 'build' ? 'block' : 'build'; this.renderPanel(); }
      if (e.key === '[') this.setBrush(this.brush - 1);
      if (e.key === ']') this.setBrush(this.brush + 1);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { this.undoStroke(); e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') this.space = false; });
  }

  toggle(on = !this.active): boolean {
    this.active = on;
    this.panel.hidden = !on;
    this.overlay.setEditMode(on);
    if (on && !this.overlay.enabled) { this.overlay.toggle(true); this.onGridShown(true); }
    this.root.classList.toggle('editing', on);
    this.renderPanel();
    return on;
  }

  private setBrush(n: number): void { this.brush = Math.max(1, Math.min(7, n)); this.renderPanel(); }

  private isPaintEvent(e: PointerEvent): boolean {
    if (!this.active || this.space) return false;
    if ((e.target as HTMLElement).tagName !== 'CANVAS') return false;
    if (e.pointerType === 'touch') return this.touches.size <= 1;
    return e.button === 0 || e.button === 2;
  }

  private onDown = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') this.touches.add(e.pointerId);
    if (this.painting && e.pointerType === 'touch') { this.endStroke(); return; } // zweiter Finger → Gesten übernehmen
    if (!this.isPaintEvent(e)) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    const invert = e.shiftKey || e.button === 2;
    const value = (this.mode === 'build') !== invert;
    this.painting = { pointerId: e.pointerId, value };
    this.stroke = new Map();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    this.paintAt(e);
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.painting || e.pointerId !== this.painting.pointerId) return;
    e.stopImmediatePropagation();
    this.paintAt(e);
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') this.touches.delete(e.pointerId);
    if (!this.painting || e.pointerId !== this.painting.pointerId) return;
    e.stopImmediatePropagation();
    this.endStroke();
  };

  private endStroke(): void {
    if (this.stroke && this.stroke.size) { this.undo.push(this.stroke); if (this.undo.length > 50) this.undo.shift(); }
    this.painting = null; this.stroke = null;
    this.persist(); this.renderPanel();
  }

  private paintAt(e: PointerEvent): void {
    const r = (e.target as HTMLElement).getBoundingClientRect();
    const w = this.cam.screenToWorld({ x: e.clientX - r.left, y: e.clientY - r.top });
    const { cx, cy } = this.grid.cellAt(w);
    const h = Math.floor((this.brush - 1) / 2), h2 = this.brush - 1 - h;
    for (let y = cy - h; y <= cy + h2; y++) for (let x = cx - h; x <= cx + h2; x++) {
      const prev = this.grid.isBuildable(x, y);
      if (this.grid.setBuildable(x, y, this.painting!.value)) {
        const i = y * this.grid.cols + x;
        if (!this.stroke!.has(i)) this.stroke!.set(i, prev);
      }
    }
  }

  private undoStroke(): void {
    const s = this.undo.pop();
    if (!s) return;
    for (const [i, prev] of s) this.grid.setBuildable(i % this.grid.cols, Math.floor(i / this.grid.cols), prev);
    this.persist(); this.renderPanel();
  }

  private persist(): void {
    try {
      const cur = this.grid.toBase64();
      if (cur === this.original) localStorage.removeItem(LS_KEY);
      else localStorage.setItem(LS_KEY, JSON.stringify({ cols: this.grid.cols, rows: this.grid.rows, base: this.original, buildable: cur }));
    } catch { /* localStorage nicht verfügbar */ }
  }

  private restore(): void {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      // nur anwenden, wenn die gespeicherten Änderungen auf demselben Ausgangs-Raster beruhen
      if (d.cols !== this.grid.cols || d.rows !== this.grid.rows || d.base !== this.original) { localStorage.removeItem(LS_KEY); return; }
      this.applyBase64(d.buildable);
    } catch { /* ignorieren */ }
  }

  private applyBase64(b64: string): void {
    const bin = atob(b64);
    for (let y = 0; y < this.grid.rows; y++) for (let x = 0; x < this.grid.cols; x++) {
      const i = y * this.grid.cols + x;
      this.grid.setBuildable(x, y, (bin.charCodeAt(i >> 3) & (0x80 >> (i & 7))) !== 0);
    }
  }

  private reset(): void {
    if (!confirm('Alle Raster-Änderungen verwerfen?')) return;
    this.applyBase64(this.original);
    this.undo = [];
    this.persist(); this.renderPanel();
  }

  get changedCells(): number {
    const a = atob(this.original), b = atob(this.grid.toBase64());
    let n = 0;
    for (let i = 0; i < a.length; i++) { let x = a.charCodeAt(i) ^ b.charCodeAt(i); while (x) { n += x & 1; x >>= 1; } }
    return n;
  }

  exportJson(): void {
    const json = JSON.stringify(this.grid.toJSON());
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'grid.json' });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  private renderPanel(): void {
    if (!this.active) return;
    const on = (m: string) => (this.mode === m ? ' active' : '');
    this.panel.innerHTML = `
      <div class="ed-title">Raster-Editor <button class="close" data-ed="close" aria-label="Editor schließen">×</button></div>
      <div class="ed-row"><button class="btn small${on('build')}" data-ed="build">Bebaubar</button><button class="btn small${on('block')}" data-ed="block">Blockiert</button></div>
      <div class="ed-row"><span>Pinsel</span><button class="btn small" data-ed="b-">−</button><b>${this.brush}×${this.brush}</b><button class="btn small" data-ed="b+">+</button></div>
      <div class="ed-row"><span>Bebaubar</span><b>${this.grid.countBuildable()}</b><span>geändert</span><b>${this.changedCells}</b></div>
      <div class="ed-row"><button class="btn small primary" data-ed="export">grid.json exportieren</button><button class="btn small" data-ed="reset">Zurücksetzen</button></div>
      <div class="ed-help">Ziehen = malen · Shift/Rechtsklick = Gegenteil · B = Modus · [ ] = Pinsel · Leertaste+Ziehen = verschieben · Strg+Z = rückgängig · E = beenden</div>`;
  }
}
