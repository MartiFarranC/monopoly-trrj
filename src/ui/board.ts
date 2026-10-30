// Franja de dalt: les 40 caselles del tauler en línia, amb el peó de cada jugador.
// Quan algú tira els daus, el seu peó hi avança casella per casella a tots els mòbils.

import { BOARD, type Square } from '../data/board';
import { userById } from '../data/users';
import { PAWN_COLORS, type GameState, type PawnMove } from '../engine/game';
import { GROUP, esc } from './visual';

/** Amplada d'una casella, en píxels (ha de coincidir amb .sq a styles.css). */
const CW = 56;
/** Temps de cada salt d'una casella a la següent. */
const STEP_MS = 300;
/** Amplada del peó (ha de coincidir amb .tok a styles.css). */
const PW = 22;

const SHORT: Partial<Record<Square['kind'], string>> = {
  go: 'SORTIDA',
  jail: 'PRESÓ',
  'free-parking': 'PARKING',
  'go-to-jail': 'A LA PRESÓ',
  chance: 'SORT',
  'community-chest': 'CAIXA',
};

/** Fitxes metàl·liques com les del Monopoly. Cada color de la partida va amb una fitxa. */
const TOKENS: Record<string, string> = {
  cotxe: '<path d="M2.5 16v-3.2l2.4-.7 2.6-3.6h7.6l3.2 3.6 3.2.8V16z"/><path d="M8.4 9.6h2.8v2.5H6.6zM12.6 9.6h2.2l2 2.5h-4.2z" class="d"/><circle cx="7" cy="16.4" r="2.3"/><circle cx="17.2" cy="16.4" r="2.3"/>',
  barret: '<ellipse cx="12" cy="18" rx="9.5" ry="2.4"/><path d="M6.6 17.5V6.2C6.6 4.8 9 4 12 4s5.4.8 5.4 2.2v11.3z"/><path d="M6.6 14h10.8v2.4H6.6z" class="d"/>',
  gos: '<path d="M3 12.5 4.3 9l2-.6L7.5 5l2.2 2.4h1.2l1.1 1.3v1.6h6.4l1.8-2.1 1 .9-.9 3.1v6.3h-2.3v-3.3h-6.7v3.3H8.9v-3.4l-2.6-1.3L3.5 14z"/><circle cx="7.6" cy="9.6" r=".8" class="d"/>',
  vaixell: '<path d="M2.5 15h19l-3.3 4.6H5.8z"/><path d="M11.4 3h1.2v12h-1.2z"/><path d="M13 4.2 18.6 13H13zM11 6.4 6 13h5z"/>',
  bota: '<path d="M6.5 3h6.8v9.3l5.8 3.2c1.3.7 1.8 1.9 1.8 3.5H4.8v-2.6l1.7-1.3z"/><path d="M6.5 6h6.8v1.4H6.5z" class="d"/>',
  didal: '<path d="M7 18.6 8.1 8a3.9 3.9 0 0 1 7.8 0L17 18.6z"/><path d="M6.2 18h11.6v2.6H6.2z"/><g class="d"><circle cx="10" cy="10" r=".7"/><circle cx="12.6" cy="9.4" r=".7"/><circle cx="11" cy="12.6" r=".7"/><circle cx="13.7" cy="12.2" r=".7"/><circle cx="10.4" cy="15.2" r=".7"/><circle cx="13.4" cy="15" r=".7"/></g>',
  planxa: '<path d="M2.5 17.5c0-4.2 4.2-7.3 10.4-7.3h4.4l3.3 7.3z"/><path d="M8 10.4c0-3 2.2-4.3 5.2-4.3h4.4v1.9h-4.2c-1.9 0-3 .8-3 2.4z"/>',
  carreto: '<path d="M3.5 8.5h13.8l-2.3 6.3H6.4z"/><path d="m3.7 8.8-2.6-3 1-.8 2.8 3.2zM6.6 14.4l-.9 4.4h1.4l1-4.4z"/><circle cx="16.4" cy="17.2" r="2.6"/><circle cx="16.4" cy="17.2" r=".9" class="d"/>',
};
const TOKEN_ORDER = ['cotxe', 'barret', 'gos', 'vaixell', 'bota', 'didal', 'planxa', 'carreto'];

/** Gradient metàl·lic compartit per totes les fitxes. */
export const PEWTER = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><linearGradient id="pewter" x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="#F4F6F8"/><stop offset=".45" stop-color="#B8BEC6"/><stop offset=".7" stop-color="#8D949D"/><stop offset="1" stop-color="#C9CED4"/></linearGradient></defs></svg>`;

/** Fitxa d'un jugador: la figura metàl·lica sobre una base del seu color. */
export function pawnToken(color: string, cls = ''): string {
  const i = Math.max(0, PAWN_COLORS.indexOf(color as (typeof PAWN_COLORS)[number]));
  const name = TOKEN_ORDER[i % TOKEN_ORDER.length]!;
  return `<span class="tok ${cls}" style="--c:${color}" data-token="${name}"><i class="base"></i><svg viewBox="0 0 24 22" aria-hidden="true">${TOKENS[name]}</svg></span>`;
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
    root.innerHTML = `${PEWTER}<div class="track">${BOARD.map((s) => cell(s, undefined)).join('')}</div>`;
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
