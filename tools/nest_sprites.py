"""Native Maulwurfshügel-Sprites (3 Varianten nach Level) aus tools/src/molehills_v4.jpg (Magenta-Hintergrund).
Freistellen, Farbangleich an die Karten-Erde/Licht, Kontaktschatten (nach links unten, wie die Karte)
und Boden-Abdunklungsring direkt ins PNG gebacken. Ausgabe: public/sprites/nest_{1,2,3}.png + nest_sprites.json"""
import cv2, numpy as np, json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'sprites')

def build():
    src = cv2.imread(os.path.join(ROOT, 'tools', 'src', 'molehills_v4.jpg')).astype(np.float32)
    bg = np.median(np.concatenate([src[:20].reshape(-1, 3), src[-20:].reshape(-1, 3)]), 0)
    d = np.linalg.norm(src - bg, axis=2)
    fg = (d > 60).astype(np.uint8)
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(fg)
    comps = sorted([i for i in range(1, n) if st[i, 4] > 5000], key=lambda i: st[i, 0])[:3]
    os.makedirs(OUT, exist_ok=True)
    meta = []
    for k, i in enumerate(comps):
        x, y, w, h, _ = st[i]
        # inkl. kleiner Grashalme in der Nähe: alles Vordergrund im erweiterten Rechteck
        pad = 10
        x0, y0, x1, y1 = max(0, x-pad), max(0, y-pad), min(src.shape[1], x+w+pad), min(src.shape[0], y+h+pad)
        crop = src[y0:y1, x0:x1].copy()
        dd = d[y0:y1, x0:x1]
        a = np.clip((dd - 45) / 50, 0, 1)
        # Magenta-Saum entfärben
        b_, g_, r_ = crop[..., 0], crop[..., 1], crop[..., 2]
        spill = np.clip(np.minimum(b_, r_) - g_ - 10, 0, None) * (1 - a) ** 0.5
        crop[..., 0] -= spill * 0.8; crop[..., 2] -= spill * 0.6
        # Farbangleich: warmes Abendlicht der Karte, Erde etwas heller/oranger, leicht entsättigt
        g0 = crop.mean(2, keepdims=True); crop = crop * 0.82 + g0 * 0.18
        crop = crop * np.array([0.84, 0.99, 1.03]) + np.array([6, 14, 18])
        crop = np.clip(crop, 0, 255)
        hc, wc = crop.shape[:2]
        # Leinwand vergrößern für Schatten/Ring
        S = 1.7
        W2, H2 = int(wc * S), int(hc * 1.35)
        ox, oy = (W2 - wc) // 2 + int(wc * 0.08), int(hc * 0.12)
        canvas = np.zeros((H2, W2, 4), np.float32)
        # Basis-Ellipse (Fuß des Hügels)
        base_y = oy + int(hc * 0.86); cx = ox + wc // 2
        sh = np.zeros((H2, W2), np.float32)
        cv2.ellipse(sh, (cx, base_y), (int(wc * 0.80), int(hc * 0.30)), 0, 0, 360, 0.22, -1)          # Abdunklungsring
        sh = cv2.GaussianBlur(sh, (0, 0), wc * 0.08)
        cs = np.zeros((H2, W2), np.float32)
        cv2.ellipse(cs, (cx - int(wc * 0.16), base_y + int(hc * 0.02)), (int(wc * 0.56), int(hc * 0.20)), -4, 0, 360, 0.55, -1)  # Kontaktschatten links unten
        cs = cv2.GaussianBlur(cs, (0, 0), wc * 0.045)
        shadow = 1 - (1 - sh) * (1 - cs)
        canvas[..., :3] = np.array([20, 38, 30], np.float32)   # dunkles Oliv statt Schwarz (passt zur Wiese)
        canvas[..., 3] = shadow
        # Hügel darüber
        fa = a[..., None]
        reg = canvas[oy:oy+hc, ox:ox+wc]
        out_a = fa[..., 0] + reg[..., 3] * (1 - fa[..., 0])
        rgb = (crop * fa + reg[..., :3] * reg[..., 3:4] * (1 - fa)) / np.maximum(out_a[..., None], 1e-4)
        reg[..., :3] = rgb; reg[..., 3] = out_a
        rgba = np.dstack([canvas[..., :3], canvas[..., 3] * 255])
        # auf 192px Höhe skalieren (scharf bei DPR 3)
        sc = 192 / H2
        rgba = cv2.resize(np.clip(rgba, 0, 255).astype(np.uint8), (int(W2 * sc), 192), interpolation=cv2.INTER_AREA)
        cv2.imwrite(os.path.join(OUT, f'nest_{k+1}.png'), rgba)
        meta.append({'file': f'sprites/nest_{k+1}.png', 'anchorX': cx / W2, 'anchorY': base_y / H2,
                     'moundW': wc / W2, 'moundH': hc / H2})
    json.dump(meta, open(os.path.join(OUT, 'nest_sprites.json'), 'w'), indent=1)
    return len(meta)

if __name__ == '__main__':
    print(build())
