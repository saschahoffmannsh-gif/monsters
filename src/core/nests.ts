import type { Nest, Vec2 } from './types';
import type { WorldGrid } from './grid';

/** Nester-Verwaltung (Daten + räumliche Suche), unabhängig vom Rendering. */
export class NestStore {
  readonly nests: Nest[];
  private readonly byCell = new Map<number, Nest>();

  constructor(nests: Nest[], private readonly grid: WorldGrid) {
    this.nests = nests;
    for (const n of nests) {
      this.byCell.set(n.cy * grid.cols + n.cx, n);
      grid.occupy(n.cx, n.cy);
    }
  }

  get own(): Nest | undefined { return this.nests.find((n) => n.own); }

  position(n: Nest): Vec2 { return this.grid.cellCenter(n.cx, n.cy); }

  /** nächstes Nest innerhalb radius (Welt-Einheiten) um p */
  nearest(p: Vec2, radius: number): Nest | null {
    const g = this.grid;
    const r = Math.ceil(radius / g.cellSize);
    const c = g.cellAt(p);
    let best: Nest | null = null, bestD = radius * radius;
    for (let y = c.cy - r; y <= c.cy + r; y++) {
      for (let x = c.cx - r; x <= c.cx + r; x++) {
        const n = this.byCell.get(y * g.cols + x);
        if (!n || !g.inBounds(x, y)) continue;
        const q = this.position(n);
        // Hügel steht auf der Zellmitte, Sprite ragt nach oben → Trefferpunkt etwas höher
        const d = (q.x - p.x) ** 2 + (q.y - g.cellSize * 0.3 - p.y) ** 2;
        if (d <= bestD) { bestD = d; best = n; }
      }
    }
    return best;
  }
}
