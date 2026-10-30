import { describe, expect, it } from 'vitest';
import { InsufficientFundsError, bankBills, emptyWallet, planPayment, startingWallet, walletTotal } from './bills';

describe('bitllets', () => {
  it('la cartera inicial suma 1.500', () => {
    expect(walletTotal(startingWallet())).toBe(1500);
  });

  it('la banca paga amb els mínims bitllets', () => {
    expect(bankBills(286)).toMatchObject({ 500: 0, 100: 2, 50: 1, 20: 1, 10: 1, 5: 1, 1: 1 });
  });

  it("paga amb l'import just si pot", () => {
    const plan = planPayment(startingWallet(), 120);
    expect(walletTotal(plan.given)).toBe(120);
    expect(plan.broken).toEqual([]);
    expect(walletTotal(plan.remaining)).toBe(1380);
  });

  it('demana canvi a la banca quan no té l’import just', () => {
    const wallet = { ...emptyWallet(), 500: 1 };
    const plan = planPayment(wallet, 30);
    expect(walletTotal(plan.given)).toBe(30);
    expect(walletTotal(plan.remaining)).toBe(470);
    expect(plan.broken.length).toBeGreaterThan(0);
    expect(plan.exchange?.toBank).toMatchObject({ 500: 1 });
    expect(walletTotal(plan.exchange!.fromBank)).toBe(500);
  });

  it('sense canvi no hi ha intercanvi amb la banca', () => {
    expect(planPayment(startingWallet(), 120).exchange).toBeNull();
  });

  it('trenca bitllets petits si cap no cobreix l’import', () => {
    const wallet = { ...emptyWallet(), 20: 2 };
    const plan = planPayment(wallet, 30);
    expect(walletTotal(plan.given)).toBe(30);
    expect(walletTotal(plan.remaining)).toBe(10);
  });

  it('no deixa pagar més del que es té', () => {
    expect(() => planPayment({ ...emptyWallet(), 10: 1 }, 20)).toThrow(InsufficientFundsError);
  });
});
