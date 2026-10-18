import { Container, Graphics } from 'pixi.js';
import type { Camera } from '../core/camera';
import type { WorldGrid } from '../core/grid';

/** Debug-Ansicht des unsichtbaren Rasters: bebaubare Zellen grün, belegte orange. */
export class GridOverlay {
  readonly container = new Container();
  private readonly cells = new Graphics();
  private readonly lines = new Graphics();
  enabled = false;
  /** Editor-Ansicht: blockierte Zellen zusätzlich rot tönen */
  editMode = false;
  private builtVersion = -1;

  constructor(private readonly grid: WorldGrid) {
    this.container.addChild(this.cells, this.lines);
    this.container.visible = false;
    this.build();
  }

  build(): void {
    const g = this.grid, s = g.cellSize;
    this.builtVersion = g.version;
    this.cells.clear();
    if (this.editMode) {
      for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) if (!g.isBuildable(x, y)) this.cells.rect(x * s, y * s, s, s);
      this.cells.fill({ color: 0xff2a2a, alpha: 0.16 });
    }
    for (let y = 0; y < g.rows; y++) {
      for (let x = 0; x < g.cols; x++) {
        if (!g.isBuildable(x, y)) continue;
        this.cells.rect(x * s + 0.5, y * s + 0.5, s - 1, s - 1);
      }
    }
    this.cells.fill({ color: 0x39ff6a, alpha: 0.33 });
    for (let y = 0; y < g.rows; y++) {
      for (let x = 0; x < g.cols; x++) {
        if (g.isBuildable(x, y) && !g.isFree(x, y)) this.cells.rect(x * s + 0.5, y * s + 0.5, s - 1, s - 1);
      }
    }
    this.cells.fill({ color: 0xff8a00, alpha: 0.6 });
    this.lines.clear();
    for (let x = 0; x <= g.cols; x++) this.lines.moveTo(x * s, 0).lineTo(x * s, g.rows * s);
    for (let y = 0; y <= g.rows; y++) this.lines.moveTo(0, y * s).lineTo(g.cols * s, y * s);
    this.lines.stroke({ width: 1, color: 0xffffff, alpha: 0.35, pixelLine: true });
  }

  toggle(on = !this.enabled): boolean {
    this.enabled = on;
    this.container.visible = on;
    return on;
  }

  setEditMode(on: boolean): void { this.editMode = on; this.build(); }

  update(cam: Camera): void {
    if (!this.enabled) return;
    if (this.builtVersion !== this.grid.version) this.build();
    // Linien erst zeigen, wenn Zellen groß genug sind (> 12 px), sonst Moiré
    const px = this.grid.cellSize * cam.scale;
    this.lines.alpha = Math.min(1, Math.max(0, (px - 12) / 12));
  }
}
