import { describe, expect, it } from 'vitest';
import { applyAction, balanceOf, createGame, type Action, type GameState } from './game';
import { RuleError } from './rules';

const MARRO_1 = 1; // La Font, 60
const MARRO_2 = 3; // Safareig, 60
const ESTACIO_1 = 5; // Plaça Vella, 200
const ESGLESIA = 39; // 400

// Cada jugador comença amb 2×500, 2×100, 2×50, 6×20, 5×10, 5×5 i 5×1.
function startedGame(): GameState {
  let s = createGame('marti', ['anna', 'pere']);
  s = applyAction(s, 'anna', { type: 'join' });
  s = applyAction(s, 'pere', { type: 'join' });
  return applyAction(s, 'marti', { type: 'set-turn-order', order: ['anna', 'marti', 'pere'] });
}

function run(s: GameState, steps: [string, Action][]): GameState {
  return steps.reduce((acc, [actor, action]) => applyAction(acc, actor, action), s);
}

function moneyInGame(s: GameState): number {
  const players = s.turnOrder.reduce((n, p) => n + balanceOf(s, p), 0);
  const bank = Object.entries(s.bank).reduce((n, [d, c]) => n + Number(d) * c, 0);
  return players + bank;
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
    let s = applyAction(startedGame(), 'anna', { type: 'request', kind: 'buy', square: MARRO_1, bills: { 50: 1, 10: 1 } });
    expect(s.deeds[MARRO_1]).toBeUndefined();
    const id = s.requests[0]!.id;
    expect(() => applyAction(s, 'anna', { type: 'resolve-request', requestId: id, approve: true })).toThrow(/màster/);
    s = applyAction(s, 'marti', { type: 'resolve-request', requestId: id, approve: true });
    expect(s.deeds[MARRO_1]?.owner).toBe('anna');
    expect(balanceOf(s, 'anna')).toBe(1440);
  });

  it('per demanar una compra cal triar els bitllets', () => {
    expect(() => applyAction(startedGame(), 'anna', { type: 'request', kind: 'buy', square: MARRO_1 })).toThrow(/bitllets/);
  });

  it('si el màster la rebutja no es mou cap diner', () => {
    let s = applyAction(startedGame(), 'anna', { type: 'request', kind: 'buy', square: MARRO_1, bills: { 50: 1, 10: 1 } });
    s = applyAction(s, 'marti', { type: 'resolve-request', requestId: s.requests[0]!.id, approve: false });
    expect(s.deeds[MARRO_1]).toBeUndefined();
    expect(balanceOf(s, 'anna')).toBe(1500);
  });

  it('les peticions del màster s’apliquen soles', () => {
    const s = applyAction(startedGame(), 'marti', { type: 'request', kind: 'buy', square: ESTACIO_1, bills: { 100: 2 } });
    expect(s.deeds[ESTACIO_1]?.owner).toBe('marti');
    expect(s.requests[0]!.status).toBe('approved');
  });

  it('construeix de manera uniforme dins del grup', () => {
    let s = run(startedGame(), [
      ['marti', { type: 'request', kind: 'buy', square: MARRO_1, bills: { 50: 1, 10: 1 } }],
      ['marti', { type: 'request', kind: 'buy', square: MARRO_2, bills: { 50: 1, 10: 1 } }],
      ['marti', { type: 'request', kind: 'build', square: MARRO_1, bills: { 20: 2, 10: 1 } }],
    ]);
    expect(s.deeds[MARRO_1]?.buildings).toBe(1);
    expect(() =>
      applyAction(s, 'marti', { type: 'request', kind: 'build', square: MARRO_1, bills: { 20: 2, 10: 1 } }),
    ).toThrow(/uniforme/);
    s = applyAction(s, 'marti', { type: 'request', kind: 'build', square: MARRO_2, bills: { 20: 2, 10: 1 } });
    expect(s.deeds[MARRO_2]?.buildings).toBe(1);
  });
});

describe('sol·licitar paga', () => {
  it('el propietari demana el lloguer i el deutor paga just', () => {
    let s = run(startedGame(), [
      ['marti', { type: 'request', kind: 'buy', square: MARRO_1, bills: { 50: 1, 10: 1 } }],
      ['marti', { type: 'request', kind: 'buy', square: MARRO_2, bills: { 50: 1, 10: 1 } }],
      ['marti', { type: 'request-payment', debtor: 'pere', square: MARRO_1 }],
    ]);
    const req = s.paymentRequests[0]!;
    expect(req.amount).toBe(4); // grup complet sense cases: lloguer doble
    expect(() => applyAction(s, 'anna', { type: 'pay-request', requestId: req.id, bills: { 1: 4 } })).toThrow(/no és per a tu/);
    expect(() => applyAction(s, 'pere', { type: 'pay-request', requestId: req.id, bills: { 5: 1 } })).toThrow(/just/);
    s = applyAction(s, 'pere', { type: 'pay-request', requestId: req.id, bills: { 1: 4 } });
    expect(balanceOf(s, 'pere')).toBe(1496);
    expect(balanceOf(s, 'marti')).toBe(1500 - 120 + 4);
    expect(s.transactions.at(-1)).toMatchObject({ from: 'pere', to: 'marti', amount: 4 });
  });

  it('no es pot demanar paga per una propietat d’un altre', () => {
    const s = applyAction(startedGame(), 'marti', { type: 'request', kind: 'buy', square: MARRO_1, bills: { 50: 1, 10: 1 } });
    expect(() => applyAction(s, 'anna', { type: 'request-payment', debtor: 'pere', square: MARRO_1 })).toThrow(RuleError);
  });
});

describe('subhastes', () => {
  it('el guanyador paga just a la banca i es queda la propietat', () => {
    let s = run(startedGame(), [
      ['anna', { type: 'start-auction', square: ESTACIO_1 }],
      ['anna', { type: 'bid', amount: 50 }],
      ['pere', { type: 'bid', amount: 120 }],
      ['marti', { type: 'close-auction' }],
    ]);
    expect(s.auction).toBeNull();
    const req = s.paymentRequests.at(-1)!;
    expect(req).toMatchObject({ creditor: 'bank', debtor: 'pere', amount: 120, auction: true });
    s = applyAction(s, 'pere', { type: 'pay-request', requestId: req.id, bills: { 100: 1, 20: 1 } });
    expect(s.deeds[ESTACIO_1]?.owner).toBe('pere');
    expect(balanceOf(s, 'pere')).toBe(1380);
  });

  it('cal pujar més que la puja anterior', () => {
    const s = run(startedGame(), [
      ['anna', { type: 'start-auction', square: ESTACIO_1 }],
      ['anna', { type: 'bid', amount: 50 }],
    ]);
    expect(() => applyAction(s, 'pere', { type: 'bid', amount: 50 })).toThrow(/més de 50/);
  });
});

describe('pagar només just', () => {
  it('cobra 200 en passar per la Sortida i paga impostos a la banca', () => {
    const s = run(startedGame(), [
      ['anna', { type: 'pass-go' }],
      ['anna', { type: 'pay', to: 'bank', amount: 200, reason: 'Impost', bills: { 100: 2 } }],
    ]);
    expect(balanceOf(s, 'anna')).toBe(1500);
    expect(s.transactions).toHaveLength(2);
  });

  it('no deixa pagar de més ni esperar canvi', () => {
    expect(() =>
      applyAction(startedGame(), 'anna', { type: 'pay', to: 'pere', amount: 230, reason: 'x', bills: { 100: 2, 50: 1 } }),
    ).toThrow(/just/);
  });

  it('no es pot pagar amb bitllets que no tens', () => {
    expect(() =>
      applyAction(startedGame(), 'anna', { type: 'pay', to: 'pere', amount: 1500, reason: 'x', bills: { 500: 3 } }),
    ).toThrow(/aquests bitllets/);
  });
});

describe('canvis de bitllets', () => {
  it('a la banca, a bitllets més petits', () => {
    let s = startedGame();
    s = { ...s, wallets: { ...s.wallets, anna: { 500: 0, 100: 3, 50: 0, 20: 0, 10: 0, 5: 0, 1: 0 } } };
    s = applyAction(s, 'anna', { type: 'exchange-bills', give: { 100: 1 }, receive: { 50: 2 } });
    s = applyAction(s, 'anna', { type: 'pay', to: 'pere', amount: 250, reason: 'Lloguer', bills: { 100: 2, 50: 1 } });
    expect(s.wallets.anna).toMatchObject({ 100: 0, 50: 1 });
  });

  it('a la banca, a bitllets més grans', () => {
    let s = startedGame();
    s = { ...s, wallets: { ...s.wallets, anna: { 500: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 1: 10 } } };
    s = applyAction(s, 'anna', { type: 'exchange-bills', give: { 1: 10 }, receive: { 10: 1 } });
    expect(s.wallets.anna).toMatchObject({ 1: 0, 10: 1 });
  });

  it('ha de sumar el mateix i la banca ha de tenir els bitllets', () => {
    const s = startedGame();
    expect(() => applyAction(s, 'anna', { type: 'exchange-bills', give: { 100: 1 }, receive: { 50: 1 } })).toThrow(/mateix/);
    const noFifties = { ...s, bank: { ...s.bank, 50: 0 } };
    expect(() =>
      applyAction(noFifties, 'anna', { type: 'exchange-bills', give: { 100: 1 }, receive: { 50: 2 } }),
    ).toThrow(/banca no té/);
  });

  it('amb un altre jugador, que l’ha d’acceptar', () => {
    let s = applyAction(startedGame(), 'anna', { type: 'propose-exchange', to: 'pere', give: { 100: 1 }, receive: { 20: 5 } });
    const offer = s.exchangeOffers[0]!;
    expect(() => applyAction(s, 'marti', { type: 'respond-exchange', offerId: offer.id, accept: true })).toThrow(/no és per a tu/);
    s = applyAction(s, 'pere', { type: 'respond-exchange', offerId: offer.id, accept: true });
    expect(s.wallets.anna).toMatchObject({ 100: 1, 20: 11 });
    expect(s.wallets.pere).toMatchObject({ 100: 3, 20: 1 });
    expect(s.exchangeOffers[0]!.status).toBe('accepted');
  });

  it('si l’altre jugador no té els bitllets, no es fa', () => {
    const s = applyAction(startedGame(), 'anna', { type: 'propose-exchange', to: 'pere', give: { 500: 1 }, receive: { 100: 5 } });
    expect(() => applyAction(s, 'pere', { type: 'respond-exchange', offerId: s.exchangeOffers[0]!.id, accept: true })).toThrow(
      /altre jugador no té/,
    );
  });
});

describe('bitllets comptats de la banca', () => {
  it('els diners totals de la partida no canvien', () => {
    const s = run(startedGame(), [
      ['anna', { type: 'pass-go' }],
      ['anna', { type: 'pay', to: 'pere', amount: 37, reason: 'x', bills: { 20: 1, 10: 1, 5: 1, 1: 2 } }],
      ['marti', { type: 'request', kind: 'buy', square: ESGLESIA, bills: { 100: 2, 50: 2, 20: 5 } }],
      ['pere', { type: 'exchange-bills', give: { 500: 1 }, receive: { 100: 5 } }],
    ]);
    expect(moneyInGame(s)).toBe(20580);
  });
});

describe('xat i final', () => {
  it('els jugadors escriuen al xat i el màster acaba la partida', () => {
    let s = applyAction(startedGame(), 'anna', { type: 'chat', text: '  Paga!  ' });
    expect(s.chat.at(-1)).toMatchObject({ author: 'anna', text: 'Paga!' });
    expect(() => applyAction(s, 'anna', { type: 'end-game' })).toThrow(/màster/);
    s = applyAction(s, 'marti', { type: 'end-game' });
    expect(s.status).toBe('finished');
  });
});
