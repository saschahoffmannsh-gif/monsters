import { Assets, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Camera } from '../core/camera';
import type { NestStore } from '../core/nests';
import type { Nest } from '../core/types';

/** Höhe eines Maulwurfshügels inkl. Fahne in Welt-Einheiten (Auto ≈ 20 × 12). */
export const NEST_HEIGHT = 15;

export class NestLayer {
  readonly container = new Container({ sortableChildren: true });
  private readonly sprites = new Map<string, Sprite>();
  private readonly ownRing = new Graphics();
  private readonly selRing = new Graphics();
  private selected: Nest | null = null;
  private t = 0;

  constructor(private readonly store: NestStore) {}

  async init(): Promise<void> {
    const [red, blue] = await Promise.all([
      Assets.load<Texture>('./sprites/molehill_red.png'),
      Assets.load<Texture>('./sprites/molehill_blue.png'),
    ]);
    const sc = NEST_HEIGHT / red.height;
    for (const n of this.store.nests) {
      const s = new Sprite(n.flag === 'blue' ? blue : red);
      const p = this.store.position(n);
      s.anchor.set(0.5, 0.88);
      s.scale.set(sc);
      s.position.set(p.x, p.y + 2);
      s.zIndex = p.y; // weiter unten = davor (Schrägansicht)
      this.sprites.set(n.id, s);
      this.container.addChild(s);
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
