/** Gemeinsame, render-unabhängige Typen der Weltkarte. */

export interface Vec2 { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

export interface WorldSize { width: number; height: number }

export interface PyramidLevel { level: number; width: number; height: number; cols: number; rows: number }

/** Eine Deep-Zoom-Kachelpyramide; level 0 = volle Auflösung. */
export interface PyramidMeta {
  name: string;
  width: number;
  height: number;
  tileSize: number;
  levels: PyramidLevel[];
  /** URL-Muster mit {level}, {x}, {y} */
  url: string;
}

export interface TilesMeta {
  world: WorldSize;
  layers: { base: PyramidMeta; detail: PyramidMeta; detail3?: PyramidMeta; detail4?: PyramidMeta };
}

export interface GridData {
  cellSize: number;
  cols: number;
  rows: number;
  buildableCount: number;
  encoding: string;
  /** Base64-Bitmaske, zeilenweise, MSB zuerst */
  buildable: string;
}

export interface Nest {
  id: string;
  /** Rasterzelle */
  cx: number;
  cy: number;
  player: string;
  level: number;
  clan: string | null;
  flag: 'red' | 'blue';
  own: boolean;
}

export interface NestsData { generatedBy: string; seed: number; cellSize: number; nests: Nest[] }
