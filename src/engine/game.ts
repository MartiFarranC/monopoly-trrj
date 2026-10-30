// Motor de la partida. Funció pura: (estat, qui actua, acció) → nou estat.
// El mateix codi el farà servir el servidor (per validar) i els mòbils (per mostrar l'estat).

import { GO_SALARY, MAX_PLAYERS, MIN_PLAYERS, getOwnable, getSquare, mortgageValue, unmortgageCost } from '../data/board';
import {
  addWallets,
  bankStartingWallet,
  dealStartingMoney,
  hasBills,
  payFromBank,
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
  /** Bitllets amb què pagarà (compres, cases i hipoteques aixecades). Han de sumar l'import just. */
  bills?: Wallet;
  status: 'pending' | 'approved' | 'rejected';
}

export interface PaymentRequest {
  id: string;
  /** Qui cobra. La banca cobra, per exemple, la puja guanyadora d'una subhasta. */
  creditor: Party;
  debtor: PlayerId;
  amount: number;
  square?: number;
  /** Si és el pagament d'una subhasta, en pagar-lo el deutor es queda la propietat. */
  auction?: boolean;
  status: 'pending' | 'paid' | 'cancelled';
}

/** Proposta de canvi de bitllets entre dos jugadors: `from` dona `give` i rep `receive`. */
export interface ExchangeOffer {
  id: string;
  from: PlayerId;
  to: PlayerId;
  give: Wallet;
  receive: Wallet;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
}

export interface Transaction {
  id: string;
  from: Party;
  to: Party;
  amount: number;
  reason: string;
  /** Bitllets que han viatjat (per a l'animació dels bitllets volant). */
  bills: Wallet;
  /** En un canvi de bitllets, el que `to` ha donat a `from` a canvi de `bills`. */
  returned?: Wallet;
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
  /** Bitllets que queden a la banca. No són infinits: com a la caixa del joc, n'hi ha 30 de cada. */
  bank: Wallet;
  deeds: Deeds;
  requests: MasterRequest[];
  paymentRequests: PaymentRequest[];
  exchangeOffers: ExchangeOffer[];
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
  /** Per a 'buy', 'build' i 'unmortgage' cal dir amb quins bitllets es pagarà. */
  | { type: 'request'; kind: Exclude<MasterRequestKind, 'bank-payment'>; square: number; bills?: Partial<Wallet> }
  | { type: 'request-bank-payment'; amount: number; reason: string }
  | { type: 'resolve-request'; requestId: string; approve: boolean }
  | { type: 'request-payment'; debtor: PlayerId; square: number; diceTotal?: number }
  | { type: 'request-payment'; debtor: PlayerId; amount: number }
  /** `bills`: els bitllets que tria el jugador. Han de sumar l'import just. */
  | { type: 'pay-request'; requestId: string; bills: Partial<Wallet> }
  | { type: 'cancel-payment-request'; requestId: string }
  | { type: 'pay'; to: Party; amount: number; reason: string; bills: Partial<Wallet> }
  /** Canviar bitllets a la banca: un de 100 per dos de 50, o deu d'1 per un de 10. */
  | { type: 'exchange-bills'; give: Partial<Wallet>; receive: Partial<Wallet> }
  /** Proposar a un altre jugador un canvi de bitllets; l'altre l'accepta o el rebutja. */
  | { type: 'propose-exchange'; to: PlayerId; give: Partial<Wallet>; receive: Partial<Wallet> }
  | { type: 'respond-exchange'; offerId: string; accept: boolean }
  | { type: 'cancel-exchange'; offerId: string }
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
    bank: bankStartingWallet(),
    deeds: {},
    requests: [],
    paymentRequests: [],
    exchangeOffers: [],
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

  /** Només es paga amb l'import just: qui cobra no torna mai canvi. */
  const transfer = (from: Party, to: Party, amount: number, reason: string, chosen?: Partial<Wallet>) => {
    let bills: Wallet;
    if (from === BANK) {
      const paid = payFromBank(state.bank, amount);
      state.bank = paid.bank;
      bills = paid.given;
    } else {
      if (!chosen) throw new RuleError('Tria amb quins bitllets pagues');
      bills = toWallet(chosen);
      if (!hasBills(state.wallets[from]!, bills)) throw new RuleError('No tens aquests bitllets');
      if (walletTotal(bills) !== amount) {
        throw new RuleError(`Els bitllets sumen ${walletTotal(bills)} i cal pagar ${amount} just. Demana canvi abans.`);
      }
      state.wallets[from] = subtractWallets(state.wallets[from]!, bills);
    }
    if (to === BANK) state.bank = addWallets(state.bank, bills);
    else state.wallets[to] = addWallets(state.wallets[to]!, bills);
    state.transactions.push({ id: nextId(), from, to, amount, reason, bills });
  };

  const swap = (a: PlayerId, b: Party, give: Wallet, receive: Wallet, reason: string) => {
    if (walletTotal(give) === 0) throw new RuleError('Tria quins bitllets vols canviar');
    if (walletTotal(give) !== walletTotal(receive)) throw new RuleError('El canvi ha de sumar el mateix');
    if (!hasBills(state.wallets[a]!, give)) throw new RuleError('No tens aquests bitllets');
    const other = b === BANK ? state.bank : state.wallets[b]!;
    if (!hasBills(addWallets(other, give), receive)) {
      throw new RuleError(b === BANK ? 'La banca no té aquests bitllets' : 'L\u2019altre jugador no té aquests bitllets');
    }
    state.wallets[a] = addWallets(subtractWallets(state.wallets[a]!, give), receive);
    const updated = subtractWallets(addWallets(other, give), receive);
    if (b === BANK) state.bank = updated;
    else state.wallets[b] = updated;
    state.transactions.push({ id: nextId(), from: a, to: b, amount: 0, reason, bills: give, returned: receive });
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
        transfer(player, BANK, s.price, `Compra de ${s.name}`, req.bills);
        state.deeds[s.index] = { owner: player, buildings: 0, mortgaged: false };
        break;
      }
      case 'build': {
        assertCanBuild(state.deeds, square!, player);
        const cost = buildCost(square!);
        requireFunds(player, cost);
        const deed = state.deeds[square!]!;
        transfer(player, BANK, cost, `${deed.buildings === 4 ? 'Hotel' : 'Casa'} a ${getSquare(square!).name}`, req.bills);
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
        transfer(player, BANK, cost, `Aixecar la hipoteca de ${s.name}`, req.bills);
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
      const dealt = dealStartingMoney(state.bank, state.turnOrder.length);
      state.bank = dealt.bank;
      state.turnOrder.forEach((p, i) => (state.wallets[p] = dealt.wallets[i]!));
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
      const pays = action.kind === 'buy' || action.kind === 'build' || action.kind === 'unmortgage';
      if (pays && !action.bills) throw new RuleError('Tria amb quins bitllets pagaràs');
      const bills = action.bills ? toWallet(action.bills) : undefined;
      if (bills && !hasBills(state.wallets[actor]!, bills)) throw new RuleError('No tens aquests bitllets');
      submitRequest({ kind: action.kind, player: actor, square: action.square, ...(bills && { bills }) });
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
      const reason = req.auction
        ? `Subhasta de ${getSquare(req.square!).name}`
        : req.square !== undefined
          ? `Lloguer de ${getSquare(req.square).name}`
          : 'Paga sol·licitada';
      transfer(actor, req.creditor, req.amount, reason, action.bills);
      req.status = 'paid';
      if (req.auction) state.deeds[req.square!] = { owner: actor, buildings: 0, mortgaged: false };
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
      swap(actor, BANK, toWallet(action.give), toWallet(action.receive), 'Canvi a la banca');
      break;
    }
    case 'propose-exchange': {
      requirePlaying();
      if (action.to === actor || !state.turnOrder.includes(action.to)) throw new RuleError('Tria un altre jugador de la partida');
      const give = toWallet(action.give);
      const receive = toWallet(action.receive);
      if (walletTotal(give) === 0) throw new RuleError('Tria quins bitllets vols canviar');
      if (walletTotal(give) !== walletTotal(receive)) throw new RuleError('El canvi ha de sumar el mateix');
      if (!hasBills(state.wallets[actor]!, give)) throw new RuleError('No tens aquests bitllets');
      state.exchangeOffers.push({ id: nextId(), from: actor, to: action.to, give, receive, status: 'pending' });
      break;
    }
    case 'respond-exchange': {
      requirePlaying();
      const offer = state.exchangeOffers.find((o) => o.id === action.offerId);
      if (!offer || offer.status !== 'pending') throw new RuleError('Aquest canvi ja no està pendent');
      if (offer.to !== actor) throw new RuleError('Aquest canvi no és per a tu');
      if (action.accept) swap(offer.from, offer.to, offer.give, offer.receive, 'Canvi entre jugadors');
      offer.status = action.accept ? 'accepted' : 'rejected';
      break;
    }
    case 'cancel-exchange': {
      const offer = state.exchangeOffers.find((o) => o.id === action.offerId);
      if (!offer || offer.status !== 'pending') throw new RuleError('Aquest canvi ja no està pendent');
      if (offer.from !== actor) throw new RuleError('Només qui l\u2019ha proposat el pot anul·lar');
      offer.status = 'cancelled';
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
      // El guanyador paga a la banca amb l'import just, com qualsevol altre pagament.
      if (winner) {
        state.paymentRequests.push({
          id: nextId(),
          creditor: BANK,
          debtor: winner.player,
          amount: winner.amount,
          square,
          auction: true,
          status: 'pending',
        });
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
