// Franja de dalt: les 40 caselles del tauler en línia, amb el peó de cada jugador.
// Quan algú tira els daus, el seu peó hi avança casella per casella a tots els mòbils.

import { BOARD, type Square } from '../data/board';
import { userById } from '../data/users';
import type { GameState, PawnMove } from '../engine/game';
import { GROUP, esc } from './visual';

/** Amplada d'una casella, en píxels (ha de coincidir amb .sq a styles.css). */
const CW = 56;
/** Temps de cada salt d'una casella a la següent. */
const STEP_MS = 300;
/** Amplada del peó (ha de coincidir amb .tok a styles.css). */
const PW = 28;

const SHORT: Partial<Record<Square['kind'], string>> = {
  go: 'SORTIDA',
  jail: 'PRESÓ',
  'free-parking': 'PARKING',
  'go-to-jail': 'A LA PRESÓ',
  chance: 'SORT',
  'community-chest': 'CAIXA',
};

/** Traç de retolador una mica tremolós, compartit per tots els peons (com el cartell de la Festarroja). */
export const PAWN_DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><filter id="retolador" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="1.4"/></filter></defs></svg>`;

const BONE = '#FFF6EA';
const limb = (d: string) => `<path d="${d}" stroke="#151515" stroke-width="4.4" stroke-linecap="round"/><path d="${d}" stroke="${BONE}" stroke-width="2.4" stroke-linecap="round"/>`;

/** El peó: el dimoniet del cartell, dret damunt d'una pinzellada del color del jugador. */
export function pawnToken(color: string, cls = ''): string {
  return `<span class="tok ${cls}"><svg viewBox="0 0 34 42" aria-hidden="true"><g filter="url(#retolador)">
    <path d="M-3 33.5c8-4.6 17-3 25-5.2 4-1.1 8-.9 12.5 0l-1.2 9.4c-4.4-.8-8 .7-12.4 1.5-8.4 1.6-15.6.6-23.4 3z" fill="${color}" stroke="#151515" stroke-width=".8" stroke-opacity=".35"/>
    <path d="M10.6 10.2C8.4 8 8 4.6 9.2 1.8c.9 2.4 2.6 4 4.6 4.9zM23.4 10.2c2.2-2.2 2.6-5.6 1.4-8.4-.9 2.4-2.6 4-4.6 4.9z" fill="${BONE}" stroke="#151515" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M23 29c3 .4 5.2 1.4 6.4-1.2" fill="none" stroke="#151515" stroke-width="3.6" stroke-linecap="round"/><path d="M23 29c3 .4 5.2 1.4 6.4-1.2" fill="none" stroke="${BONE}" stroke-width="1.6" stroke-linecap="round"/>
    <path d="m28.2 25.6 3.4.6-1.4 3.2z" fill="${BONE}" stroke="#151515" stroke-width="1.2" stroke-linejoin="round"/>
    ${limb('M11 21 6.5 14.5')}<path d="M5.6 15.2 4.6 11.2M7.4 14.4l.4-3.8" stroke="#151515" stroke-width="1.4" stroke-linecap="round"/>${limb('M23.4 21.5 27 25.5')}
    <path d="M17 5.6c5.2 0 8.4 3.6 8.4 8.6 0 2.4-.8 4.4-2 5.8l1.3 9.2 2.6 6.6h-4.4l-2.3-5h-7.2l-2.3 5H6.7l2.6-6.6 1.3-9.2c-1.2-1.4-2-3.4-2-5.8 0-5 3.2-8.6 8.4-8.6z" fill="${BONE}" stroke="#151515" stroke-width="1.6" stroke-linejoin="round"/>
    <circle cx="14.4" cy="12.6" r="1.7" fill="#fff" stroke="#151515" stroke-width="1.2"/><circle cx="19.6" cy="12.6" r="1.7" fill="#fff" stroke="#151515" stroke-width="1.2"/><ellipse cx="17" cy="17.4" rx="1.4" ry="1.8" fill="#151515"/>
  </g></svg></span>`;
}

function cell(sq: Square, owner: string | undefined): string {
  const band = sq.kind === 'street' ? `<i class="band" style="background:${GROUP[sq.group].band}"></i>` : '';
  const label = SHORT[sq.kind] ?? sq.name;
  const own = owner ? `<i class="own" style="background:${owner}"></i>` : '';
  const corner = sq.index % 10 === 0 ? ' corner' : '';
  return `<div class="sq${corner}" data-sq="${sq.index}" title="${esc(sq.name)}">${band}<span>${esc(label)}</span>${own}</div>`;
}

export class BoardStrip {
  private track: HTMLElement;
  private pawnEls: Record<string, HTMLElement> = {};
  /** Casella que es veu ara per a cada peó (durant l'animació no és la final). */
  private shown: Record<string, number> = {};
  private lastMoveId = '';
  private lastTurn = '';
  private backT = 0;
  private animating = new Set<string>();
  private st: GameState | null = null;

  /** Cridat quan un peó acaba d'arribar a la casella (després de l'animació). */
  onLanded: (move: PawnMove) => void = () => {};

  /** Hi ha algun peó caminant ara mateix. */
  get moving() {
    return this.animating.size > 0;
  }

  constructor(
    private root: HTMLElement,
    private me: string,
  ) {
    root.innerHTML = `${PAWN_DEFS}<div class="track">${BOARD.map((s) => cell(s, undefined)).join('')}</div>`;
    this.track = root.querySelector('.track')!;
    // Si algú mira el tauler amb el dit, al cap d'una estona torna sol al peó de qui té el torn.
    const back = () => {
      clearTimeout(this.backT);
      this.backT = window.setTimeout(() => this.followTurn(), 4000);
    };
    root.addEventListener('touchend', back, { passive: true });
    root.addEventListener('pointerup', back);
    root.addEventListener('wheel', back, { passive: true });
  }

  update(st: GameState, first = false) {
    this.st = st;
    const pawns = st.pawns ?? {};
    const positions = st.positions ?? {};
    // Propietaris: una ratlla a sota amb el color del peó.
    this.track.querySelectorAll<HTMLElement>('.sq').forEach((el) => {
      const deed = st.deeds[Number(el.dataset.sq)];
      const color = deed ? pawns[deed.owner] : undefined;
      let own = el.querySelector<HTMLElement>('.own');
      if (!color) return own?.remove();
      if (!own) {
        own = document.createElement('i');
        own.className = 'own';
        el.append(own);
      }
      own.style.background = color;
    });

    st.turnOrder.forEach((p) => {
      if (!pawns[p]) return;
      let el = this.pawnEls[p];
      if (!el) {
        el = document.createElement('div');
        el.className = 'pawn' + (p === this.me ? ' me' : '');
        el.setAttribute('aria-label', `Peó de ${userById(p).name}`);
        el.innerHTML = `<i class="sh"></i><div class="body">${pawnToken(pawns[p]!)}</div><em class="left"></em>`;
        this.track.append(el);
        this.pawnEls[p] = el;
        this.shown[p] = positions[p] ?? 0;
      }
      el.classList.toggle('now', st.turnOrder[st.currentTurn] === p);
    });

    const move = st.lastMove;
    if (move && move.id !== this.lastMoveId) {
      this.lastMoveId = move.id;
      // En obrir la taula no es repeteix l'últim moviment: els peons ja surten al seu lloc.
      if (!first && this.shown[move.player] === move.from) void this.animate(move, st);
      else if (!first) queueMicrotask(() => this.onLanded(move));
    }
    // Qualsevol altre canvi (o una partida que s'obre) es col·loca directament.
    st.turnOrder.forEach((p) => {
      if (!this.animating.has(p)) this.shown[p] = positions[p] ?? 0;
    });
    this.place(st.turnOrder);
    // Quan canvia el torn, tots els mòbils van a buscar el peó de qui toca.
    const turn = st.turnOrder[st.currentTurn] ?? '';
    if (first || turn !== this.lastTurn) {
      this.lastTurn = turn;
      if (!this.moving) this.followTurn(!first);
    }
  }

  private async animate(move: PawnMove, st: GameState) {
    const p = move.player;
    this.animating.add(p);
    const el = this.pawnEls[p];
    const left = el?.querySelector<HTMLElement>('.left');
    el?.classList.add('walking');
    // Salta casella per casella: cada casella on toca s'enfonsa una mica i s'il·lumina.
    for (let k = 1; k <= move.steps; k++) {
      this.shown[p] = (move.from + k) % BOARD.length;
      if (left) left.textContent = String(move.steps - k || '');
      el?.classList.remove('jump');
      void el?.offsetWidth;
      el?.classList.add('jump');
      this.place(st.turnOrder);
      this.follow(this.shown[p]!);
      await wait(STEP_MS * 0.8);
      this.tick(this.shown[p]!, k === move.steps);
      await wait(STEP_MS * 0.2);
    }
    el?.classList.remove('jump', 'walking');
    if (this.shown[p] !== move.to) {
      // De «Ves a la presó» cap a la Presó, d'una revolada.
      await wait(450);
      this.shown[p] = move.to;
      el?.classList.add('jail');
      this.place(st.turnOrder);
      this.follow(move.to);
      await wait(700);
      el?.classList.remove('jail');
      this.tick(move.to, true);
    }
    el?.classList.add('arrive');
    await wait(350);
    el?.classList.remove('arrive');
    this.animating.delete(p);
    // Si mentrestant ha tornat a moure (o el màster l'ha corregit), queda on diu la partida.
    const latest = this.st ?? st;
    this.shown[p] = latest.positions?.[p] ?? move.to;
    this.place(latest.turnOrder);
    this.onLanded(move);
  }

  /** La casella on toca el peó: s'enfonsa i s'il·lumina; la final es queda marcada una estona. */
  private tick(i: number, last: boolean) {
    const sq = this.track.querySelector<HTMLElement>(`.sq[data-sq="${i}"]`);
    if (!sq) return;
    sq.classList.remove('tick', 'dest');
    void sq.offsetWidth;
    sq.classList.add(last ? 'dest' : 'tick');
    window.setTimeout(() => sq.classList.remove('tick', 'dest'), last ? 1600 : 400);
  }

  /** Col·loca els peons; si n'hi ha uns quants a la mateixa casella, es reparteixen. */
  private place(order: string[]) {
    const bySquare = new Map<number, string[]>();
    order.forEach((p) => {
      if (!this.pawnEls[p]) return;
      const i = this.shown[p] ?? 0;
      bySquare.set(i, [...(bySquare.get(i) ?? []), p]);
    });
    bySquare.forEach((ps, i) => {
      const n = ps.length;
      const perRow = Math.min(n, 4);
      ps.forEach((p, k) => {
        const row = Math.floor(k / 4);
        const col = k % 4;
        const spread = perRow > 1 ? Math.min(12, (CW - PW) / (perRow - 1)) : 0;
        const x = i * CW + CW / 2 - PW / 2 + (col - (perRow - 1) / 2) * spread;
        const el = this.pawnEls[p]!;
        el.style.left = `${x}px`;
        el.style.bottom = `${5 + row * 9}px`;
        el.style.zIndex = String(10 + row * 5 + k + (p === this.me ? 20 : 0));
      });
    });
  }

  private followTurn(smooth = true) {
    if (this.moving || !this.st) return;
    const turn = this.st.turnOrder[this.st.currentTurn];
    if (turn) this.follow(this.shown[turn] ?? 0, smooth);
  }

  private follow(i: number, smooth = true) {
    const left = i * CW + CW / 2 - this.root.clientWidth / 2;
    this.root.scrollTo({ left: Math.max(0, left), behavior: smooth ? 'smooth' : 'auto' });
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
