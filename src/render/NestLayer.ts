import { Assets, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Camera } from '../core/camera';
import type { NestStore } from '../core/nests';
import type { Nest } from '../core/types';

/** Höhe eines Maulwurfshügels inkl. Fahne in Welt-Einheiten (Auto ≈ 20 × 12). */
export const NEST_HEIGHT = 15;

interface SpriteMeta { file: string; anchorX: number; anchorY: number; moundW: number; moundH: number }

export class NestLayer {
  readonly container = new Container({ sortableChildren: true });
  private readonly sprites = new Map<string, Container>();
  private readonly ownRing = new Graphics();
  private readonly selRing = new Graphics();
  private selected: Nest | null = null;
  private t = 0;

  constructor(private readonly store: NestStore) {}

  async init(): Promise<void> {
    // Native Hügel-Varianten (Level 1–9 / 10–19 / 20+), Kontaktschatten + Abdunklungsring im PNG gebacken
    const meta: SpriteMeta[] = await (await fetch('./sprites/nest_sprites.json')).json();
    const tex = await Promise.all(meta.map((m) => Assets.load<Texture>('./' + m.file)));
    for (const n of this.store.nests) {
      const v = n.level >= 20 ? 2 : n.level >= 10 ? 1 : 0;
      const m = meta[Math.min(v, meta.length - 1)], t = tex[Math.min(v, tex.length - 1)];
      const grow = [0.82, 1.0, 1.18][v];
      const p = this.store.position(n);
      const c = new Container();
      const s = new Sprite(t);
      s.anchor.set(m.anchorX, m.anchorY);
      // Hügelhöhe (ohne Schattenrand) = NEST_HEIGHT * grow
      s.scale.set((NEST_HEIGHT * grow) / (t.height * m.moundH));
      c.addChild(s);
      // dezente Clan-Fahne (kleiner Wimpel) oben rechts am Hügel
      if (n.clan || n.own) {
        const h = NEST_HEIGHT * grow, col = n.flag === 'blue' ? 0x3d7bd9 : 0xd2452f;
        const g = new Graphics();
        const fx = h * 0.28, fy = -h * 0.78;
        g.moveTo(fx, fy).lineTo(fx, fy - h * 0.55).stroke({ width: 0.45, color: 0x5a4632 });
        g.poly([fx, fy - h * 0.55, fx + h * 0.32, fy - h * 0.46, fx, fy - h * 0.37]).fill({ color: col, alpha: 0.92 });
        c.addChild(g);
      }
      c.position.set(p.x, p.y + 2);
      c.zIndex = p.y; // weiter unten = davor (Schrägansicht)
      this.sprites.set(n.id, c);
      this.container.addChild(c);
    }
    // Ringe (Ellipsen wegen Schrägansicht)
    this.ownRing.ellipse(0, 0, 11, 5.5).stroke({ width: 1.6, color: 0xffd23f, alpha: 0.95 });
    this.selRing.ellipse(0, 0, 11, 5.5).fill({ color: 0xffffff, alpha: 0.25 }).stroke({ width: 1.4, color: 0xffffff, alpha: 1 });
    this.ownRing.zIndex = this.selRing.zIndex = -1;
    this.container.addChild(this.ownRing, this.selRing);
    const own = this.store.own;
    if (own) { const p = this.store.position(own); this.ownRing.position.set(p.x, p.y + 2); }
    this.selRing.visible = false;
  }

  select(n: Nest | null): void {
    this.selected = n;
    this.selRing.visible = !!n;
    if (n) { const p = this.store.position(n); this.selRing.position.set(p.x, p.y + 2); }
  }

  update(cam: Camera, alpha: number, dt: number): void {
    this.container.alpha = alpha;
    this.container.visible = alpha > 0.002;
    if (!this.container.visible) return;
    const v = cam.visible, m = 20;
    for (const [, s] of this.sprites) {
      s.visible = s.x > v.x - m && s.x < v.x + v.w + m && s.y > v.y - m && s.y < v.y + v.h + m;
    }
    this.t += dt;
    const k = 1 + 0.12 * Math.sin(this.t * 4);
    this.ownRing.scale.set(k);
    if (this.selected) this.selRing.scale.set(1 + 0.06 * Math.sin(this.t * 6));
  }
}
