import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addMoney,
  allocateMoney,
  applyBasisPoints,
  compareMoney,
  CurrencyMismatchError,
  divRound,
  fromMajorUnits,
  isMoney,
  money,
  multiplyMoney,
  negateMoney,
  subtractMoney,
  toMajorString,
  zeroMoney,
} from '../src/money.js';

const minorArb = fc.bigInt({ min: -(10n ** 12n), max: 10n ** 12n });

describe('money arithmetic', () => {
  it('never uses floats and rejects mismatched currencies', () => {
    expect(addMoney(money(100n, 'USD'), money(250n, 'USD'))).toEqual({
      amountMinor: 350n,
      currency: 'USD',
    });
    expect(() => addMoney(money(1n, 'USD'), money(1n, 'EUR'))).toThrow(CurrencyMismatchError);
  });

  it('supports zero-decimal currencies', () => {
    expect(fromMajorUnits('1500', 'JPY')).toEqual({ amountMinor: 1500n, currency: 'JPY' });
    expect(toMajorString(money(1500n, 'JPY'))).toBe('1500');
  });

  it('parses and formats major units without rounding', () => {
    expect(fromMajorUnits('12.34', 'USD')).toEqual({ amountMinor: 1234n, currency: 'USD' });
    expect(fromMajorUnits('-0.05', 'USD')).toEqual({ amountMinor: -5n, currency: 'USD' });
    expect(toMajorString(money(-1234n, 'USD'))).toBe('-12.34');
    expect(() => fromMajorUnits('12.345', 'USD')).toThrow(/decimal places/);
    expect(() => fromMajorUnits('1e3', 'USD')).toThrow(/invalid monetary amount/);
    expect(() => fromMajorUnits('01.00', 'USD')).toThrow(/invalid monetary amount/);
    expect(() => fromMajorUnits('12.', 'USD')).toThrow(/invalid monetary amount/);
  });

  it('rounds basis points explicitly', () => {
    expect(applyBasisPoints(money(10_000n, 'USD'), 250n)).toEqual({
      amountMinor: 250n,
      currency: 'USD',
    });
    expect(applyBasisPoints(money(1n, 'USD'), 5000n, 'half-up')).toEqual({
      amountMinor: 1n,
      currency: 'USD',
    });
    expect(applyBasisPoints(money(1n, 'USD'), 5000n, 'down')).toEqual({
      amountMinor: 0n,
      currency: 'USD',
    });
    expect(applyBasisPoints(money(-1n, 'USD'), 5000n, 'half-up')).toEqual({
      amountMinor: -1n,
      currency: 'USD',
    });
    expect(applyBasisPoints(money(-1n, 'USD'), 5000n, 'half-even')).toEqual({
      amountMinor: 0n,
      currency: 'USD',
    });
  });

  it('divRound implements documented rounding modes', () => {
    expect(divRound(5n, 2n, 'half-up')).toBe(3n);
    expect(divRound(5n, 2n, 'half-even')).toBe(2n);
    expect(divRound(-5n, 2n, 'half-up')).toBe(-3n);
    expect(divRound(-5n, 2n, 'down')).toBe(-2n);
    expect(divRound(5n, 2n, 'up')).toBe(3n);
    expect(() => divRound(1n, 0n)).toThrow(RangeError);
    expect(() => divRound(1n, -2n)).toThrow(RangeError);
  });

  it('isMoney narrows correctly', () => {
    expect(isMoney(money(1n, 'USD'))).toBe(true);
    expect(isMoney({ amountMinor: 1, currency: 'USD' })).toBe(false);
    expect(isMoney({ amountMinor: 1n, currency: 'XXX' })).toBe(false);
  });
});

describe('money properties (fast-check)', () => {
  it('addition is commutative and associative', () => {
    fc.assert(
      fc.property(minorArb, minorArb, minorArb, (a, b, c) => {
        const ma = money(a, 'USD');
        const mb = money(b, 'USD');
        const mc = money(c, 'USD');
        expect(addMoney(ma, mb)).toEqual(addMoney(mb, ma));
        expect(addMoney(addMoney(ma, mb), mc)).toEqual(addMoney(ma, addMoney(mb, mc)));
      }),
    );
  });

  it('subtracting an amount is the additive inverse', () => {
    fc.assert(
      fc.property(minorArb, minorArb, (a, b) => {
        const result = subtractMoney(money(a, 'USD'), money(b, 'USD'));
        expect(result.amountMinor).toBe(a - b);
        expect(negateMoney(money(a, 'USD')).amountMinor).toBe(-a);
      }),
    );
  });

  it('allocation never loses or invents minor units', () => {
    fc.assert(
      fc.property(
        minorArb,
        fc.array(fc.bigInt({ min: 0n, max: 10n ** 6n }), { minLength: 1, maxLength: 25 }),
        (amount, weights) => {
          fc.pre(weights.reduce((acc, w) => acc + w, 0n) > 0n);
          const parts = allocateMoney(money(amount, 'USD'), weights);
          expect(parts).toHaveLength(weights.length);
          expect(parts.reduce((acc, p) => acc + p.amountMinor, 0n)).toBe(amount);
          for (const part of parts) {
            expect(part.currency).toBe('USD');
            expect(amount >= 0n ? part.amountMinor >= 0n : part.amountMinor <= 0n).toBe(true);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('multiplication is exact for integers', () => {
    fc.assert(
      fc.property(minorArb, fc.bigInt({ min: -1000n, max: 1000n }), (amount, factor) => {
        expect(multiplyMoney(money(amount, 'EUR'), factor).amountMinor).toBe(amount * factor);
      }),
    );
  });

  it('comparison is a total order consistent with subtraction', () => {
    fc.assert(
      fc.property(minorArb, minorArb, (a, b) => {
        const cmp = compareMoney(money(a, 'EUR'), money(b, 'EUR'));
        const expected = a < b ? -1 : a > b ? 1 : 0;
        expect(cmp).toBe(expected);
      }),
    );
  });

  it('10000 basis points is the identity', () => {
    fc.assert(
      fc.property(minorArb, (amount) => {
        expect(applyBasisPoints(money(amount, 'GBP'), 10_000n).amountMinor).toBe(amount);
        expect(applyBasisPoints(money(amount, 'GBP'), 0n).amountMinor).toBe(0n);
      }),
    );
  });

  it('zero money behaves as identity', () => {
    fc.assert(
      fc.property(minorArb, (amount) => {
        const m = money(amount, 'CHF');
        expect(addMoney(m, zeroMoney('CHF'))).toEqual(m);
      }),
    );
  });
});
