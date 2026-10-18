/**
 * Mobiler Vollbild-Viewport:
 * - #app deckt immer die gesamte sichtbare Fläche (100lvh/100dvh + visualViewport-Messung),
 *   damit kein leerer Streifen unter der Karte bleibt (iOS-In-App-Browser, Safari-Toolbar ein/aus).
 * - HUD-Abstände über CSS-Variablen: --safe-top / --safe-bottom = max(env(safe-area-inset-*), gemessene Überdeckung).
 *   Fallback für iOS-WebViews, die env() = 0 melden, obwohl die Seite unter Statusleiste/Notch liegt.
 */
export function setupViewport(root: HTMLElement, onResize: (w: number, h: number) => void): void {
  const doc = document.documentElement;
  const probe = Object.assign(document.createElement('div'), { className: 'safe-probe' });
  document.body.appendChild(probe);
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1);
  let lastW = -1, lastH = -1;

  const apply = () => {
    const vv = window.visualViewport;
    const vvH = vv ? vv.height + vv.offsetTop : window.innerHeight;
    // größte bekannte Höhe: so endet die Karte nie oberhalb des Bildschirmrands
    const h = Math.max(window.innerHeight, vvH, doc.clientHeight, root.getBoundingClientRect().height);
    doc.style.setProperty('--app-h', `${Math.round(h)}px`);
    const envTop = parseFloat(getComputedStyle(probe).paddingTop) || 0;
    const envBottom = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
    // Seite liegt im Vollbild (unter der Statusleiste), meldet aber keinen Safe-Area-Inset → Fallback
    const fullscreenLike = isIOS && Math.abs(window.screen.height - h) < 4 && envTop === 0;
    const top = Math.max(envTop, fullscreenLike ? 54 : 0);
    // Teil der App unterhalb des sichtbaren Bereichs (z. B. von einer Toolbar überdeckt)
    const hiddenBottom = Math.max(0, h - vvH);
    const bottom = Math.max(envBottom, hiddenBottom, fullscreenLike ? 34 : 0);
    doc.style.setProperty('--safe-top', `${Math.round(top)}px`);
    doc.style.setProperty('--safe-bottom', `${Math.round(bottom)}px`);
    const w = root.clientWidth, rh = root.clientHeight;
    if (w !== lastW || rh !== lastH) { lastW = w; lastH = rh; onResize(w, rh); }
  };
  let raf = 0;
  const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(apply); };
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', () => { schedule(); window.setTimeout(apply, 350); });
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);
  new ResizeObserver(schedule).observe(root);
  apply();
}
