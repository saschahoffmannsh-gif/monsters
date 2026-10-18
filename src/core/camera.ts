import type { Rect, Vec2, WorldSize } from './types';

/**
 * 2D-Kamera über der Welt (render-unabhängig).
 * - center: Weltpunkt in der Bildschirmmitte
 * - scale: Bildschirm-Pixel (CSS) pro Welt-Einheit
 * - zoom: scale relativ zur "Übersicht" (Karte füllt den Bildschirm) → 1 … maxZoom
 */
export class Camera {
  center: Vec2;
  scale = 1;
  viewW = 1;
  viewH = 1;
  /**
   * Absolute Obergrenze für scale (CSS-px pro Welt-Einheit). Wird aus der schärfsten Kachelebene
   * abgeleitet: höchstens MAX_MAGNIFY CSS-px pro Quell-Pixel (siehe main.ts). Standard: altes Verhalten.
   */
  maxScale = Infinity;
  /** Fallback, falls maxScale nicht gesetzt ist (relativ zur Übersicht) */
  maxZoomFallback = 8;
  /** Geschwindigkeit für Trägheit (Welt-Einheiten pro Sekunde) */
  private vel: Vec2 = { x: 0, y: 0 };
  private anim: null | { from: Vec2; to: Vec2; z0: number; z1: number; t: number; dur: number } = null;
  private zoomAnim: null | { anchor: Vec2; worldAnchor: Vec2; z0: number; z1: number; t: number; dur: number } = null;
  /** wird bei jeder Änderung hochgezählt (Renderer kann darauf reagieren) */
  version = 0;

  constructor(public readonly world: WorldSize) {
    this.center = { x: world.width / 2, y: world.height / 2 };
  }

  /** Scale, bei dem die Karte den Viewport gerade vollständig füllt (cover). */
  get minScale(): number {
    return Math.max(this.viewW / this.world.width, this.viewH / this.world.height);
  }
  get zoom(): number { return this.scale / this.minScale; }
  /** maximaler Zoom relativ zur Übersicht – hängt von Viewport-Größe und maxScale ab */
  get maxZoom(): number {
    return Number.isFinite(this.maxScale) ? Math.max(1, this.maxScale / this.minScale) : this.maxZoomFallback;
  }

  resize(w: number, h: number): void {
    const z = this.version === 0 ? 1 : this.zoom;
    this.viewW = Math.max(1, w);
    this.viewH = Math.max(1, h);
    this.scale = this.minScale * z;
    this.clamp();
  }

  setZoom(z: number): void {
    this.scale = this.minScale * Math.min(this.maxZoom, Math.max(1, z));
    this.clamp();
  }

  screenToWorld(p: Vec2): Vec2 {
    return { x: this.center.x + (p.x - this.viewW / 2) / this.scale, y: this.center.y + (p.y - this.viewH / 2) / this.scale };
  }
  worldToScreen(p: Vec2): Vec2 {
    return { x: (p.x - this.center.x) * this.scale + this.viewW / 2, y: (p.y - this.center.y) * this.scale + this.viewH / 2 };
  }

  /** sichtbarer Weltausschnitt */
  get visible(): Rect {
    const w = this.viewW / this.scale, h = this.viewH / this.scale;
    return { x: this.center.x - w / 2, y: this.center.y - h / 2, w, h };
  }

  /** Verschieben um Bildschirm-Pixel */
  panBy(dxScreen: number, dyScreen: number): void {
    this.stopAnimations();
    this.center.x -= dxScreen / this.scale;
    this.center.y -= dyScreen / this.scale;
    this.clamp();
  }

  /** Zoomen um Faktor, Bildschirmpunkt bleibt unter dem Finger */
  zoomAt(factor: number, screen: Vec2): void {
    this.stopAnimations();
    const before = this.screenToWorld(screen);
    const z = Math.min(this.maxZoom, Math.max(1, this.zoom * factor));
    this.scale = this.minScale * z;
    const after = this.screenToWorld(screen);
    this.center.x += before.x - after.x;
    this.center.y += before.y - after.y;
    this.clamp();
  }

  /** animierter Zoom (z. B. Doppeltipp) */
  animateZoomAt(factor: number, screen: Vec2, dur = 0.3): void {
    this.stopAnimations();
    const z1 = Math.min(this.maxZoom, Math.max(1, this.zoom * factor));
    this.zoomAnim = { anchor: { ...screen }, worldAnchor: this.screenToWorld(screen), z0: this.zoom, z1, t: 0, dur };
  }

  /** Kamerafahrt zu einem Weltpunkt mit Ziel-Zoom */
  flyTo(target: Vec2, zoom: number, dur = 1.4): void {
    this.stopAnimations();
    this.anim = { from: { ...this.center }, to: { ...target }, z0: this.zoom, z1: Math.min(this.maxZoom, Math.max(1, zoom)), t: 0, dur };
  }

  /** Trägheit nach Loslassen; v in Bildschirm-Pixel/s */
  fling(vxScreen: number, vyScreen: number): void {
    this.vel = { x: -vxScreen / this.scale, y: -vyScreen / this.scale };
  }

  stopAnimations(): void {
    this.vel = { x: 0, y: 0 };
    this.anim = null;
    this.zoomAnim = null;
  }

  get animating(): boolean {
    return !!this.anim || !!this.zoomAnim || Math.hypot(this.vel.x, this.vel.y) * this.scale > 5;
  }

  /** pro Frame aufrufen; dt in Sekunden. Gibt true zurück, wenn sich etwas bewegt hat. */
  update(dt: number): boolean {
    let moved = false;
    if (this.anim) {
      const a = this.anim;
      a.t = Math.min(1, a.t + dt / a.dur);
      const e = a.t < 0.5 ? 4 * a.t ** 3 : 1 - (-2 * a.t + 2) ** 3 / 2; // easeInOutCubic
      // Zoom logarithmisch interpolieren, in der Mitte leicht herauszoomen (Flug-Effekt)
      const lz = Math.log(a.z0) + (Math.log(a.z1) - Math.log(a.z0)) * e;
      const dist = Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y) / this.world.width;
      const hop = Math.min(1.2, dist * 3) * Math.sin(Math.PI * e);
      this.scale = this.minScale * Math.max(1, Math.exp(lz - hop));
      this.center = { x: a.from.x + (a.to.x - a.from.x) * e, y: a.from.y + (a.to.y - a.from.y) * e };
      if (a.t >= 1) this.anim = null;
      moved = true;
    } else if (this.zoomAnim) {
      const a = this.zoomAnim;
      a.t = Math.min(1, a.t + dt / a.dur);
      const e = 1 - (1 - a.t) ** 3;
      this.scale = this.minScale * Math.exp(Math.log(a.z0) + (Math.log(a.z1) - Math.log(a.z0)) * e);
      const now = this.screenToWorld(a.anchor);
      this.center.x += a.worldAnchor.x - now.x;
      this.center.y += a.worldAnchor.y - now.y;
      if (a.t >= 1) this.zoomAnim = null;
      moved = true;
    } else if (this.vel.x || this.vel.y) {
      this.center.x += this.vel.x * dt;
      this.center.y += this.vel.y * dt;
      const decay = Math.exp(-dt * 4.5);
      this.vel.x *= decay; this.vel.y *= decay;
      if (Math.hypot(this.vel.x, this.vel.y) * this.scale < 5) this.vel = { x: 0, y: 0 };
      moved = true;
    }
    if (moved) this.clamp();
    return moved;
  }

  /** Kamera-Grenzen: Sichtbereich bleibt innerhalb der Karte */
  clamp(): void {
    this.scale = Math.min(this.minScale * this.maxZoom, Math.max(this.minScale, this.scale));
    const hw = this.viewW / this.scale / 2, hh = this.viewH / this.scale / 2;
    const cx = Math.min(this.world.width - hw, Math.max(hw, this.center.x));
    const cy = Math.min(this.world.height - hh, Math.max(hh, this.center.y));
    if (cx !== this.center.x) this.vel.x = 0;
    if (cy !== this.center.y) this.vel.y = 0;
    this.center = { x: cx, y: cy };
    this.version++;
  }
}
