# MONSTERS – Weltkarte (Web-Prototyp)

Erster Prototyp der interaktiven Weltkarte als Grundlage für die Web-App bzw. den späteren Spiel-Client.
Stack: **Vite + TypeScript + PixiJS v8** (WebGL, mobilfreundlich).

## Starten

```bash
npm install
npm run dev          # Entwicklung mit Hot-Reload  → http://localhost:5173
npm run build        # Typprüfung + Produktions-Build nach dist/
npm run preview      # gebaute Version auf Port 5173 ausliefern
npm run verify       # Headless-Test (Chrome/Playwright): Konsole prüfen + Screenshots nach screens/
npm run assets       # Kacheln, Raster, Demo-Nester und Sprites neu erzeugen (Python 3 + OpenCV)
```

## Bedienung

| Aktion | Maus / Tastatur | Touch |
|---|---|---|
| Verschieben (mit Trägheit) | Ziehen | Wischen |
| Zoomen | Mausrad, Doppelklick, Buttons + / − | Pinch, Doppeltipp |
| Nest-Info | Klick auf Maulwurfshügel (ab ca. 2,7×) | Tipp |
| Raster-Debug | Taste **G** oder Button „Raster“ | Button „Raster“ |
| Eigenes Nest | Button „Mein Nest“ (Kamerafahrt) | dito |

Zoomstufen (relativ zur Übersicht, in der die Karte den Bildschirm füllt):

* **1×–2×** Übersicht (Basiskarte `weltkarte_4x_v3`)
* **2×–3×** Überblendung zur Detailkarte (`zoom2_full`)
* **ab 2,5×** Nester blenden ein, **max. 8×**

## Projektstruktur

```
monsters-app/
├─ index.html
├─ src/
│  ├─ main.ts               App-Start: verbindet Daten, Kamera, Renderer, Gesten, UI
│  ├─ style.css             Mobile-UI
│  ├─ core/                 ⟵ reine Karten-Logik, KEIN Pixi/DOM → wiederverwendbar im Spiel-Client
│  │  ├─ types.ts           Datentypen (Kacheln, Raster, Nester)
│  │  ├─ camera.ts          Kamera: Zoom/Pan, Grenzen, Trägheit, Kamerafahrt, Koordinaten-Umrechnung
│  │  ├─ grid.ts            Welt-Raster (bebaubar/blockiert/belegt)
│  │  ├─ nests.ts           Nester + räumliche Suche (Tipp-Treffer)
│  │  ├─ tiles.ts           Kachelpyramide: Stufenwahl, sichtbare Kacheln
│  │  ├─ lod.ts             Zoom-Schwellen (Überblendung, Nester)
│  │  └─ data.ts            Laden der JSON-Daten (später: Server-API)
│  ├─ input/gestures.ts     Maus/Touch-Gesten → Kamera (DOM, renderer-unabhängig)
│  ├─ render/               Pixi-Darstellung
│  │  ├─ MapRenderer.ts     Pixi-App, Welt-Container, Ebenen
│  │  ├─ TileLayer.ts       lädt nur sichtbare Kacheln, gröbere Stufen als Platzhalter, LRU-Cache
│  │  ├─ NestLayer.ts       Maulwurfshügel-Sprites, Auswahl- und „Mein Nest“-Ring
│  │  └─ GridOverlay.ts     Debug-Raster
│  └─ ui/hud.ts             Ressourcenleiste, Zoomanzeige, Buttons, Nest-Infopanel
├─ public/
│  ├─ tiles/base/{stufe}/{x}_{y}.jpg     Pyramide der Basiskarte (5040×2800, 5 Stufen, 512er-Kacheln)
│  ├─ tiles/detail/{stufe}/{x}_{y}.jpg   Pyramide Zoomstufe 2 (5467×3037, gleiches Welt-Rechteck)
│  ├─ data/tiles.json                    Pyramiden-Metadaten
│  ├─ data/grid.json (+ grid.bin)        Raster als Bitmaske (Base64), 1 = bebaubar
│  ├─ data/nests.json                    350 Demo-Nester (wie vom Server)
│  └─ sprites/molehill_{red,blue}.png    freigestellte Maulwurfshügel
├─ tools/
│  ├─ build_assets.py       erzeugt alles unter public/tiles, public/data, public/sprites
│  ├─ verify.mjs            Headless-Test + Screenshots
│  └─ src/                  Quellbild der Sprites
└─ screens/                 Screenshots + grid_debug.jpg
```

## Welt, Raster, Nester

* **Welt-Koordinaten** = Pixel der Basiskarte: 5040 × 2800. Die Detailkarte wird auf dasselbe Rechteck gelegt.
* **Raster:** Zellgröße 20 Einheiten (ein Auto ist ca. 20 × 12) → **252 × 140 = 35.280 Zellen**,
  davon **5.241 bebaubar** (Wiese). Der Rest (Straßen, Häuser, Bäume, Wasser, Zentrum) ist blockiert.
* **Klassifikation** (`tools/build_assets.py`): Basiskarte leicht weichzeichnen, HSV-Farbtest
  „helles Gelbgrün“; eine Zelle ist bebaubar, wenn ≥ 90 % ihrer Pixel Wiese sind. Wasser und Kartenrand sind gesperrt.
  `screens/grid_debug.jpg` zeigt das Ergebnis (magenta = bebaubar, rot = Nester, gelb = eigenes Nest).
* **Nester:** 350 Demo-Nester auf zufälligen freien bebaubaren Zellen (Seed 1337, mind. 1 Zelle Abstand).
  Höhe des Sprites inkl. Fahne: 15 Einheiten (kleiner als ein Auto). „Sascha“ ist das eigene Demo-Nest.

## Für den Spiel-Client

`src/core` hängt weder von Pixi noch vom DOM ab: Kamera, Raster (`isBuildable`, `isFree`, `occupy`),
Nester-Suche, Kachelauswahl und Zoom-Schwellen können direkt in einem Spiel-Client (oder auf dem Server
zur Platzprüfung) genutzt werden. `data.ts` ist die Stelle, an der später die echte Server-API angebunden wird.

## Runde 3: Zoomstufe 3, Fähnchen entfernt, Bau-Raster neu

**Zoomstufe 3 (scharfer Max-Zoom)**
- Quelle: `/workspace/monsters-map/zoom3_full.png` (11861×6589). Gebaut aus 121 (11×11) einzeln generierten
  16:9-Ausschnitten von Zoomstufe 2, die per ECC ausgerichtet, farbangeglichen und mit Nahtsuche zusammengesetzt wurden
  (Skripte in `/workspace/monsters-map/z3/`). Deckt die **ganze Karte** ab.
- Dritte Kachelpyramide `public/tiles/detail3` (~32 MB). Überblendung Zoomstufe 2 → 3 über den absoluten Maßstab
  0,9 → 1,3 CSS-px pro Welt-Einheit (`LOD.detail3FromScale/ToScale`); Zoomstufe 2 wird erst ausgeblendet,
  wenn Zoomstufe 3 voll deckt und geladen ist.
- Max-Zoom ist jetzt absolut: höchstens `MAX_MAGNIFY` = 1,25 CSS-px pro Quellpixel (= 2,94 CSS-px pro Welt-Einheit).
  Desktop 1280×720 ≈ 11,4× Übersicht, Handy 390×844 ≈ 9,8×. Die Grenze gilt in CSS-Pixeln; auf DPR-2-Geräten
  sind das 2,5 Gerätepixel pro Quellpixel (sieht so scharf aus wie 1,25 auf einem DPR-1-Bildschirm).

**Fähnchen-Hügel entfernt**: Die eingemalten Maulwurfshügel mit Fähnchen wurden in Zoomstufe 3 erkannt
(Farbe + Hügel-Paarung, manuell geprüft) und übermalt; Zoomstufe 2 (`zoom2_clean.png`) und Basis
(`weltkarte_clean.png`) sind daraus heruntergerechnet → alle Ebenen konsistent. Nicht 100 %: einzelne Hügel ohne
Fahne bzw. kleine orange Zelt-/Erdhaufen-Objekte sind noch in der Karte.

**Bau-Raster** (`tools/classify_grid.py`): Farbe (Lab-Farbwinkel Gelbgrün, Sättigung, Helligkeit) + Textur/Kantendichte
+ Morphologie (Öffnen/Schließen, kleine Inseln weg, kleine Löcher füllen) + 3 Welt-Einheiten Sicherheitsabstand,
Zelle bebaubar ab 88 % Wiese. Ergebnis: 1699 Zellen (vorher 5241, die alte Regel nahm viele Straßenränder/Baumflächen mit).
Bewusst eher streng → Feinschliff per Editor.

**Raster-Editor (Taste E)**: Ziehen = malen, Modus Bebaubar/Blockiert (B), Shift/Rechtsklick = Gegenteil,
[ ] Pinselgröße, Leertaste+Ziehen verschiebt, Strg+Z rückgängig. Änderungen bleiben im localStorage.
„grid.json exportieren“ lädt eine Datei im Format von `public/data/grid.json` herunter. Diese als
`tools/grid_override.json` ablegen und `python3 tools/build_assets.py --no-tiles` ausführen → Raster und
350 Demo-Nester werden daraus neu erzeugt.

## Online (GitHub Pages)

Live: https://saschahoffmannsh-gif.github.io/monsters/

Veröffentlichen: `npm run deploy` (baut mit `VITE_BASE=/monsters/` und schiebt `dist/` auf den Branch `gh-pages`;
Pages-Quelle = Branch `gh-pages`, Pfad `/`). Quellcode liegt auf `main`.
