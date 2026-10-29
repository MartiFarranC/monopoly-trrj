// Bitllets: cada jugador té una cartera amb bitllets concrets. Quan paga, l'app tria
// els bitllets i, si no té l'import just, la banca li fa el canvi automàticament.

export const DENOMINATIONS = [500, 100, 50, 20, 10, 5, 1] as const;
export type Denomination = (typeof DENOMINATIONS)[number];
export type Wallet = Record<Denomination, number>;

export const emptyWallet = (): Wallet => ({ 500: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 1: 0 });

/** Repartiment inicial clàssic de 1.500: 2×500, 2×100, 2×50, 6×20, 5×10, 5×5, 5×1. */
export const startingWallet = (): Wallet => ({ 500: 2, 100: 2, 50: 2, 20: 6, 10: 5, 5: 5, 1: 5 });

export function walletTotal(wallet: Wallet): number {
  return DENOMINATIONS.reduce((sum, d) => sum + d * wallet[d], 0);
}

export function addWallets(a: Wallet, b: Wallet): Wallet {
  const out = emptyWallet();
  for (const d of DENOMINATIONS) out[d] = a[d] + b[d];
  return out;
}

/** El que dona la banca: el mínim de bitllets per a l'import. */
export function bankBills(amount: number): Wallet {
  assertAmount(amount);
  const out = emptyWallet();
  let rest = amount;
  for (const d of DENOMINATIONS) {
    out[d] = Math.floor(rest / d);
    rest -= out[d] * d;
  }
  return out;
}

/**
 * Busca bitllets de la cartera que sumin exactament `amount`, fent servir primer els
 * més grans. Retorna null si no hi ha cap combinació exacta.
 */
function exactBills(wallet: Wallet, amount: number): Wallet | null {
  // best[s] = combinació amb menys bitllets que suma s, construïda denominació a denominació.
  let best: (Wallet | null)[] = Array.from({ length: amount + 1 }, () => null);
  best[0] = emptyWallet();
  for (const d of DENOMINATIONS) {
    const next = best.slice();
    for (let s = 0; s <= amount; s++) {
      const base = best[s];
      if (!base) continue;
      for (let k = 1; k <= wallet[d] && s + k * d <= amount; k++) {
        const target = s + k * d;
        const candidate = { ...base, [d]: k } as Wallet;
        const current = next[target];
        if (!current || billCount(candidate) < billCount(current)) next[target] = candidate;
      }
    }
    best = next;
  }
  return best[amount] ?? null;
}

function billCount(wallet: Wallet): number {
  return DENOMINATIONS.reduce((n, d) => n + wallet[d], 0);
}

/** La banca canvia un bitllet per bitllets de les denominacions immediatament inferiors. */
function breakBill(wallet: Wallet, bill: Denomination): Wallet {
  const smaller = DENOMINATIONS.filter((d) => d < bill);
  const change = emptyWallet();
  let rest: number = bill;
  // Primer intentem donar-lo en bitllets de la denominació següent (un 100 → 2×50), que és com ho fa un banquer.
  for (const d of smaller) {
    change[d] = Math.floor(rest / d);
    rest -= change[d] * d;
  }
  return addWallets({ ...wallet, [bill]: wallet[bill] - 1 }, change);
}

export interface PaymentPlan {
  /** Cartera del pagador després de pagar (incloent-hi el canvi de la banca). */
  remaining: Wallet;
  /** Bitllets que surten de la cartera i arriben a qui cobra. Sumen exactament l'import. */
  given: Wallet;
  /** Bitllets que la banca ha hagut de trencar per poder pagar l'import just. */
  broken: Denomination[];
}

/** Decideix amb quins bitllets es paga `amount`, demanant canvi a la banca si cal. */
export function planPayment(wallet: Wallet, amount: number): PaymentPlan {
  assertAmount(amount);
  if (walletTotal(wallet) < amount) {
    throw new InsufficientFundsError(amount, walletTotal(wallet));
  }
  let current = { ...wallet };
  const broken: Denomination[] = [];
  for (;;) {
    const given = exactBills(current, amount);
    if (given) {
      const remaining = emptyWallet();
      for (const d of DENOMINATIONS) remaining[d] = current[d] - given[d];
      return { remaining, given, broken };
    }
    // Sense import just: trenquem el bitllet més petit que cobreixi l'import, o si no n'hi ha cap,
    // el bitllet més petit que es pugui trencar. Sempre acaba perquè el total no canvia i
    // els bitllets es fan cada cop més petits.
    const owned = DENOMINATIONS.filter((d) => current[d] > 0 && d > 1);
    const covering = owned.filter((d) => d >= amount);
    const toBreak = covering.length ? covering[covering.length - 1] : owned[owned.length - 1];
    if (toBreak === undefined) throw new Error('No es pot fer el canvi');
    current = breakBill(current, toBreak);
    broken.push(toBreak);
  }
}

export class InsufficientFundsError extends Error {
  constructor(
    readonly needed: number,
    readonly available: number,
  ) {
    super(`Calen ${needed} i només n'hi ha ${available}`);
    this.name = 'InsufficientFundsError';
  }
}

function assertAmount(amount: number) {
  if (!Number.isInteger(amount) || amount < 0) throw new Error(`Import no vàlid: ${amount}`);
}
