// Tauler del Tarrojapoly, tret de les captures del Canva. Els preus de compra visibles al tauler
// coincideixen amb el Monopoly clàssic; els lloguers, cases i hipoteques encara són en blanc a les
// cartes, així que fem servir els del Monopoly clàssic per a cada franja de preu.

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
  street(1, 'La Font', 'marro', 60, 50, [2, 10, 30, 90, 160, 250]),
  { kind: 'community-chest', index: 2, name: 'Caixa de la comunitat' },
  street(3, 'Safareig', 'marro', 60, 50, [4, 20, 60, 180, 320, 450]),
  { kind: 'tax', index: 4, name: 'Impost', amount: 200 },
  { kind: 'station', index: 5, name: 'Plaça Vella', price: 200 },
  street(6, 'Sant Julià', 'blau-cel', 100, 50, [6, 30, 90, 270, 400, 550]),
  street(7, "Plaça de l'Arbre", 'blau-cel', 100, 50, [6, 30, 90, 270, 400, 550]),
  { kind: 'community-chest', index: 8, name: 'Caixa de la comunitat' },
  street(9, 'Roda del Perdó', 'blau-cel', 120, 50, [8, 40, 100, 300, 450, 600]),
  { kind: 'jail', index: 10, name: 'Presó' },
  street(11, 'Castell', 'rosa', 140, 100, [10, 50, 150, 450, 625, 750]),
  { kind: 'utility', index: 12, name: 'Llum', price: 150 },
  street(13, 'Cal Pastor', 'rosa', 140, 100, [10, 50, 150, 450, 625, 750]),
  street(14, 'Ca la Paulina', 'rosa', 160, 100, [12, 60, 180, 500, 700, 900]),
  { kind: 'station', index: 15, name: 'Plaça del Cub', price: 200 },
  street(16, 'Cal Munda', 'taronja', 180, 100, [14, 70, 200, 550, 750, 950]),
  { kind: 'chance', index: 17, name: 'Sort' },
  street(18, 'Cal Noches', 'taronja', 180, 100, [14, 70, 200, 550, 750, 950]),
  street(19, 'Cal Marxant', 'taronja', 200, 100, [16, 80, 220, 600, 800, 1000]),
  { kind: 'free-parking', index: 20, name: 'Parking' },
  street(21, 'Cal Trilla', 'vermell', 220, 150, [18, 90, 250, 700, 875, 1050]),
  { kind: 'chance', index: 22, name: 'Sort' },
  street(23, 'Cal Sió el Carinyo', 'vermell', 220, 150, [18, 90, 250, 700, 875, 1050]),
  street(24, 'Cal Mingo', 'vermell', 240, 150, [20, 100, 300, 750, 925, 1100]),
  { kind: 'station', index: 25, name: 'Plaça de la Garbiana', price: 200 },
  street(26, 'Raval', 'groc', 260, 150, [22, 110, 330, 800, 975, 1150]),
  { kind: 'utility', index: 27, name: 'Aigua', price: 150 },
  street(28, 'Lokal', 'groc', 280, 150, [24, 120, 360, 850, 1025, 1200]),
  street(29, 'Cal Palouet', 'groc', 280, 150, [24, 120, 360, 850, 1025, 1200]),
  { kind: 'go-to-jail', index: 30, name: 'Ves a la presó' },
  street(31, 'Cal Bruc', 'verd', 300, 200, [26, 130, 390, 900, 1100, 1275]),
  street(32, 'Piscina', 'verd', 300, 200, [26, 130, 390, 900, 1100, 1275]),
  { kind: 'chance', index: 33, name: 'Sort' },
  street(34, 'Bar', 'verd', 320, 200, [28, 150, 450, 1000, 1200, 1400]),
  { kind: 'station', index: 35, name: 'Plaça Nova', price: 200 },
  // Al tauler hi posa «aigua», però ja hi ha l'Aigua a la 27: de moment és una casella de Sort.
  { kind: 'chance', index: 36, name: 'Sort' },
  street(37, 'Ajuntament', 'blau-fosc', 350, 200, [35, 175, 500, 1100, 1300, 1500]),
  { kind: 'tax', index: 38, name: 'Impost', amount: 100 },
  street(39, 'Església', 'blau-fosc', 400, 200, [50, 200, 600, 1400, 1700, 2000]),
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
