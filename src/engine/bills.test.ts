import { describe, expect, it } from 'vitest';
import {
  BankShortError,
  bankStartingWallet,
  dealStartingMoney,
  emptyWallet,
  payFromBank,
  startingWallet,
  walletTotal,
} from './bills';

const bank = bankStartingWallet;

describe('bitllets', () => {
  it('la cartera inicial suma 1.500 i la banca en té 30 de cada', () => {
    expect(walletTotal(startingWallet())).toBe(1500);
    expect(walletTotal(bank())).toBe(20580);
  });

  it('la banca paga amb els mínims bitllets que té', () => {
    expect(payFromBank(bank(), 286).given).toMatchObject({ 500: 0, 100: 2, 50: 1, 20: 1, 10: 1, 5: 1, 1: 1 });
  });

  it('la banca no pot pagar amb bitllets que no té', () => {
    expect(() => payFromBank({ ...emptyWallet(), 500: 1 }, 200)).toThrow(BankShortError);
  });

  it('reparteix 1.500 a 8 jugadors encara que no hi hagi prou bitllets de 20', () => {
    const dealt = dealStartingMoney(bank(), 8);
    expect(dealt.wallets.every((w) => walletTotal(w) === 1500)).toBe(true);
    expect(walletTotal(dealt.bank)).toBe(20580 - 8 * 1500);
    expect(dealt.wallets[0]![20]).toBe(3);
  });

  it('amb pocs jugadors reparteix com el joc original', () => {
    expect(dealStartingMoney(bank(), 4).wallets[0]).toEqual(startingWallet());
  });
});
