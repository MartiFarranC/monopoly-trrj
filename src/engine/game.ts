// Motor de la partida. Funció pura: (estat, qui actua, acció) → nou estat.
// El mateix codi el farà servir el servidor (per validar) i els mòbils (per mostrar l'estat).

import { GO_SALARY, MAX_PLAYERS, MIN_PLAYERS, getOwnable, getSquare, mortgageValue, unmortgageCost } from '../data/board';
import {
  addWallets,
  bankBills,
  hasBills,
  planPayment,
  startingWallet,
  subtractWallets,
  toWallet,
  walletTotal,
  type Wallet,
} from './bills';
import {
  HOTEL,
  RuleError,
  assertCanBuild,
  assertCanMortgage,
  assertCanSellBuilding,
  assertCanUnmortgage,
  buildCost,
  rentFor,
  sellBuildingValue,
  type Deeds,
  type PlayerId,
} from './rules';

export const BANK = 'bank' as const;
export type Party = PlayerId | typeof BANK;

export type MasterRequestKind = 'buy' | 'build' | 'sell-building' | 'mortgage' | 'unmortgage' | 'bank-payment';

export interface MasterRequest {
  id: string;
  kind: MasterRequestKind;
  player: PlayerId;
  square?: number;
  /** Només per a 'bank-payment': diners que la banca dona al jugador (p. ex. una carta de Sort). */
  amount?: number;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface PaymentRequest {
  id: string;
  creditor: PlayerId;
  debtor: PlayerId;
  amount: number;
  square?: number;
  status: 'pending' | 'paid' | 'cancelled';
}

export interface Transaction {
  id: string;
  from: Party;
  to: Party;
  amount: number;
  reason: string;
  /** Bitllets que han viatjat (per a l'animació dels bitllets volant). */
  bills: Wallet;
  /** Si qui paga no tenia l'import just, primer ha canviat bitllets amb la banca. */
  exchange?: { toBank: Wallet; fromBank: Wallet };
}

export interface Auction {
  square: number;
  bids: { player: PlayerId; amount: number }[];
}

export interface GameState {
  status: 'lobby' | 'playing' | 'finished';
  master: PlayerId;
  invited: PlayerId[];
  joined: PlayerId[];
  turnOrder: PlayerId[];
  currentTurn: number;
  wallets: Record<PlayerId, Wallet>;
  deeds: Deeds;
  requests: MasterRequest[];
  paymentRequests: PaymentRequest[];
  auction: Auction | null;
  lastDice: [number, number] | null;
  transactions: Transaction[];
  seq: number;
}

export type Action =
  | { type: 'join' }
  | { type: 'set-turn-order'; order: PlayerId[] }
  | { type: 'roll-dice'; dice: [number, number] }
  | { type: 'end-turn' }
  | { type: 'request'; kind: Exclude<MasterRequestKind, 'bank-payment'>; square: number }
  | { type: 'request-bank-payment'; amount: number; reason: string }
  | { type: 'resolve-request'; requestId: string; approve: boolean }
  | { type: 'request-payment'; debtor: PlayerId; square: number; diceTotal?: number }
  | { type: 'request-payment'; debtor: PlayerId; amount: number }
  /** `bills`: els bitllets que tria el jugador; han de sumar l'import just. Sense `bills`, els tria l'app. */
  | { type: 'pay-request'; requestId: string; bills?: Partial<Wallet> }
  | { type: 'cancel-payment-request'; requestId: string }
  | { type: 'pay'; to: Party; amount: number; reason: string; bills?: Partial<Wallet> }
  /** Canviar bitllets a la banca, p. ex. un de 100 per dos de 50. */
  | { type: 'exchange-bills'; give: Partial<Wallet>; receive: Partial<Wallet> }
  | { type: 'pass-go' }
  | { type: 'start-auction'; square: number }
  | { type: 'bid'; amount: number }
  | { type: 'close-auction' };

/** Crea la partida: qui clica «Començar partida» és el màster i tria qui juga (ell inclòs). */
export function createGame(master: PlayerId, players: PlayerId[]): GameState {
  const invited = [...new Set([master, ...players])];
  if (invited.length < MIN_PLAYERS || invited.length > MAX_PLAYERS) {
    throw new RuleError(`Hi ha d'haver entre ${MIN_PLAYERS} i ${MAX_PLAYERS} jugadors`);
  }
  return {
    status: 'lobby',
    master,
    invited,
    joined: [master],
    turnOrder: [],
    currentTurn: 0,
    wallets: {},
    deeds: {},
    requests: [],
    paymentRequests: [],
    auction: null,
    lastDice: null,
    transactions: [],
    seq: 0,
  };
}

export function balanceOf(state: GameState, player: PlayerId): number {
  const wallet = state.wallets[player];
  return wallet ? walletTotal(wallet) : 0;
}

export function currentPlayer(state: GameState): PlayerId | undefined {
  return state.turnOrder[state.currentTurn];
}

export function applyAction(prev: GameState, actor: PlayerId, action: Action): GameState {
  const state = structuredClone(prev);
  const nextId = () => String(++state.seq);

  const requireMaster = () => {
    if (actor !== state.master) throw new RuleError('Només el màster pot fer això');
  };
  const requirePlaying = () => {
    if (state.status !== 'playing') throw new RuleError('La partida no està en joc');
    if (!state.turnOrder.includes(actor)) throw new RuleError('No jugues en aquesta partida');
  };

  const transfer = (from: Party, to: Party, amount: number, reason: string, chosen?: Partial<Wallet>) => {
    let bills: Wallet;
    let exchange: Transaction['exchange'];
    if (from === BANK) {
      bills = bankBills(amount);
    } else if (chosen) {
      // El jugador tria els bitllets. Han de sumar l'import just: qui cobra no torna mai canvi,
      // així que si no el té, primer ha de canviar a la banca.
      bills = toWallet(chosen);
      if (!hasBills(state.wallets[from]!, bills)) throw new RuleError('No tens aquests bitllets');
      if (walletTotal(bills) !== amount) {
        throw new RuleError(`Els bitllets sumen ${walletTotal(bills)} i cal pagar ${amount}. Demana canvi a la banca.`);
      }
      state.wallets[from] = subtractWallets(state.wallets[from]!, bills);
    } else {
      // Si no té l'import just, qui paga canvia bitllets amb la banca; qui cobra mai torna canvi.
      const plan = planPayment(state.wallets[from]!, amount);
      state.wallets[from] = plan.remaining;
      bills = plan.given;
      exchange = plan.exchange ?? undefined;
    }
    if (to !== BANK) state.wallets[to] = addWallets(state.wallets[to]!, bills);
    state.transactions.push({ id: nextId(), from, to, amount, reason, bills, ...(exchange && { exchange }) });
  };

  const requireFunds = (player: PlayerId, amount: number) => {
    if (balanceOf(state, player) < amount) throw new RuleError('No tens prou diners');
  };

  const executeRequest = (req: MasterRequest) => {
    const { player, square } = req;
    switch (req.kind) {
      case 'buy': {
        const s = getOwnable(square!);
        if (state.deeds[s.index]) throw new RuleError('Aquesta propietat ja té propietari');
        requireFunds(player, s.price);
        transfer(player, BANK, s.price, `Compra de ${s.name}`);
        state.deeds[s.index] = { owner: player, buildings: 0, mortgaged: false };
        break;
      }
      case 'build': {
        assertCanBuild(state.deeds, square!, player);
        const cost = buildCost(square!);
        requireFunds(player, cost);
        const deed = state.deeds[square!]!;
        transfer(player, BANK, cost, `${deed.buildings === 4 ? 'Hotel' : 'Casa'} a ${getSquare(square!).name}`);
        deed.buildings++;
        break;
      }
      case 'sell-building': {
        assertCanSellBuilding(state.deeds, square!, player);
        const deed = state.deeds[square!]!;
        transfer(BANK, player, sellBuildingValue(square!), `Venda ${deed.buildings === HOTEL ? "d'hotel" : 'de casa'} a ${getSquare(square!).name}`);
        deed.buildings--;
        break;
      }
      case 'mortgage': {
        assertCanMortgage(state.deeds, square!, player);
        const s = getOwnable(square!);
        transfer(BANK, player, mortgageValue(s), `Hipoteca de ${s.name}`);
        state.deeds[square!]!.mortgaged = true;
        break;
      }
      case 'unmortgage': {
        assertCanUnmortgage(state.deeds, square!, player);
        const s = getOwnable(square!);
        const cost = unmortgageCost(s);
        requireFunds(player, cost);
        transfer(player, BANK, cost, `Aixecar la hipoteca de ${s.name}`);
        state.deeds[square!]!.mortgaged = false;
        break;
      }
      case 'bank-payment':
        transfer(BANK, player, req.amount!, req.reason ?? 'Pagament de la banca');
        break;
    }
  };

  const submitRequest = (req: Omit<MasterRequest, 'id' | 'status'>) => {
    const full: MasterRequest = { ...req, id: nextId(), status: 'pending' };
    // El màster també juga: les seves peticions s'apliquen directament.
    if (actor === state.master) {
      executeRequest(full);
      full.status = 'approved';
    }
    state.requests.push(full);
  };

  switch (action.type) {
    case 'join': {
      if (state.status !== 'lobby') throw new RuleError('La partida ja ha començat');
      if (!state.invited.includes(actor)) throw new RuleError('No estàs convidat a aquesta partida');
      if (!state.joined.includes(actor)) state.joined.push(actor);
      break;
    }
    case 'set-turn-order': {
      requireMaster();
      if (state.status !== 'lobby') throw new RuleError('La partida ja ha començat');
      const missing = state.invited.filter((p) => !state.joined.includes(p));
      if (missing.length) throw new RuleError('Encara no s’hi ha unit tothom');
      const sameSet = action.order.length === state.joined.length && action.order.every((p) => state.joined.includes(p));
      if (!sameSet || new Set(action.order).size !== action.order.length) {
        throw new RuleError("L'ordre ha d'incloure cada jugador una vegada");
      }
      state.turnOrder = [...action.order];
      state.status = 'playing';
      for (const p of state.turnOrder) state.wallets[p] = startingWallet();
      break;
    }
    case 'roll-dice': {
      requirePlaying();
      const [a, b] = action.dice;
      if (![a, b].every((d) => Number.isInteger(d) && d >= 1 && d <= 6)) throw new RuleError('Daus no vàlids');
      state.lastDice = [a, b];
      break;
    }
    case 'end-turn': {
      requirePlaying();
      if (actor !== currentPlayer(state) && actor !== state.master) throw new RuleError('No és el teu torn');
      state.currentTurn = (state.currentTurn + 1) % state.turnOrder.length;
      state.lastDice = null;
      break;
    }
    case 'request': {
      requirePlaying();
      submitRequest({ kind: action.kind, player: actor, square: action.square });
      break;
    }
    case 'request-bank-payment': {
      requirePlaying();
      if (!Number.isInteger(action.amount) || action.amount <= 0) throw new RuleError('Import no vàlid');
      submitRequest({ kind: 'bank-payment', player: actor, amount: action.amount, reason: action.reason });
      break;
    }
    case 'resolve-request': {
      requireMaster();
      const req = state.requests.find((r) => r.id === action.requestId);
      if (!req || req.status !== 'pending') throw new RuleError('Aquesta petició ja no està pendent');
      if (action.approve) executeRequest(req);
      req.status = action.approve ? 'approved' : 'rejected';
      break;
    }
    case 'request-payment': {
      requirePlaying();
      if (!state.turnOrder.includes(action.debtor) || action.debtor === actor) {
        throw new RuleError('Tria un altre jugador de la partida');
      }
      let amount: number;
      let square: number | undefined;
      if ('square' in action) {
        square = action.square;
        const deed = state.deeds[square];
        if (deed?.owner !== actor) throw new RuleError('Aquesta propietat no és teva');
        amount = rentFor(state.deeds, square, action.diceTotal ?? sumDice(state.lastDice));
        if (amount === 0) throw new RuleError('Aquesta propietat no cobra lloguer ara mateix');
      } else {
        amount = action.amount;
        if (!Number.isInteger(amount) || amount <= 0) throw new RuleError('Import no vàlid');
      }
      state.paymentRequests.push({ id: nextId(), creditor: actor, debtor: action.debtor, amount, square, status: 'pending' });
      break;
    }
    case 'pay-request': {
      requirePlaying();
      const req = state.paymentRequests.find((r) => r.id === action.requestId);
      if (!req || req.status !== 'pending') throw new RuleError('Aquesta sol·licitud ja no està pendent');
      if (req.debtor !== actor) throw new RuleError('Aquesta sol·licitud no és per a tu');
      requireFunds(actor, req.amount);
      const reason = req.square !== undefined ? `Lloguer de ${getSquare(req.square).name}` : 'Paga sol·licitada';
      transfer(actor, req.creditor, req.amount, reason, action.bills);
      req.status = 'paid';
      break;
    }
    case 'cancel-payment-request': {
      const req = state.paymentRequests.find((r) => r.id === action.requestId);
      if (!req || req.status !== 'pending') throw new RuleError('Aquesta sol·licitud ja no està pendent');
      if (req.creditor !== actor && actor !== state.master) throw new RuleError('Només qui la demana la pot anul·lar');
      req.status = 'cancelled';
      break;
    }
    case 'pay': {
      requirePlaying();
      if (!Number.isInteger(action.amount) || action.amount <= 0) throw new RuleError('Import no vàlid');
      if (action.to === actor) throw new RuleError('No et pots pagar a tu mateix');
      if (action.to !== BANK && !state.turnOrder.includes(action.to)) throw new RuleError('Aquest jugador no és a la partida');
      requireFunds(actor, action.amount);
      transfer(actor, action.to, action.amount, action.reason, action.bills);
      break;
    }
    case 'exchange-bills': {
      requirePlaying();
      const give = toWallet(action.give);
      const receive = toWallet(action.receive);
      if (walletTotal(give) === 0) throw new RuleError('Tria quins bitllets vols canviar');
      if (walletTotal(give) !== walletTotal(receive)) throw new RuleError('El canvi ha de sumar el mateix');
      if (!hasBills(state.wallets[actor]!, give)) throw new RuleError('No tens aquests bitllets');
      state.wallets[actor] = addWallets(subtractWallets(state.wallets[actor]!, give), receive);
      state.transactions.push({
        id: nextId(),
        from: actor,
        to: BANK,
        amount: 0,
        reason: 'Canvi a la banca',
        bills: give,
        exchange: { toBank: give, fromBank: receive },
      });
      break;
    }
    case 'pass-go': {
      requirePlaying();
      transfer(BANK, actor, GO_SALARY, 'Pas per la Sortida');
      break;
    }
    case 'start-auction': {
      requirePlaying();
      if (state.auction) throw new RuleError('Ja hi ha una subhasta en marxa');
      const s = getOwnable(action.square);
      if (state.deeds[s.index]) throw new RuleError('Aquesta propietat ja té propietari');
      state.auction = { square: s.index, bids: [] };
      break;
    }
    case 'bid': {
      requirePlaying();
      if (!state.auction) throw new RuleError('No hi ha cap subhasta');
      const highest = state.auction.bids.at(-1)?.amount ?? 0;
      if (!Number.isInteger(action.amount) || action.amount <= highest) {
        throw new RuleError(`Cal pujar més de ${highest}`);
      }
      requireFunds(actor, action.amount);
      state.auction.bids.push({ player: actor, amount: action.amount });
      break;
    }
    case 'close-auction': {
      requireMaster();
      if (!state.auction) throw new RuleError('No hi ha cap subhasta');
      const { square, bids } = state.auction;
      // Si el guanyador ja no té prou diners, guanya la puja vàlida anterior.
      const winner = [...bids].reverse().find((b) => balanceOf(state, b.player) >= b.amount);
      if (winner) {
        transfer(winner.player, BANK, winner.amount, `Subhasta de ${getSquare(square).name}`);
        state.deeds[square] = { owner: winner.player, buildings: 0, mortgaged: false };
      }
      state.auction = null;
      break;
    }
  }
  return state;
}

function sumDice(dice: [number, number] | null): number | undefined {
  return dice ? dice[0] + dice[1] : undefined;
}
