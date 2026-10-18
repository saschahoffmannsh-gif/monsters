"""Erzeugt alle statischen Karten-Daten für den Prototyp.

  python3 tools/build_assets.py

- Deep-Zoom-Kachelpyramiden (512px) für base (weltkarte_clean), detail (zoom2_clean) und
  detail3 (zoom3_full, Zoomstufe 3, ~11.9k px). Alle drei ohne die eingemalten Fähnchen-Hügel.
- Raster-Klassifikation (bebaubar/blockiert) aus der Zoomstufe-3-Karte (tools/classify_grid.py:
  Farbe + Textur/Kantendichte + Morphologie + Sicherheitsabstand) als JSON (Base64-Bitmaske) + grid.bin
  Liegt tools/grid_override.json (Export aus dem Editor, Taste E) vor, wird dieses Raster verwendet.
  Optionen: --no-tiles (Kacheln nicht neu erzeugen)
- 350 Demo-Nester (seeded) als JSON, so als kämen sie vom Server
- Maulwurfshügel-Sprites (aus generiertem Bild auf Magenta freigestellt)
"""
import json, math, os, random, base64
import sys
import cv2, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import classify_grid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, 'public')
SRC_BASE = '/workspace/monsters-map/weltkarte_v4.png'      # v4: aus zoom3_v4 heruntergerechnet (weniger Bäume, keine Erdflecken)
SRC_DETAIL = '/workspace/monsters-map/zoom2_v4.png'
SRC_DETAIL3 = '/workspace/monsters-map/zoom3_v4.png'
SRC_DETAIL4 = '/workspace/monsters-map/zoom4_v4.png'      # 2x von zoom3_v4 (Real-ESRGAN general-x4v3, ONNX/CPU) + Original-Textur
OVERRIDE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'grid_override.json')
TILE = 512
WORLD_W, WORLD_H = 5040, 2800   # Welt-Einheiten = Pixel der Basiskarte
CELL = 20                        # Rasterzelle in Welt-Einheiten (ein Nest = eine Zelle; Auto ~ 20x12)
NEST_COUNT = 350
SEED = 1337


def pyramid(img, name, min_side=0):
    out = os.path.join(PUB, 'tiles', name)
    h, w = img.shape[:2]
    levels = []
    lvl, cur = 0, img
    while True:
        ch, cw = cur.shape[:2]
        cols, rows = math.ceil(cw / TILE), math.ceil(ch / TILE)
        d = os.path.join(out, str(lvl)); os.makedirs(d, exist_ok=True)
        for ty in range(rows):
            for tx in range(cols):
                t = cur[ty*TILE:(ty+1)*TILE, tx*TILE:(tx+1)*TILE]
                cv2.imwrite(os.path.join(d, f'{tx}_{ty}.jpg'), t, [cv2.IMWRITE_JPEG_QUALITY, 84])
        levels.append({'level': lvl, 'width': cw, 'height': ch, 'cols': cols, 'rows': rows})
        if max(cw, ch) <= TILE: break
        if min_side and max((cw + 1) // 2, (ch + 1) // 2) < min_side: break   # grobe Ebenen von detail4 nie sichtbar
        cur = cv2.resize(cur, ((cw + 1) // 2, (ch + 1) // 2), interpolation=cv2.INTER_AREA)
        lvl += 1
    return {'name': name, 'width': w, 'height': h, 'tileSize': TILE, 'levels': levels,
            'url': f'tiles/{name}/{{level}}/{{x}}_{{y}}.jpg'}


def classify(img):
    bl = cv2.GaussianBlur(img, (0, 0), 3)
    hsv = cv2.cvtColor(bl, cv2.COLOR_BGR2HSV).astype(np.int32)
    H, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    grass = (H >= 20) & (H <= 40) & (S >= 120) & (V >= 135)   # helles Gelbgrün = Wiese
    gh, gw = WORLD_H // CELL, WORLD_W // CELL
    frac = grass.reshape(gh, CELL, gw, CELL).mean((1, 3))
    buildable = frac >= 0.9
    # Wasser (blau) explizit sperren, inkl. Nachbarzellen
    water = ((H >= 85) & (H <= 115) & (S >= 60)).reshape(gh, CELL, gw, CELL).mean((1, 3)) > 0.05
    water = cv2.dilate(water.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    buildable &= ~water
    buildable[0, :] = buildable[-1, :] = buildable[:, 0] = buildable[:, -1] = False
    return buildable


def nests(buildable):
    rnd = random.Random(SEED)
    gh, gw = buildable.shape
    free = [(x, y) for y in range(gh) for x in range(gw) if buildable[y, x]]
    rnd.shuffle(free)
    taken = np.zeros_like(buildable)
    pre = ['Maulwurf', 'Buddel', 'Krümel', 'Wühl', 'Erdnuss', 'Grabe', 'Tunnel', 'Mops', 'Hügel', 'Wurzel', 'Schaufel', 'Matsch']
    suf = ['König', 'Fee', 'Kralle', 'Bande', 'Max', 'Lotte', 'Pfote', 'Boss', 'Zwerg', 'Held', 'Nase', 'Blitz']
    clans = ['Tiefgräber', 'Wiesenwächter', 'Rostbande', 'Moosritter', 'Gartenzwerge', None, None]
    out = []
    for (x, y) in free:
        if len(out) >= NEST_COUNT: break
        if taken[max(0, y-1):y+2, max(0, x-1):x+2].any():  # mind. 1 freie Zelle zum Nachbarn
            continue
        taken[y, x] = True
        out.append({'id': f'n{len(out):04d}', 'cx': x, 'cy': y,
                    'player': f'{rnd.choice(pre)}{rnd.choice(suf)}{rnd.randint(1, 99)}',
                    'level': max(1, min(30, int(rnd.gauss(9, 5)))),
                    'clan': rnd.choice(clans), 'flag': rnd.choice(['red', 'blue']), 'own': False})
    cx0, cy0 = gw * 0.62, gh * 0.55   # eigenes Demo-Nest: nahe rechts neben dem Zentrum
    own = min(out, key=lambda n: (n['cx'] - cx0) ** 2 + (n['cy'] - cy0) ** 2)
    own.update(player='Sascha', level=12, clan='Tiefgräber', own=True, flag='blue')
    return out


def sprites():
    src = cv2.imread(os.path.join(ROOT, 'tools', 'src', 'molehill_sprites.jpg'))
    hsv = cv2.cvtColor(src, cv2.COLOR_BGR2HSV).astype(np.int32)
    mag = (hsv[..., 0] >= 140) & (hsv[..., 0] <= 165) & (hsv[..., 1] >= 120) & (hsv[..., 2] >= 120)
    fg = cv2.morphologyEx((~mag).astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(fg)
    comps = sorted([i for i in range(1, n) if st[i, 4] > 2000], key=lambda i: st[i, 0])
    os.makedirs(os.path.join(PUB, 'sprites'), exist_ok=True)
    for name, i in zip(['molehill_red', 'molehill_blue'], comps):
        x, y, w, h, _ = st[i]; pad = 4
        crop = src[y-pad:y+h+pad, x-pad:x+w+pad].astype(np.float32)
        m = (lab[y-pad:y+h+pad, x-pad:x+w+pad] == i).astype(np.uint8) * 255
        m = cv2.erode(m, np.ones((3, 3), np.uint8))
        a = cv2.GaussianBlur(m, (0, 0), 0.8).astype(np.float32) / 255
        b, g, r = crop[..., 0], crop[..., 1], crop[..., 2]
        spill = np.clip(np.minimum(b, r) - g, 0, None) * (1 - a)   # Magenta-Saum entfärben
        crop[..., 0] -= spill; crop[..., 2] -= spill
        rgba = np.dstack([np.clip(crop, 0, 255), a * 255]).astype(np.uint8)
        sc = 160 / rgba.shape[0]
        rgba = cv2.resize(rgba, (int(rgba.shape[1] * sc), 160), interpolation=cv2.INTER_AREA)
        cv2.imwrite(os.path.join(PUB, 'sprites', name + '.png'), rgba)
    return len(comps)


def load_grid(path):
    g = json.load(open(path))
    bits = np.unpackbits(np.frombuffer(base64.b64decode(g['buildable']), np.uint8))[:g['cols'] * g['rows']]
    return bits.reshape(g['rows'], g['cols']).astype(bool)


def main():
    base = cv2.imread(SRC_BASE)
    assert base.shape[:2] == (WORLD_H, WORLD_W)
    os.makedirs(os.path.join(PUB, 'data'), exist_ok=True)
    if '--no-tiles' not in sys.argv:
        import shutil
        shutil.rmtree(os.path.join(PUB, 'tiles'), ignore_errors=True)
        layers = {'base': pyramid(base, 'base')}
        det = cv2.imread(SRC_DETAIL); layers['detail'] = pyramid(det, 'detail'); del det
        z3 = cv2.imread(SRC_DETAIL3); layers['detail3'] = pyramid(z3, 'detail3'); del z3
        if os.path.exists(SRC_DETAIL4):
            z4 = cv2.imread(SRC_DETAIL4); layers['detail4'] = pyramid(z4, 'detail4', min_side=4000); del z4
        meta = {'world': {'width': WORLD_W, 'height': WORLD_H}, 'layers': layers}
        json.dump(meta, open(os.path.join(PUB, 'data', 'tiles.json'), 'w'), indent=1)
        print('tiles done', flush=True)

    if os.path.exists(OVERRIDE):
        b = load_grid(OVERRIDE); print('grid: override', OVERRIDE)
    else:
        b = classify_grid.classify(cv2.imread(SRC_DETAIL3), WORLD_W, WORLD_H, CELL)
    gh, gw = b.shape
    bits = np.packbits(b.ravel().astype(np.uint8))
    open(os.path.join(PUB, 'data', 'grid.bin'), 'wb').write(bits.tobytes())
    json.dump({'cellSize': CELL, 'cols': gw, 'rows': gh, 'buildableCount': int(b.sum()),
               'encoding': 'base64 bitmask, row-major, MSB first, 1 = bebaubar (Wiese)',
               'buildable': base64.b64encode(bits.tobytes()).decode()},
              open(os.path.join(PUB, 'data', 'grid.json'), 'w'))
    ns = nests(b)
    json.dump({'generatedBy': 'demo-server', 'seed': SEED, 'cellSize': CELL, 'nests': ns},
              open(os.path.join(PUB, 'data', 'nests.json'), 'w'), ensure_ascii=False, indent=0)
    k = sprites()
    import nest_sprites; k += nest_sprites.build()
    print(f'grid {gw}x{gh} = {gw*gh} cells, buildable {int(b.sum())}, nests {len(ns)}, sprites {k}')

    ov = base.copy()
    m = cv2.resize(b.astype(np.uint8), (WORLD_W, WORLD_H), interpolation=cv2.INTER_NEAREST).astype(bool)
    ov[m] = (ov[m] * 0.55 + np.array([255, 0, 255]) * 0.45).astype(np.uint8)
    for n in ns:
        cv2.circle(ov, (n['cx'] * CELL + CELL // 2, n['cy'] * CELL + CELL // 2), 9,
                   (255, 255, 0) if n['own'] else (0, 0, 255), -1)
    os.makedirs(os.path.join(ROOT, 'screens'), exist_ok=True)
    cv2.imwrite(os.path.join(ROOT, 'screens', 'grid_debug.jpg'),
                cv2.resize(ov, (2520, 1400), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 85])


if __name__ == '__main__':
    main()
