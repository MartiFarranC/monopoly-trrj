import { describe, expect, it } from 'vitest';
import { applyAction, balanceOf, createGame, type Action, type GameState } from './game';
import { RuleError } from './rules';

const MARRO_1 = 1;
const MARRO_2 = 3;
const ESTACIO_1 = 5;

function startedGame(): GameState {
  let s = createGame('marti', ['anna', 'pere']);
  s = applyAction(s, 'anna', { type: 'join' });
  s = applyAction(s, 'pere', { type: 'join' });
  return applyAction(s, 'marti', { type: 'set-turn-order', order: ['anna', 'marti', 'pere'] });
}

function run(s: GameState, steps: [string, Action][]): GameState {
  return steps.reduce((acc, [actor, action]) => applyAction(acc, actor, action), s);
}

describe('sala d’espera', () => {
  it('respecta el límit de 2 a 8 jugadors', () => {
    expect(() => createGame('marti', [])).toThrow(RuleError);
    expect(() => createGame('marti', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])).toThrow(RuleError);
  });

  it('no comença fins que tothom s’ha unit', () => {
    const s = createGame('marti', ['anna']);
    expect(() => applyAction(s, 'marti', { type: 'set-turn-order', order: ['marti', 'anna'] })).toThrow(/unit tothom/);
  });

  it('dona 1.500 a cada jugador en començar', () => {
    const s = startedGame();
    expect(s.status).toBe('playing');
    expect(s.turnOrder).toEqual(['anna', 'marti', 'pere']);
    expect(balanceOf(s, 'pere')).toBe(1500);
  });
});

describe('peticions al màster', () => {
  it('la compra queda pendent fins que el màster l’accepta', () => {
    let s = applyAction(startedGame(), 'anna', { type: 'request', kind: 'buy', square: MARRO_1 });
    expect(s.deeds[MARRO_1]).toBeUndefined();
    const id = s.requests[0]!.id;
    expect(() => applyAction(s, 'anna', { type: 'resolve-request', requestId: id, approve: true })).toThrow(/màster/);
    s = applyAction(s, 'marti', { type: 'resolve-request', requestId: id, approve: true });
    expect(s.deeds[MARRO_1]?.owner).toBe('anna');
    expect(balanceOf(s, 'anna')).toBe(1440);
  });

  it('si el màster la rebutja no es mou cap diner', () => {
    let s = applyAction(startedGame(), 'anna', { type: 'request', kind: 'buy', square: MARRO_1 });
    s = applyAction(s, 'marti', { type: 'resolve-request', requestId: s.requests[0]!.id, approve: false });
    expect(s.deeds[MARRO_1]).toBeUndefined();
    expect(balanceOf(s, 'anna')).toBe(1500);
  });

  it('les peticions del màster s’apliquen soles', () => {
    const s = applyAction(startedGame(), 'marti', { type: 'request', kind: 'buy', square: ESTACIO_1 });
    expect(s.deeds[ESTACIO_1]?.owner).toBe('marti');
    expect(s.requests[0]!.status).toBe('approved');
  });

  it('construeix de manera uniforme dins del grup', () => {
    let s = run(startedGame(), [
      ['marti', { type: 'request', kind: 'buy', square: MARRO_1 }],
      ['marti', { type: 'request', kind: 'buy', square: MARRO_2 }],
      ['marti', { type: 'request', kind: 'build', square: MARRO_1 }],
    ]);
    expect(s.deeds[MARRO_1]?.buildings).toBe(1);
    expect(() => applyAction(s, 'marti', { type: 'request', kind: 'build', square: MARRO_1 })).toThrow(/uniforme/);
    s = applyAction(s, 'marti', { type: 'request', kind: 'build', square: MARRO_2 });
    expect(s.deeds[MARRO_2]?.buildings).toBe(1);
  });
});

describe('sol·licitar paga', () => {
  it('el propietari demana el lloguer i el deutor paga', () => {
    let s = run(startedGame(), [
      ['marti', { type: 'request', kind: 'buy', square: MARRO_1 }],
      ['marti', { type: 'request', kind: 'buy', square: MARRO_2 }],
      ['marti', { type: 'request-payment', debtor: 'pere', square: MARRO_1 }],
    ]);
    const req = s.paymentRequests[0]!;
    expect(req.amount).toBe(4); // grup complet sense cases: lloguer doble
    expect(() => applyAction(s, 'anna', { type: 'pay-request', requestId: req.id })).toThrow(/no és per a tu/);
    s = applyAction(s, 'pere', { type: 'pay-request', requestId: req.id });
    expect(balanceOf(s, 'pere')).toBe(1496);
    expect(balanceOf(s, 'marti')).toBe(1500 - 120 + 4);
    expect(s.transactions.at(-1)).toMatchObject({ from: 'pere', to: 'marti', amount: 4 });
  });

  it('no es pot demanar paga per una propietat d’un altre', () => {
    const s = applyAction(startedGame(), 'marti', { type: 'request', kind: 'buy', square: MARRO_1 });
    expect(() => applyAction(s, 'anna', { type: 'request-payment', debtor: 'pere', square: MARRO_1 })).toThrow(RuleError);
  });
});

describe('subhastes', () => {
  it('guanya la puja més alta i paga a la banca', () => {
    const s = run(startedGame(), [
      ['anna', { type: 'start-auction', square: ESTACIO_1 }],
      ['anna', { type: 'bid', amount: 50 }],
      ['pere', { type: 'bid', amount: 120 }],
      ['marti', { type: 'close-auction' }],
    ]);
    expect(s.deeds[ESTACIO_1]?.owner).toBe('pere');
    expect(balanceOf(s, 'pere')).toBe(1380);
    expect(s.auction).toBeNull();
  });

  it('cal pujar més que la puja anterior', () => {
    const s = run(startedGame(), [
      ['anna', { type: 'start-auction', square: ESTACIO_1 }],
      ['anna', { type: 'bid', amount: 50 }],
    ]);
    expect(() => applyAction(s, 'pere', { type: 'bid', amount: 50 })).toThrow(/més de 50/);
  });
});

describe('diners', () => {
  it('cobra 200 en passar per la Sortida i paga impostos a la banca', () => {
    const s = run(startedGame(), [
      ['anna', { type: 'pass-go' }],
      ['anna', { type: 'pay', to: 'bank', amount: 200, reason: 'Impost sobre la renda' }],
    ]);
    expect(balanceOf(s, 'anna')).toBe(1500);
    expect(s.transactions).toHaveLength(2);
  });

  it('sense canvi, qui paga canvia a la banca i qui cobra rep l\u2019import just', () => {
    let s = startedGame();
    // L'Anna només té un bitllet de 500.
    s = { ...s, wallets: { ...s.wallets, anna: { 500: 1, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 1: 0 } } };
    const before = s.wallets.pere!;
    s = applyAction(s, 'anna', { type: 'pay', to: 'pere', amount: 5, reason: 'Lloguer' });
    const tx = s.transactions.at(-1)!;
    expect(tx.exchange?.toBank).toMatchObject({ 500: 1 });
    expect(tx.bills).toMatchObject({ 5: 1 });
    expect(s.wallets.pere).toEqual({ ...before, 5: before[5] + 1 });
    expect(balanceOf(s, 'anna')).toBe(495);
  });

  it('no es pot pagar més del que es té', () => {
    expect(() => applyAction(startedGame(), 'anna', { type: 'pay', to: 'pere', amount: 2000, reason: 'Bizum' })).toThrow(/prou diners/);
  });
});
