import { describe, expect, it } from 'vitest';
import {
  BankShortError,
  InsufficientFundsError,
  bankStartingWallet,
  dealStartingMoney,
  emptyWallet,
  payFromBank,
  settlePayment,
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

  it("paga amb l'import just si pot", () => {
    const s = settlePayment(startingWallet(), bank(), 120, false);
    expect(walletTotal(s.given)).toBe(120);
    expect(s.exchange).toBeNull();
    expect(walletTotal(s.payer)).toBe(1380);
  });

  it('sense l’import just, canvia a la banca i qui cobra rep el just', () => {
    const s = settlePayment({ ...emptyWallet(), 500: 1 }, bank(), 30, false);
    expect(walletTotal(s.given)).toBe(30);
    expect(walletTotal(s.payer)).toBe(470);
    expect(s.exchange?.toBank).toMatchObject({ 500: 1 });
    // La banca guanya el 500 i perd 500 en bitllets petits.
    expect(walletTotal(s.bank)).toBe(walletTotal(bank()));
  });

  it('si la banca no té canvi, no es pot pagar automàticament', () => {
    expect(() => settlePayment({ ...emptyWallet(), 500: 1 }, emptyWallet(), 30, false)).toThrow(BankShortError);
  });

  it('pagant a la banca, la banca torna el canvi i es queda l’import', () => {
    const s = settlePayment({ ...emptyWallet(), 100: 1 }, bank(), 60, true);
    expect(walletTotal(s.payer)).toBe(40);
    expect(walletTotal(s.bank)).toBe(walletTotal(bank()) + 60);
  });

  it('no deixa pagar més del que es té', () => {
    expect(() => settlePayment({ ...emptyWallet(), 10: 1 }, bank(), 20, false)).toThrow(InsufficientFundsError);
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
