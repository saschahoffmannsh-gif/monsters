import { Application, Container } from 'pixi.js';
import type { Camera } from '../core/camera';
import type { WorldGrid } from '../core/grid';
import type { NestStore } from '../core/nests';
import { TilePyramid } from '../core/tiles';
import type { TilesMeta } from '../core/types';
import { detail3Alpha, detailAlpha, nestAlpha } from '../core/lod';
import { TileLayer } from './TileLayer';
import { NestLayer } from './NestLayer';
import { GridOverlay } from './GridOverlay';

/** Pixi-Darstellung der Weltkarte. Kennt die Kern-Logik, aber nicht umgekehrt. */
export class MapRenderer {
  readonly app = new Application();
  readonly world = new Container();
  base!: TileLayer;
  detail!: TileLayer;
  /** Zoomstufe 3 (optional, falls in tiles.json vorhanden) */
  detail3: TileLayer | null = null;
  nests!: NestLayer;
  grid!: GridOverlay;
  private dpr = 1;

  constructor(private readonly cam: Camera, private readonly meta: TilesMeta, private readonly gridData: WorldGrid, private readonly store: NestStore) {}

  async init(parent: HTMLElement): Promise<void> {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    await this.app.init({
      resizeTo: parent,
      background: '#1d2a14',
      antialias: false,
      autoDensity: true,
      resolution: this.dpr,
      powerPreference: 'high-performance',
    });
    parent.appendChild(this.app.canvas);
    this.app.stage.addChild(this.world);

    this.base = new TileLayer(new TilePyramid(this.meta.layers.base, this.meta.world));
    this.detail = new TileLayer(new TilePyramid(this.meta.layers.detail, this.meta.world));
    this.grid = new GridOverlay(this.gridData);
    this.nests = new NestLayer(this.store);
    this.world.addChild(this.base.container, this.detail.container);
    if (this.meta.layers.detail3) {
      this.detail3 = new TileLayer(new TilePyramid(this.meta.layers.detail3, this.meta.world));
      this.world.addChild(this.detail3.container);
    }
    this.world.addChild(this.grid.container, this.nests.container);
    // detail3 wird nicht vorgeladen (seine gröbste Ebene ist nie sichtbar) – Kacheln kommen bei Bedarf
    await Promise.all([this.base.preload(), this.detail.preload(), this.nests.init()]);
  }

  /** pro Frame: Welt-Container an Kamera ausrichten und Ebenen aktualisieren */
  render(dt: number): void {
    const c = this.cam;
    this.world.scale.set(c.scale);
    this.world.position.set(c.viewW / 2 - c.center.x * c.scale, c.viewH / 2 - c.center.y * c.scale);
    const da = detailAlpha(c.zoom);
    // Basis ausblenden, sobald Detail vollständig deckt (spart Füllrate)
    const d3 = this.detail3 ? detail3Alpha(c.scale) : 0;
    this.base.update(c, this.dpr, da >= 1 ? 0 : 1);
    // Zoomstufe 2 bleibt als Unterlage, bis Zoomstufe 3 voll deckt UND ihre Kacheln geladen sind
    const d3ready = d3 >= 1 && this.detail3!.pending === 0;
    this.detail.update(c, this.dpr, d3ready ? 0 : da);
    this.detail3?.update(c, this.dpr, d3);
    this.grid.update(c);
    this.nests.update(c, nestAlpha(c.zoom), dt);
  }

  get pendingTiles(): number { return this.base.pending + this.detail.pending + (this.detail3?.pending ?? 0); }
}
