import type { Camera } from '../core/camera';
import type { Vec2 } from '../core/types';

export interface GestureCallbacks {
  /** einfacher Tipp (ohne Bewegung) an Bildschirmposition */
  onTap?: (p: Vec2) => void;
}

/**
 * Pan (Maus/Touch), Zoom (Mausrad, Pinch, Doppeltipp), Trägheit.
 * Arbeitet nur mit DOM-Events + Camera – unabhängig vom Renderer.
 */
export function attachGestures(el: HTMLElement, cam: Camera, cb: GestureCallbacks = {}): () => void {
  const pts = new Map<number, Vec2>();
  let lastPinchDist = 0;
  let lastPinchMid: Vec2 | null = null;
  let downPos: Vec2 | null = null;
  let downTime = 0;
  let moved = false;
  let lastTap = { t: 0, p: { x: 0, y: 0 } };
  let tapTimer: number | undefined;
  const samples: { t: number; x: number; y: number }[] = [];

  const local = (e: PointerEvent | WheelEvent | MouseEvent): Vec2 => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: PointerEvent) => {
    el.setPointerCapture(e.pointerId);
    const p = local(e);
    pts.set(e.pointerId, p);
    cam.stopAnimations();
    if (pts.size === 1) {
      downPos = p; downTime = performance.now(); moved = false;
      samples.length = 0; samples.push({ t: downTime, ...p });
    } else {
      moved = true; // Mehrfinger = kein Tipp
      lastPinchDist = 0; lastPinchMid = null;
    }
  };

  const onMove = (e: PointerEvent) => {
    const prev = pts.get(e.pointerId);
    if (!prev) return;
    const p = local(e);
    pts.set(e.pointerId, p);
    if (pts.size === 1) {
      if (downPos && Math.hypot(p.x - downPos.x, p.y - downPos.y) > 8) moved = true;
      if (moved) cam.panBy(p.x - prev.x, p.y - prev.y);
      const t = performance.now();
      samples.push({ t, ...p });
      while (samples.length > 2 && t - samples[0].t > 100) samples.shift();
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (lastPinchDist > 0 && lastPinchMid) {
        cam.panBy(mid.x - lastPinchMid.x, mid.y - lastPinchMid.y);
        cam.zoomAt(d / lastPinchDist, mid);
      }
      lastPinchDist = d; lastPinchMid = mid;
    }
  };

  const onUp = (e: PointerEvent) => {
    if (!pts.has(e.pointerId)) return;
    const p = local(e);
    const wasSingle = pts.size === 1;
    pts.delete(e.pointerId);
    if (pts.size === 1) {
      // vom Pinch zurück zu einem Finger: neu ansetzen ohne Sprung
      lastPinchDist = 0; lastPinchMid = null; samples.length = 0;
      return;
    }
    if (!wasSingle) return;
    const now = performance.now();
    if (moved) {
      // Trägheit aus den letzten ~100 ms
      if (samples.length >= 2) {
        const a = samples[0], b = samples[samples.length - 1];
        const dt = (b.t - a.t) / 1000;
        if (dt > 0 && now - b.t < 60) cam.fling((b.x - a.x) / dt, (b.y - a.y) / dt);
      }
      return;
    }
    if (now - downTime > 500) return; // langes Drücken ignorieren
    // Doppeltipp → hineinzoomen; einfacher Tipp wird kurz verzögert gemeldet
    if (now - lastTap.t < 300 && Math.hypot(p.x - lastTap.p.x, p.y - lastTap.p.y) < 30) {
      window.clearTimeout(tapTimer);
      lastTap = { t: 0, p };
      cam.animateZoomAt(2, p);
      return;
    }
    lastTap = { t: now, p };
    tapTimer = window.setTimeout(() => cb.onTap?.(p), 220);
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    // ~0,85× pro Raststufe (deltaY ≈ 100)
    cam.zoomAt(Math.exp(-dy * 0.0016), local(e));
  };

  const onDbl = (e: MouseEvent) => e.preventDefault();

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('dblclick', onDbl);
  el.style.touchAction = 'none';
  return () => {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
    el.removeEventListener('wheel', onWheel);
    el.removeEventListener('dblclick', onDbl);
  };
}
