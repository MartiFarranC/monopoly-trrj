// Bitllets: cada jugador i la banca tenen bitllets concrets i comptats, com al Monopoly de
// cartró. Qui paga de més rep el canvi de qui cobra (o de la banca, si qui cobra no en té).

export const DENOMINATIONS = [500, 100, 50, 20, 10, 5, 1] as const;
export type Denomination = (typeof DENOMINATIONS)[number];
export type Wallet = Record<Denomination, number>;

export const emptyWallet = (): Wallet => ({ 500: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 1: 0 });

/** Bitllets de la caixa del Monopoly clàssic: 30 de cada (20.580 en total). */
export const bankStartingWallet = (): Wallet => ({ 500: 30, 100: 30, 50: 30, 20: 30, 10: 30, 5: 30, 1: 30 });

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

/** Completa una selecció parcial de bitllets (p. ex. { 100: 2 }) amb zeros. */
export function toWallet(partial: Partial<Wallet>): Wallet {
  const out = emptyWallet();
  for (const d of DENOMINATIONS) {
    const n = partial[d] ?? 0;
    if (!Number.isInteger(n) || n < 0) throw new Error(`Quantitat de bitllets no vàlida: ${n}`);
    out[d] = n;
  }
  return out;
}

/** Comprova que la cartera conté tots els bitllets de `selection`. */
export function hasBills(wallet: Wallet, selection: Wallet): boolean {
  return DENOMINATIONS.every((d) => wallet[d] >= selection[d]);
}

export function subtractWallets(a: Wallet, b: Wallet): Wallet {
  if (!hasBills(a, b)) throw new Error('No tens aquests bitllets');
  const out = emptyWallet();
  for (const d of DENOMINATIONS) out[d] = a[d] - b[d];
  return out;
}

function billCount(wallet: Wallet): number {
  return DENOMINATIONS.reduce((n, d) => n + wallet[d], 0);
}

/**
 * Busca bitllets de la cartera que sumin exactament `amount`, amb el mínim de bitllets.
 * Retorna null si no hi ha cap combinació exacta.
 */
export function exactBills(wallet: Wallet, amount: number): Wallet | null {
  assertAmount(amount);
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

/** La banca paga `amount` amb els bitllets que té. */
export function payFromBank(bank: Wallet, amount: number): { bank: Wallet; given: Wallet } {
  const given = exactBills(bank, amount);
  if (!given) throw new BankShortError(amount);
  return { bank: subtractWallets(bank, given), given };
}

/**
 * Reparteix els diners inicials amb els bitllets de la banca, igual per a tothom. Si d'algun
 * bitllet petit no n'hi ha prou per a tothom (p. ex. 6 bitllets de 20 per a 8 jugadors), se'n
 * donen menys i la diferència va en bitllets més grans.
 */
export function dealStartingMoney(bank: Wallet, players: number): { bank: Wallet; wallets: Wallet[] } {
  const wanted = startingWallet();
  const wallet = emptyWallet();
  const share = (d: Denomination) => Math.floor(bank[d] / players);
  let rest = walletTotal(wanted);
  // Dels bitllets petits als grans. Després de cada denominació, el que queda s'ha de poder
  // pagar amb les següents: múltiple de 5 després de l'1, de 10 després del 5 i del 10,
  // de 50 després del 20 i de 100 després del 50.
  const steps: [Denomination, number][] = [
    [1, 5],
    [5, 10],
    [10, 10],
    [20, 50],
    [50, 100],
  ];
  for (const [d, modulus] of steps) {
    let k = Math.min(wanted[d], share(d));
    while (k >= 0 && (rest - k * d) % modulus !== 0) k--;
    if (k < 0) throw new BankShortError(rest);
    wallet[d] = k;
    rest -= k * d;
  }
  wallet[500] = Math.min(share(500), Math.floor(rest / 500));
  rest -= wallet[500] * 500;
  wallet[100] = rest / 100;
  if (wallet[100] > share(100)) throw new BankShortError(rest);

  let current = bank;
  const wallets: Wallet[] = [];
  for (let i = 0; i < players; i++) {
    current = subtractWallets(current, wallet);
    wallets.push({ ...wallet });
  }
  return { bank: current, wallets };
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

export class BankShortError extends Error {
  constructor(readonly amount: number) {
    super(`La banca no té bitllets per fer aquest pagament de ${amount}`);
    this.name = 'BankShortError';
  }
}

function assertAmount(amount: number) {
  if (!Number.isInteger(amount) || amount < 0) throw new Error(`Import no vàlid: ${amount}`);
}
