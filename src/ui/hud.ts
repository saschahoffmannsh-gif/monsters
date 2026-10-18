import type { Nest } from '../core/types';

export interface Resources { nahrung: number; holz: number; stein: number; uran: number }

export interface HudCallbacks {
  onMyNest: () => void;
  onToggleGrid: () => boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

const fmt = (n: number) => n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace('.', ',') + 'k' : n.toLocaleString('de-DE');

const RES: [keyof Resources, string, string][] = [
  ['nahrung', 'Nahrung', 'res-nahrung'],
  ['holz', 'Holz', 'res-holz'],
  ['stein', 'Stein', 'res-stein'],
  ['uran', 'Uran', 'res-uran'],
];

/** Einfaches Mobile-UI als DOM-Overlay über der Karte. */
export class Hud {
  readonly root: HTMLDivElement;
  private zoomEl!: HTMLElement;
  private stageEl!: HTMLElement;
  private gridBtn!: HTMLButtonElement;
  private panel!: HTMLDivElement;

  constructor(parent: HTMLElement, res: Resources, cb: HudCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="resbar">
        ${RES.map(([k, label, cls]) => `<div class="res ${cls}" title="${label}"><i></i><span class="lbl">${label}</span><b data-res="${k}">${fmt(res[k])}</b></div>`).join('')}
      </div>
      <div class="zoombox"><span class="zoomval">1,0×</span><span class="stage">Übersicht</span></div>
      <div class="side">
        <button class="btn round" data-act="in" aria-label="Hineinzoomen">+</button>
        <button class="btn round" data-act="out" aria-label="Herauszoomen">−</button>
      </div>
      <div class="bottom">
        <button class="btn primary" data-act="nest">Mein Nest</button>
        <button class="btn" data-act="grid" title="Taste G · Editor: Taste E">Raster</button>
      </div>
      <div class="panel" hidden></div>`;
    parent.appendChild(this.root);
    this.zoomEl = this.root.querySelector('.zoomval')!;
    this.stageEl = this.root.querySelector('.stage')!;
    this.gridBtn = this.root.querySelector('[data-act=grid]')!;
    this.panel = this.root.querySelector('.panel')!;
    this.root.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('[data-act]')?.getAttribute('data-act');
      if (a === 'nest') cb.onMyNest();
      else if (a === 'grid') this.setGrid(cb.onToggleGrid());
      else if (a === 'in') cb.onZoomIn();
      else if (a === 'out') cb.onZoomOut();
      else if (a === 'close') this.showNest(null);
    });
    // UI-Elemente sollen keine Karten-Gesten auslösen
    for (const el of this.root.querySelectorAll<HTMLElement>('.resbar,.zoombox,.side,.bottom,.panel')) {
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      el.addEventListener('wheel', (e) => e.stopPropagation());
    }
  }

  get nestShown(): boolean { return !this.panel.hidden; }

  setGrid(on: boolean): void { this.gridBtn.classList.toggle('active', on); }

  setZoom(z: number, stage: string): void {
    this.zoomEl.textContent = z.toFixed(1).replace('.', ',') + '×';
    this.stageEl.textContent = stage;
  }

  showNest(n: Nest | null, extra?: { cell: string }): void {
    if (!n) { this.panel.hidden = true; return; }
    this.panel.hidden = false;
    this.panel.innerHTML = `
      <button class="close" data-act="close" aria-label="Schließen">×</button>
      <div class="ptitle"><span class="flag ${n.flag}"></span>${escapeHtml(n.player)}${n.own ? ' <em>(du)</em>' : ''}</div>
      <div class="prow"><span>Nest-Level</span><b>${n.level}</b></div>
      <div class="prow"><span>Clan</span><b>${n.clan ? escapeHtml(n.clan) : '—'}</b></div>
      <div class="prow"><span>Feld</span><b>${extra?.cell ?? ''}</b></div>
      ${n.own ? '' : '<div class="pact"><button class="btn small" disabled>Besuchen</button><button class="btn small" disabled>Angreifen</button></div>'}`;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
