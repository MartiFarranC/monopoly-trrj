// Peces visuals compartides: bitllets, cartes de propietat, avatars i icones.

import { getOwnable, type ColorGroup, type OwnableSquare } from '../data/board';
import { DENOMINATIONS, type Denomination } from '../engine/bills';
import { HOTEL, type Deed } from '../engine/rules';
import { initials, userById } from '../data/users';

export const VALS = DENOMINATIONS;
export const COL: Record<Denomination, string> = { 500: '#F2A65A', 100: '#EFE3B0', 50: '#9CC8EE', 20: '#A6D9A0', 10: '#F6E97A', 5: '#F4B4C6', 1: '#F8F6EF' };
const WORD: Record<Denomination, string> = { 500: 'CINC-CENTS', 100: 'CENT', 50: 'CINQUANTA', 20: 'VINT', 10: 'DEU', 5: 'CINC', 1: 'U' };

export const GROUP: Record<ColorGroup, { band: string; ink: string; order: number }> = {
  marro: { band: '#5B3726', ink: '#fff', order: 0 },
  'blau-cel': { band: '#2E9DE6', ink: '#fff', order: 1 },
  rosa: { band: '#E24FC2', ink: '#151515', order: 2 },
  taronja: { band: '#E8672C', ink: '#151515', order: 3 },
  vermell: { band: '#ED1B24', ink: '#fff', order: 4 },
  groc: { band: '#F0CF2C', ink: '#151515', order: 5 },
  verd: { band: '#2F9A2F', ink: '#fff', order: 6 },
  'blau-fosc': { band: '#2341E0', ink: '#fff', order: 7 },
};

export const fmt = (n: number) => n.toLocaleString('ca-ES');

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const CHECK =
  '<svg width="16" height="16" viewBox="0 0 14 14" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7"/></svg>';
const CHURCH = (sz: number) =>
  `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" aria-hidden="true" fill="#151515"><path d="M11 0h2v2.5h2v2h-2V8l5 3.6V24h-4.5v-5a2.5 2.5 0 0 0-5 0v5H4V11.6L11 8V4.5H9v-2h2z"/></svg>`;
const TRAIN = (sz: number) =>
  `<svg width="${sz}" height="${Math.round(sz * 0.72)}" viewBox="0 0 22 16" aria-hidden="true" fill="#151515"><rect x="3" y="2" width="12" height="9" rx="2"/><rect x="15" y="5" width="5" height="6"/><circle cx="6" cy="13" r="2"/><circle cx="12" cy="13" r="2"/><circle cx="18" cy="13" r="2"/></svg>`;
const BOLT = (sz: number) =>
  `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" aria-hidden="true" fill="#F0CF2C" stroke="#151515" stroke-width="1.5" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>`;
const DROP = (sz: number) =>
  `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" aria-hidden="true" fill="#2E9DE6" stroke="#151515" stroke-width="1.5"><path d="M12 2.5C9 7 5.5 10.5 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 10.5 15 7 12 2.5z"/></svg>`;

export function squareIcon(sq: OwnableSquare, sz: number): string {
  if (sq.kind === 'utility') return sq.name === 'Llum' ? BOLT(sz) : DROP(sz);
  return sq.name === 'Plaça Vella' ? CHURCH(sz) : TRAIN(sz);
}

export const billHtml = (v: Denomination) =>
  `<div class="bill" style="--bc:${COL[v]}"><div class="in"><s class="c tl">${v}</s><s class="c tr">${v}</s><em class="brand">TARROJAPOLY</em>
  <span class="oval">${v}<small>€</small></span><em class="word">${WORD[v]}</em><s class="c bl">${v}</s><s class="c br">${v}</s></div></div>`;

export function avatar(id: string, cls = ''): string {
  const u = userById(id);
  return `<span class="av ${cls}" style="background:${u.color}">${esc(initials(u.name))}</span>`;
}

export const nameOf = (id: string) => (id === 'bank' ? 'la banca' : userById(id).name);

/** Text del lloguer actual de la carta, tenint en compte el grup, les cases i les estacions. */
export function rentLabel(rent: number | null, sq: OwnableSquare): string {
  if (sq.kind === 'utility' && rent === null) return '4×daus';
  return `${fmt(rent ?? 0)}€`;
}

export function deedHtml(index: number, deed: Deed | undefined, rent: number | null): string {
  const sq = getOwnable(index);
  const mort = deed?.mortgaged ? ' style="opacity:.55"' : '';
  const foot = `<div class="price">${deed?.mortgaged ? 'HIPOTECADA' : `Hipoteca ${sq.price / 2}€`}</div>`;
  if (sq.kind !== 'street') {
    return `<div class="deed st"${mort}><div class="hd">${squareIcon(sq, 26)}<span>${esc(sq.name)}</span></div>
    <div class="rent"><small>LLOGUER</small><b>${rentLabel(rent, sq)}</b></div>${foot}</div>`;
  }
  const g = GROUP[sq.group];
  const b = deed?.buildings ?? 0;
  const houses = b === HOTEL ? '<i style="background:var(--red);clip-path:none;width:12px;border-radius:1px"></i>' : '<i></i>'.repeat(b);
  return `<div class="deed"${mort}><div class="hd" style="background:${g.band};color:${g.ink}">${esc(sq.name)}</div><div class="buy">Preu de compra: ${sq.price}€</div>
    <div class="rent"><small>LLOGUER</small><b>${rentLabel(rent, sq)}</b></div><div class="houses">${houses}</div>${foot}</div>`;
}

/** Ordre per «Ordenar»: per grup de color i, dins del grup, per preu. Estacions i serveis al final. */
export function sortKey(index: number): number {
  const sq = getOwnable(index);
  const group = sq.kind === 'street' ? GROUP[sq.group].order : sq.kind === 'station' ? 8 : 9;
  return group * 1000 + sq.price;
}

export function groupKey(index: number): number {
  return Math.floor(sortKey(index) / 1000);
}
