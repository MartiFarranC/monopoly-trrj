// Tauler provisional: caselles i preus del Monopoly clàssic.
// Quan tinguem el tauler de Tarroja només caldrà canviar els noms (i els preus si són diferents).

export type ColorGroup =
  | 'marro'
  | 'blau-cel'
  | 'rosa'
  | 'taronja'
  | 'vermell'
  | 'groc'
  | 'verd'
  | 'blau-fosc';

export interface StreetSquare {
  kind: 'street';
  index: number;
  name: string;
  group: ColorGroup;
  price: number;
  /** Lloguer sense cases, amb 1, 2, 3 i 4 cases, i amb hotel. */
  rent: [number, number, number, number, number, number];
  houseCost: number;
}

export interface StationSquare {
  kind: 'station';
  index: number;
  name: string;
  price: number;
}

export interface UtilitySquare {
  kind: 'utility';
  index: number;
  name: string;
  price: number;
}

export interface TaxSquare {
  kind: 'tax';
  index: number;
  name: string;
  amount: number;
}

export interface OtherSquare {
  kind: 'go' | 'jail' | 'free-parking' | 'go-to-jail' | 'chance' | 'community-chest';
  index: number;
  name: string;
}

export type OwnableSquare = StreetSquare | StationSquare | UtilitySquare;
export type Square = OwnableSquare | TaxSquare | OtherSquare;

export const GO_SALARY = 200;
export const STARTING_MONEY = 1500;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const TOTAL_HOUSES = 32;
export const TOTAL_HOTELS = 12;
export const JAIL_FINE = 50;
export const STATION_RENT = [25, 50, 100, 200] as const;
/** Multiplicador dels daus segons quants serveis té el propietari. */
export const UTILITY_MULTIPLIER = [4, 10] as const;

const street = (
  index: number,
  name: string,
  group: ColorGroup,
  price: number,
  houseCost: number,
  rent: StreetSquare['rent'],
): StreetSquare => ({ kind: 'street', index, name, group, price, houseCost, rent });

export const BOARD: readonly Square[] = [
  { kind: 'go', index: 0, name: 'Sortida' },
  street(1, 'Marró 1', 'marro', 60, 50, [2, 10, 30, 90, 160, 250]),
  { kind: 'community-chest', index: 2, name: 'Caixa de la comunitat' },
  street(3, 'Marró 2', 'marro', 60, 50, [4, 20, 60, 180, 320, 450]),
  { kind: 'tax', index: 4, name: 'Impost sobre la renda', amount: 200 },
  { kind: 'station', index: 5, name: 'Estació 1', price: 200 },
  street(6, 'Blau cel 1', 'blau-cel', 100, 50, [6, 30, 90, 270, 400, 550]),
  { kind: 'chance', index: 7, name: 'Sort' },
  street(8, 'Blau cel 2', 'blau-cel', 100, 50, [6, 30, 90, 270, 400, 550]),
  street(9, 'Blau cel 3', 'blau-cel', 120, 50, [8, 40, 100, 300, 450, 600]),
  { kind: 'jail', index: 10, name: 'Presó' },
  street(11, 'Rosa 1', 'rosa', 140, 100, [10, 50, 150, 450, 625, 750]),
  { kind: 'utility', index: 12, name: 'Companyia elèctrica', price: 150 },
  street(13, 'Rosa 2', 'rosa', 140, 100, [10, 50, 150, 450, 625, 750]),
  street(14, 'Rosa 3', 'rosa', 160, 100, [12, 60, 180, 500, 700, 900]),
  { kind: 'station', index: 15, name: 'Estació 2', price: 200 },
  street(16, 'Taronja 1', 'taronja', 180, 100, [14, 70, 200, 550, 750, 950]),
  { kind: 'community-chest', index: 17, name: 'Caixa de la comunitat' },
  street(18, 'Taronja 2', 'taronja', 180, 100, [14, 70, 200, 550, 750, 950]),
  street(19, 'Taronja 3', 'taronja', 200, 100, [16, 80, 220, 600, 800, 1000]),
  { kind: 'free-parking', index: 20, name: 'Parking' },
  street(21, 'Vermell 1', 'vermell', 220, 150, [18, 90, 250, 700, 875, 1050]),
  { kind: 'chance', index: 22, name: 'Sort' },
  street(23, 'Vermell 2', 'vermell', 220, 150, [18, 90, 250, 700, 875, 1050]),
  street(24, 'Vermell 3', 'vermell', 240, 150, [20, 100, 300, 750, 925, 1100]),
  { kind: 'station', index: 25, name: 'Estació 3', price: 200 },
  street(26, 'Groc 1', 'groc', 260, 150, [22, 110, 330, 800, 975, 1150]),
  street(27, 'Groc 2', 'groc', 260, 150, [22, 110, 330, 800, 975, 1150]),
  { kind: 'utility', index: 28, name: "Companyia d'aigües", price: 150 },
  street(29, 'Groc 3', 'groc', 280, 150, [24, 120, 360, 850, 1025, 1200]),
  { kind: 'go-to-jail', index: 30, name: 'Ves a la presó' },
  street(31, 'Verd 1', 'verd', 300, 200, [26, 130, 390, 900, 1100, 1275]),
  street(32, 'Verd 2', 'verd', 300, 200, [26, 130, 390, 900, 1100, 1275]),
  { kind: 'community-chest', index: 33, name: 'Caixa de la comunitat' },
  street(34, 'Verd 3', 'verd', 320, 200, [28, 150, 450, 1000, 1200, 1400]),
  { kind: 'station', index: 35, name: 'Estació 4', price: 200 },
  { kind: 'chance', index: 36, name: 'Sort' },
  street(37, 'Blau fosc 1', 'blau-fosc', 350, 200, [35, 175, 500, 1100, 1300, 1500]),
  { kind: 'tax', index: 38, name: 'Impost de luxe', amount: 100 },
  street(39, 'Blau fosc 2', 'blau-fosc', 400, 200, [50, 200, 600, 1400, 1700, 2000]),
];

export function isOwnable(square: Square): square is OwnableSquare {
  return square.kind === 'street' || square.kind === 'station' || square.kind === 'utility';
}

export function getSquare(index: number): Square {
  const square = BOARD[index];
  if (!square) throw new Error(`No existeix la casella ${index}`);
  return square;
}

export function getOwnable(index: number): OwnableSquare {
  const square = getSquare(index);
  if (!isOwnable(square)) throw new Error(`La casella ${index} (${square.name}) no es pot comprar`);
  return square;
}

export function streetsInGroup(group: ColorGroup): StreetSquare[] {
  return BOARD.filter((s): s is StreetSquare => s.kind === 'street' && s.group === group);
}

export function mortgageValue(square: OwnableSquare): number {
  return square.price / 2;
}

/** Per aixecar la hipoteca es paga el valor hipotecat més un 10% d'interès. */
export function unmortgageCost(square: OwnableSquare): number {
  return Math.ceil(mortgageValue(square) * 1.1);
}
