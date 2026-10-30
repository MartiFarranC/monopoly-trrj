// Franja de dalt: les 40 caselles del tauler en línia, amb el peó de cada jugador.
// Quan algú tira els daus, el seu peó hi avança casella per casella a tots els mòbils.

import { BOARD, type Square } from '../data/board';
import { userById } from '../data/users';
import type { GameState, PawnMove } from '../engine/game';
import { GROUP, esc } from './visual';

/** Amplada d'una casella, en píxels (ha de coincidir amb .sq a styles.css). */
const CW = 56;
const STEP_MS = 190;

const SHORT: Partial<Record<Square['kind'], string>> = {
  go: 'SORTIDA',
  jail: 'PRESÓ',
  'free-parking': 'PARKING',
  'go-to-jail': 'A LA PRESÓ',
  chance: 'SORT',
  'community-chest': 'CAIXA',
};

export function pawnSvg(color: string, sz = 18): string {
  return `<svg width="${sz}" height="${Math.round(sz * 1.25)}" viewBox="0 0 16 20" aria-hidden="true"><path d="M8 1.2a3.4 3.4 0 0 1 2 6.2c1 .9 1.6 2.3 1.9 4.1l.8 4.5H3.3l.8-4.5c.3-1.8.9-3.2 1.9-4.1a3.4 3.4 0 0 1 2-6.2z" fill="${color}" stroke="#151515" stroke-width="1.3" stroke-linejoin="round"/><rect x="1.6" y="16" width="12.8" height="3" rx="1.2" fill="${color}" stroke="#151515" stroke-width="1.3"/></svg>`;
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
    root.innerHTML = `<div class="track">${BOARD.map((s) => cell(s, undefined)).join('')}</div>`;
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
        el.innerHTML = pawnSvg(pawns[p]!);
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
    for (let k = 1; k <= move.steps; k++) {
      this.shown[p] = (move.from + k) % BOARD.length;
      el?.classList.remove('hop');
      void el?.offsetWidth;
      el?.classList.add('hop');
      this.place(st.turnOrder);
      this.follow(this.shown[p]!);
      await wait(STEP_MS);
    }
    if (this.shown[p] !== move.to) {
      // De «Ves a la presó» cap a la Presó, d'una revolada.
      await wait(350);
      this.shown[p] = move.to;
      el?.classList.add('jail');
      this.place(st.turnOrder);
      this.follow(move.to);
      await wait(500);
      el?.classList.remove('jail');
    }
    el?.classList.remove('hop');
    this.animating.delete(p);
    // Si mentrestant ha tornat a moure (o el màster l'ha corregit), queda on diu la partida.
    const latest = this.st ?? st;
    this.shown[p] = latest.positions?.[p] ?? move.to;
    this.place(latest.turnOrder);
    this.onLanded(move);
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
        const spread = perRow > 1 ? Math.min(12, (CW - 22) / (perRow - 1)) : 0;
        const x = i * CW + CW / 2 - 9 + (col - (perRow - 1) / 2) * spread;
        const el = this.pawnEls[p]!;
        el.style.left = `${x}px`;
        el.style.bottom = `${6 + row * 9}px`;
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
