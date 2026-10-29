// Regles del Monopoly clàssic sobre propietats: lloguers, construcció i hipoteques.

import {
  BOARD,
  STATION_RENT,
  TOTAL_HOTELS,
  TOTAL_HOUSES,
  UTILITY_MULTIPLIER,
  getOwnable,
  streetsInGroup,
  type StreetSquare,
} from '../data/board';

export type PlayerId = string;

export interface Deed {
  owner: PlayerId;
  /** 0 a 4 cases; 5 vol dir hotel. */
  buildings: number;
  mortgaged: boolean;
}

/** Títols de propietat comprats, per índex de casella. */
export type Deeds = Record<number, Deed>;

export const HOTEL = 5;

export function ownsWholeGroup(deeds: Deeds, street: StreetSquare, owner: PlayerId): boolean {
  return streetsInGroup(street.group).every((s) => deeds[s.index]?.owner === owner);
}

function countOwned(deeds: Deeds, owner: PlayerId, kind: 'station' | 'utility'): number {
  return BOARD.filter((s) => s.kind === kind && deeds[s.index]?.owner === owner).length;
}

/**
 * Lloguer que ha de pagar qui cau a la casella. Per als serveis cal la suma dels daus.
 * Retorna 0 si la casella no té propietari o està hipotecada.
 */
export function rentFor(deeds: Deeds, squareIndex: number, diceTotal?: number): number {
  const square = getOwnable(squareIndex);
  const deed = deeds[squareIndex];
  if (!deed || deed.mortgaged) return 0;

  switch (square.kind) {
    case 'street': {
      if (deed.buildings > 0) return square.rent[deed.buildings]!;
      const base = square.rent[0];
      return ownsWholeGroup(deeds, square, deed.owner) ? base * 2 : base;
    }
    case 'station':
      return STATION_RENT[countOwned(deeds, deed.owner, 'station') - 1]!;
    case 'utility': {
      if (diceTotal === undefined) throw new Error('Per als serveis cal saber què han tret els daus');
      const owned = countOwned(deeds, deed.owner, 'utility');
      return UTILITY_MULTIPLIER[owned - 1]! * diceTotal;
    }
  }
}

export interface BankStock {
  houses: number;
  hotels: number;
}

export function bankStock(deeds: Deeds): BankStock {
  let houses = TOTAL_HOUSES;
  let hotels = TOTAL_HOTELS;
  for (const deed of Object.values(deeds)) {
    if (deed.buildings === HOTEL) hotels--;
    else houses -= deed.buildings;
  }
  return { houses, hotels };
}

function asStreet(squareIndex: number): StreetSquare {
  const square = getOwnable(squareIndex);
  if (square.kind !== 'street') throw new RuleError('Només es pot construir als carrers');
  return square;
}

/** Comprova si `player` pot afegir una casa (o l'hotel) a la casella. Llança RuleError si no. */
export function assertCanBuild(deeds: Deeds, squareIndex: number, player: PlayerId): void {
  const street = asStreet(squareIndex);
  const deed = deeds[squareIndex];
  if (!deed || deed.owner !== player) throw new RuleError('Aquesta propietat no és teva');
  if (!ownsWholeGroup(deeds, street, player)) throw new RuleError('Cal tenir tot el grup de color');
  const group = streetsInGroup(street.group);
  if (group.some((s) => deeds[s.index]!.mortgaged)) {
    throw new RuleError('No es pot construir si hi ha alguna propietat del grup hipotecada');
  }
  if (deed.buildings === HOTEL) throw new RuleError('Ja hi ha un hotel');
  const min = Math.min(...group.map((s) => deeds[s.index]!.buildings));
  if (deed.buildings > min) throw new RuleError('Cal construir de manera uniforme dins del grup');
  const stock = bankStock(deeds);
  if (deed.buildings === 4 && stock.hotels === 0) throw new RuleError('La banca no té hotels');
  if (deed.buildings < 4 && stock.houses === 0) throw new RuleError('La banca no té cases');
}

/** Comprova si `player` pot vendre una casa (o l'hotel) de la casella. */
export function assertCanSellBuilding(deeds: Deeds, squareIndex: number, player: PlayerId): void {
  const street = asStreet(squareIndex);
  const deed = deeds[squareIndex];
  if (!deed || deed.owner !== player) throw new RuleError('Aquesta propietat no és teva');
  if (deed.buildings === 0) throw new RuleError('No hi ha res per vendre');
  const max = Math.max(...streetsInGroup(street.group).map((s) => deeds[s.index]!.buildings));
  if (deed.buildings < max) throw new RuleError('Cal vendre de manera uniforme dins del grup');
  // Si es ven un hotel, la banca ha de tenir 4 cases per tornar-les.
  if (deed.buildings === HOTEL && bankStock(deeds).houses < 4) {
    throw new RuleError('La banca no té prou cases per desfer l’hotel');
  }
}

export function buildCost(squareIndex: number): number {
  return asStreet(squareIndex).houseCost;
}

/** La banca recompra les cases i els hotels a la meitat del preu. */
export function sellBuildingValue(squareIndex: number): number {
  return asStreet(squareIndex).houseCost / 2;
}

export function assertCanMortgage(deeds: Deeds, squareIndex: number, player: PlayerId): void {
  const square = getOwnable(squareIndex);
  const deed = deeds[squareIndex];
  if (!deed || deed.owner !== player) throw new RuleError('Aquesta propietat no és teva');
  if (deed.mortgaged) throw new RuleError('Ja està hipotecada');
  if (square.kind === 'street' && streetsInGroup(square.group).some((s) => (deeds[s.index]?.buildings ?? 0) > 0)) {
    throw new RuleError('Primer cal vendre les cases del grup');
  }
}

export function assertCanUnmortgage(deeds: Deeds, squareIndex: number, player: PlayerId): void {
  const deed = deeds[squareIndex];
  if (!deed || deed.owner !== player) throw new RuleError('Aquesta propietat no és teva');
  if (!deed.mortgaged) throw new RuleError('No està hipotecada');
}

export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleError';
  }
}
