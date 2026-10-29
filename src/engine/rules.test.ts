import { describe, expect, it } from 'vitest';
import { assertCanMortgage, bankStock, rentFor, type Deeds } from './rules';

const own = (owner: string, buildings = 0, mortgaged = false) => ({ owner, buildings, mortgaged });

describe('lloguers', () => {
  it('un carrer sol cobra el lloguer base', () => {
    expect(rentFor({ 39: own('a') }, 39)).toBe(50);
  });

  it('el grup complet sense cases cobra el doble', () => {
    expect(rentFor({ 37: own('a'), 39: own('a') }, 39)).toBe(100);
  });

  it('amb cases i hotel', () => {
    expect(rentFor({ 37: own('a'), 39: own('a', 3) }, 39)).toBe(1400);
    expect(rentFor({ 37: own('a', 4), 39: own('a', 5) }, 39)).toBe(2000);
  });

  it('estacions segons quantes en té el propietari', () => {
    const deeds: Deeds = { 5: own('a'), 15: own('a'), 25: own('a') };
    expect(rentFor(deeds, 5)).toBe(100);
  });

  it('serveis segons els daus', () => {
    expect(rentFor({ 12: own('a') }, 12, 7)).toBe(28);
    expect(rentFor({ 12: own('a'), 28: own('a') }, 12, 7)).toBe(70);
  });

  it('una propietat hipotecada no cobra', () => {
    expect(rentFor({ 39: own('a', 0, true) }, 39)).toBe(0);
  });
});

describe('construcció i hipoteques', () => {
  it('compta les cases i hotels que queden a la banca', () => {
    expect(bankStock({ 37: own('a', 4), 39: own('a', 5) })).toEqual({ houses: 28, hotels: 11 });
  });

  it('no es pot hipotecar si el grup té cases', () => {
    expect(() => assertCanMortgage({ 37: own('a'), 39: own('a', 1) }, 37, 'a')).toThrow(/vendre les cases/);
  });
});
