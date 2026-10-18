"""Wiesen-Erkennung für das Bau-Raster (aus der scharfen Zoomstufe-3-Karte).

Pro Pixel (2 px je Welt-Einheit):
  Farbe   – Lab-Farbwinkel im Gelbgrün-Bereich, genug Sättigung, nicht zu dunkel (Baumkronen/Schatten)
  Textur  – geringe Kantendichte (Wiese ist ruhig; Bäume, Dächer, Schutt, Zäune sind unruhig)
  Morphologie – Öffnen/Schließen, kleine Inseln weg, dann Sicherheitsabstand (Erosion) zu allem anderen
Zelle bebaubar, wenn ≥ FRAC der Zellfläche Wiese ist.
"""
import cv2, numpy as np

PPW = 2            # Pixel pro Welt-Einheit für die Analyse
MARGIN_W = 3       # Sicherheitsabstand in Welt-Einheiten
FRAC = 0.88

def meadow_mask(img_bgr, world_w, world_h, debug=None):
    im = cv2.resize(img_bgr, (world_w * PPW, world_h * PPW), interpolation=cv2.INTER_AREA)
    lab = cv2.cvtColor(cv2.GaussianBlur(im, (0, 0), 1.0), cv2.COLOR_BGR2LAB).astype(np.float32)
    L, a, b = lab[..., 0], lab[..., 1] - 128, lab[..., 2] - 128
    C = np.hypot(a, b); hue = np.degrees(np.arctan2(b, a))
    colour = (hue > 62) & (hue < 125) & (C > 34) & (L > 95)
    g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32)
    lap = np.abs(cv2.Laplacian(cv2.GaussianBlur(g, (0, 0), 2.0), cv2.CV_32F, ksize=3))
    sob = np.hypot(cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3), cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3))
    tex = cv2.GaussianBlur(lap, (0, 0), 4.0)
    edges = cv2.GaussianBlur((cv2.GaussianBlur(sob,(0,0),1.5) > 90).astype(np.float32), (0, 0), 3.0)
    calm = (tex < TEX_T) & (edges < 0.30)
    water = (hue > 150) & (hue < 260) & (C > 12)
    m = (colour & calm & ~water).astype(np.float32)
    m = (cv2.GaussianBlur(m, (0, 0), 3.0) > 0.5).astype(np.uint8)   # Mehrheitsfilter gegen Textur-Sprenkel
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    n, lab_, st, _ = cv2.connectedComponentsWithStats(m, 4)
    keep = np.zeros(n, bool); keep[1:] = st[1:, 4] >= (20 * PPW) ** 2 * 3   # mind. ~3 Zellen groß
    m = keep[lab_].astype(np.uint8)
    # kleine Löcher (Grasbüschel, Blumen, Texturflecken) füllen – große Hindernisse bleiben
    n2, lab2, st2, _ = cv2.connectedComponentsWithStats(1 - m, 4)
    small = np.zeros(n2, bool); small[1:] = st2[1:, 4] < HOLE_MAX
    m[small[lab2]] = 1
    r = MARGIN_W * PPW
    m = cv2.erode(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1)))
    if debug is not None:
        debug.update(colour=colour, calm=calm, im=im, tex=tex)
    return m

TEX_T = 8.5
HOLE_MAX = (6 * PPW) ** 2 * 4   # Löcher < ~150 Welt-Einheiten² füllen

def classify(img_bgr, world_w, world_h, cell, debug=None):
    m = meadow_mask(img_bgr, world_w, world_h, debug)
    gh, gw = world_h // cell, world_w // cell
    c = cell * PPW
    frac = m[:gh * c, :gw * c].reshape(gh, c, gw, c).mean((1, 3))
    b = frac >= FRAC
    b[0, :] = b[-1, :] = b[:, 0] = b[:, -1] = False
    return b
