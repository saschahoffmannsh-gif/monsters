import { Assets, Container, Sprite, Texture } from 'pixi.js';
import type { Camera } from '../core/camera';
import type { TilePyramid, TileRef } from '../core/tiles';

interface Entry {
  ref: TileRef;
  sprite?: Sprite;
  state: 'queued' | 'loading' | 'ready' | 'failed';
  lastUsed: number;
}

const intersects = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * Zeigt eine Kachelpyramide; lädt nur sichtbare Kacheln (plus kleinen Rand),
 * nutzt gröbere, bereits geladene Stufen als Platzhalter und verwirft alte Kacheln (LRU).
 */
export class TileLayer {
  readonly container = new Container({ sortableChildren: true });
  private readonly entries = new Map<string, Entry>();
  private inFlight = 0;
  private queue: Entry[] = [];
  private frame = 0;

  constructor(private readonly pyr: TilePyramid, private readonly maxTiles = 180, private readonly maxParallel = 6) {}

  /** gröbste Stufe vorladen (immer vorhanden → keine Löcher) */
  async preload(): Promise<void> {
    const L = this.pyr.coarsest;
    const refs = this.pyr.tilesFor({ x: 0, y: 0, w: this.pyr.world.width, h: this.pyr.world.height }, L);
    await Promise.all(refs.map((r) => this.load(this.entry(r))));
  }

  get loadedCount(): number { let n = 0; for (const e of this.entries.values()) if (e.state === 'ready') n++; return n; }
  get pending(): number { return this.inFlight + this.queue.length; }

  update(cam: Camera, dpr: number, alpha: number): void {
    this.frame++;
    this.container.alpha = alpha;
    this.container.visible = alpha > 0.002;
    if (!this.container.visible) { this.queue = []; return; }

    const view = cam.visible;
    const target = this.pyr.pickLevel(cam.scale * dpr);
    const coarse = this.pyr.coarsest;
    const margin = 0.15 * Math.max(view.w, view.h);

    // benötigte Kacheln anfordern (Mitte zuerst)
    const wanted = this.pyr.tilesFor(view, target, margin);
    const cx = view.x + view.w / 2, cy = view.y + view.h / 2;
    wanted.sort((a, b) => Math.hypot(a.rect.x + a.rect.w / 2 - cx, a.rect.y + a.rect.h / 2 - cy) - Math.hypot(b.rect.x + b.rect.w / 2 - cx, b.rect.y + b.rect.h / 2 - cy));
    const newQueue: Entry[] = [];
    for (const r of wanted) {
      const e = this.entry(r);
      e.lastUsed = this.frame;
      if (e.state === 'queued') newQueue.push(e);
    }
    // veraltete Wünsche verwerfen (z. B. nach schnellem Zoom)
    for (const e of this.queue) if (!newQueue.includes(e) && e.state === 'queued') this.entries.delete(e.ref.key);
    this.queue = newQueue;
    this.pump();

    // Sichtbarkeit: Zielstufe + bis zu 2 gröbere Stufen als Platzhalter + gröbste Stufe
    const pad = 1 / cam.scale; // 1 Bildschirm-Pixel Überlappung gegen Haarlinien
    for (const e of this.entries.values()) {
      const s = e.sprite;
      if (!s) continue;
      const lvl = e.ref.level;
      const show = intersects(e.ref.rect, view) && lvl >= target && (lvl <= target + 2 || lvl === coarse);
      s.visible = show;
      if (show) {
        e.lastUsed = this.frame;
        s.width = e.ref.rect.w + pad;
        s.height = e.ref.rect.h + pad;
      }
    }
    this.evict(coarse);
  }

  private entry(r: TileRef): Entry {
    let e = this.entries.get(r.key);
    if (!e) { e = { ref: r, state: 'queued', lastUsed: this.frame }; this.entries.set(r.key, e); }
    return e;
  }

  private pump(): void {
    while (this.inFlight < this.maxParallel && this.queue.length) {
      const e = this.queue.shift()!;
      if (e.state === 'queued') void this.load(e);
    }
  }

  private async load(e: Entry): Promise<void> {
    if (e.state !== 'queued') return;
    e.state = 'loading';
    this.inFlight++;
    try {
      const tex = await Assets.load<Texture>(e.ref.url);
      if (!this.entries.has(e.ref.key)) { void Assets.unload(e.ref.url); return; }
      const s = new Sprite(tex);
      s.position.set(e.ref.rect.x, e.ref.rect.y);
      s.width = e.ref.rect.w; s.height = e.ref.rect.h;
      s.zIndex = 100 - e.ref.level; // grobe Stufen unten
      s.visible = false;
      this.container.addChild(s);
      e.sprite = s;
      e.state = 'ready';
    } catch (err) {
      e.state = 'failed';
      console.warn('Kachel fehlgeschlagen', e.ref.url, err);
    } finally {
      this.inFlight--;
      this.pump();
    }
  }

  private evict(coarse: number): void {
    const ready = [...this.entries.values()].filter((e) => e.state === 'ready' && e.ref.level !== coarse && !e.sprite?.visible);
    let over = this.loadedCount - this.maxTiles;
    if (over <= 0) return;
    ready.sort((a, b) => a.lastUsed - b.lastUsed);
    for (const e of ready) {
      if (over-- <= 0) break;
      e.sprite?.destroy();
      void Assets.unload(e.ref.url);
      this.entries.delete(e.ref.key);
    }
  }
}
