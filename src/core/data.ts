import type { GridData, NestsData, TilesMeta } from './types';

/** Lädt die (später vom Server kommenden) Kartendaten. */
async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return (await r.json()) as T;
}

export interface MapData { tiles: TilesMeta; grid: GridData; nests: NestsData }

export async function loadMapData(base = './data/'): Promise<MapData> {
  const [tiles, grid, nests] = await Promise.all([
    getJson<TilesMeta>(base + 'tiles.json'),
    getJson<GridData>(base + 'grid.json'),
    getJson<NestsData>(base + 'nests.json'),
  ]);
  return { tiles, grid, nests };
}
