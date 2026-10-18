import type { GridData, Rect, Vec2 } from './types';

/** Unsichtbares Welt-Raster: jede Zelle ist bebaubar (Wiese) oder blockiert. */
export class WorldGrid {
  readonly cellSize: number;
  readonly cols: number;
  readonly rows: number;
  private readonly bits: Uint8Array;
  /** wird bei jeder Raster-Änderung (Editor) hochgezählt */
  version = 0;
  private readonly occupied = new Set<number>();

  constructor(data: GridData) {
    this.cellSize = data.cellSize;
    this.cols = data.cols;
    this.rows = data.rows;
    const bin = atob(data.buildable);
    this.bits = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) this.bits[i] = bin.charCodeAt(i);
  }

  get cellCount(): number { return this.cols * this.rows; }

  inBounds(cx: number, cy: number): boolean {
    return cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows;
  }

  isBuildable(cx: number, cy: number): boolean {
    if (!this.inBounds(cx, cy)) return false;
    const i = cy * this.cols + cx;
    return (this.bits[i >> 3] & (0x80 >> (i & 7))) !== 0;
  }

  /** Editor: Zelle bebaubar/blockiert setzen. Gibt true zurück, wenn sich etwas geändert hat. */
  setBuildable(cx: number, cy: number, on: boolean): boolean {
    if (!this.inBounds(cx, cy) || this.isBuildable(cx, cy) === on) return false;
    const i = cy * this.cols + cx;
    if (on) this.bits[i >> 3] |= 0x80 >> (i & 7);
    else this.bits[i >> 3] &= ~(0x80 >> (i & 7));
    this.version++;
    return true;
  }

  /** Bitmaske als Base64 (gleiches Format wie grid.json) */
  toBase64(): string {
    let s = '';
    for (let i = 0; i < this.bits.length; i += 0x8000) s += String.fromCharCode(...this.bits.subarray(i, i + 0x8000));
    return btoa(s);
  }

  /** Export im Format von public/data/grid.json */
  toJSON(): GridData {
    return {
      cellSize: this.cellSize, cols: this.cols, rows: this.rows, buildableCount: this.countBuildable(),
      encoding: 'base64 bitmask, row-major, MSB first, 1 = bebaubar (Wiese)', buildable: this.toBase64(),
    };
  }

  /** bebaubar und noch nicht belegt */
  isFree(cx: number, cy: number): boolean {
    return this.isBuildable(cx, cy) && !this.occupied.has(cy * this.cols + cx);
  }

  occupy(cx: number, cy: number): void { this.occupied.add(cy * this.cols + cx); }
  release(cx: number, cy: number): void { this.occupied.delete(cy * this.cols + cx); }

  countBuildable(): number {
    let n = 0;
    for (let i = 0; i < this.cellCount; i++) if (this.bits[i >> 3] & (0x80 >> (i & 7))) n++;
    return n;
  }

  cellAt(p: Vec2): { cx: number; cy: number } {
    return { cx: Math.floor(p.x / this.cellSize), cy: Math.floor(p.y / this.cellSize) };
  }

  cellCenter(cx: number, cy: number): Vec2 {
    return { x: (cx + 0.5) * this.cellSize, y: (cy + 0.5) * this.cellSize };
  }

  /** Zellbereich, der ein Welt-Rechteck überdeckt (geklemmt) */
  cellRange(r: Rect): { x0: number; y0: number; x1: number; y1: number } {
    const s = this.cellSize;
    return {
      x0: Math.max(0, Math.floor(r.x / s)), y0: Math.max(0, Math.floor(r.y / s)),
      x1: Math.min(this.cols - 1, Math.floor((r.x + r.w) / s)), y1: Math.min(this.rows - 1, Math.floor((r.y + r.h) / s)),
    };
  }
}
