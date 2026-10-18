/** Zoom-abhängige Sichtbarkeit (Level of Detail) – zentral, damit Spiel-Client & Renderer gleich entscheiden. */
export const LOD = {
  /** Überblendung Basiskarte → Zoomstufe 2 */
  detailFrom: 2.0,
  detailTo: 3.0,
  /** Nester einblenden */
  nestsFrom: 2.5,
  nestsTo: 3.1,
  /** Nester ab hier antippbar */
  nestsTapMin: 2.7,
  /** Überblendung Zoomstufe 2 → Zoomstufe 3, auf ABSOLUTEM scale (CSS-px pro Welt-Einheit),
   *  weil Zoomstufe 2 bei ~1.08 px/Welt-Einheit ihre native Auflösung erreicht. */
  detail3FromScale: 0.9,
  detail3ToScale: 1.3,
} as const;

/** max. Vergrößerung der schärfsten Kachelebene: CSS-px pro Quell-Pixel */
export const MAX_MAGNIFY = 1.25;

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export const detailAlpha = (zoom: number) => smoothstep(LOD.detailFrom, LOD.detailTo, zoom);
export const detail3Alpha = (scale: number) => smoothstep(LOD.detail3FromScale, LOD.detail3ToScale, scale);
export const nestAlpha = (zoom: number) => smoothstep(LOD.nestsFrom, LOD.nestsTo, zoom);

export function zoomStageLabel(zoom: number, scale = 0): string {
  if (scale >= LOD.detail3FromScale && zoom >= LOD.nestsFrom) return 'Nester · Zoomstufe 3';
  if (zoom >= LOD.nestsFrom) return 'Nester';
  if (zoom >= LOD.detailFrom) return 'Detail';
  return 'Übersicht';
}
