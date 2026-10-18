import type { PyramidMeta, Rect, WorldSize } from './types';

export interface TileRef {
  key: string;
  url: string;
  level: number;
  x: number;
  y: number;
  /** Welt-Rechteck, das die Kachel bedeckt */
  rect: Rect;
}

/** Reine Kachel-Logik: welche Pyramidenstufe/Kacheln werden für einen Sichtbereich gebraucht. */
export class TilePyramid {
  /** Bild-Pixel pro Welt-Einheit auf Stufe 0 */
  private readonly ppw: number;

  constructor(readonly meta: PyramidMeta, readonly world: WorldSize) {
    this.ppw = meta.width / world.width;
  }

  get coarsest(): number { return this.meta.levels.length - 1; }

  levelScale(level: number): number {
    // tatsächliche Pixelbreite der Stufe / Weltbreite
    return this.meta.levels[level].width / this.world.width;
  }

  /** gröbste Stufe, die mindestens `devicePxPerWorld` Auflösung liefert */
  pickLevel(devicePxPerWorld: number): number {
    for (let l = this.coarsest; l >= 0; l--) {
      if (this.levelScale(l) >= devicePxPerWorld * 0.85) return l;
    }
    return 0;
  }

  tilesFor(view: Rect, level: number, margin = 0): TileRef[] {
    const L = this.meta.levels[level];
    const s = this.levelScale(level);
    const T = this.meta.tileSize;
    const x0 = Math.max(0, Math.floor(((view.x - margin) * s) / T));
    const y0 = Math.max(0, Math.floor(((view.y - margin) * s) / T));
    const x1 = Math.min(L.cols - 1, Math.floor(((view.x + view.w + margin) * s) / T));
    const y1 = Math.min(L.rows - 1, Math.floor(((view.y + view.h + margin) * s) / T));
    const out: TileRef[] = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(this.tile(level, x, y));
    return out;
  }

  tile(level: number, x: number, y: number): TileRef {
    const L = this.meta.levels[level];
    const s = this.levelScale(level);
    const T = this.meta.tileSize;
    const pw = Math.min(T, L.width - x * T), ph = Math.min(T, L.height - y * T);
    return {
      key: `${this.meta.name}/${level}/${x}_${y}`,
      url: this.meta.url.replace('{level}', String(level)).replace('{x}', String(x)).replace('{y}', String(y)),
      level, x, y,
      rect: { x: (x * T) / s, y: (y * T) / s, w: pw / s, h: ph / s },
    };
  }

  get pixelsPerWorld(): number { return this.ppw; }
}
