import { AppError } from './errors.js';

/**
 * Monetary amounts are represented as integer minor units (e.g. cents) plus an
 * ISO-4217 currency code. Floating-point arithmetic is never used for money.
 * Amounts are bigint to avoid overflow in ledger aggregates and to make
 * rounding semantics explicit.
 */
export const SUPPORTED_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'TRY',
  'JPY',
  'AUD',
  'CAD',
  'CHF',
] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

/** Number of decimal digits between a currency's major and minor unit. */
const MINOR_UNIT_EXPONENT: Record<Currency, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  TRY: 2,
  JPY: 0,
  AUD: 2,
  CAD: 2,
  CHF: 2,
};

export type RoundingMode = 'half-up' | 'half-even' | 'down' | 'up';

export function isCurrency(value: unknown): value is Currency {
  return typeof value === 'string' && (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

export function minorUnitExponent(currency: Currency): number {
  return MINOR_UNIT_EXPONENT[currency];
}

export interface Money {
  readonly amountMinor: bigint;
  readonly currency: Currency;
}

export class CurrencyMismatchError extends AppError {
  constructor(left: Currency, right: Currency) {
    super(
      'currency_mismatch',
      `cannot combine amounts in different currencies (${left} vs ${right})`,
      {
        status: 422,
      },
    );
  }
}

export function money(amountMinor: bigint, currency: Currency): Money {
  return { amountMinor, currency };
}

export function zeroMoney(currency: Currency): Money {
  return money(0n, currency);
}

function requireSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new CurrencyMismatchError(a.currency, b.currency);
  }
}

export function addMoney(a: Money, b: Money): Money {
  requireSameCurrency(a, b);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
  requireSameCurrency(a, b);
  return money(a.amountMinor - b.amountMinor, a.currency);
}

export function negateMoney(m: Money): Money {
  return money(-m.amountMinor, m.currency);
}

export function multiplyMoney(m: Money, multiplier: bigint): Money {
  return money(m.amountMinor * multiplier, m.currency);
}

export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  requireSameCurrency(a, b);
  if (a.amountMinor < b.amountMinor) return -1;
  if (a.amountMinor > b.amountMinor) return 1;
  return 0;
}

export function isZeroMoney(m: Money): boolean {
  return m.amountMinor === 0n;
}

/**
 * Integer division with explicit rounding. Denominator must be positive.
 * - `down`: toward zero
 * - `up`: away from zero
 * - `half-up`: half away from zero
 * - `half-even`: banker's rounding
 */
export function divRound(
  numerator: bigint,
  denominator: bigint,
  mode: RoundingMode = 'half-up',
): bigint {
  if (denominator <= 0n) {
    throw new RangeError('denominator must be positive');
  }
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder === 0n) return quotient;
  const negative = numerator < 0n;
  const absRemainder = negative ? -remainder : remainder;
  switch (mode) {
    case 'down':
      return quotient;
    case 'up':
      return negative ? quotient - 1n : quotient + 1n;
    case 'half-up': {
      const twice = absRemainder * 2n;
      if (twice >= denominator) return negative ? quotient - 1n : quotient + 1n;
      return quotient;
    }
    case 'half-even': {
      const twice = absRemainder * 2n;
      if (twice > denominator) return negative ? quotient - 1n : quotient + 1n;
      if (twice < denominator) return quotient;
      // exactly half: round to even
      if (quotient % 2n === 0n) return quotient;
      return negative ? quotient - 1n : quotient + 1n;
    }
    default: {
      const exhaustive: never = mode;
      throw new RangeError(`unknown rounding mode: ${String(exhaustive)}`);
    }
  }
}

/**
 * Apply a rate expressed in basis points (1 bps = 0.01%).
 * Rounding is applied at the minor-unit boundary.
 */
export function applyBasisPoints(
  m: Money,
  basisPoints: bigint,
  mode: RoundingMode = 'half-up',
): Money {
  return money(divRound(m.amountMinor * basisPoints, 10_000n, mode), m.currency);
}

/**
 * Split an amount proportionally to the given weights without losing or
 * inventing minor units: floor split first, remainder distributed one minor
 * unit at a time to the largest fractional parts (deterministic, ties keep
 * input order). The sum of the parts always equals the input amount.
 */
export function allocateMoney(m: Money, weights: readonly bigint[]): Money[] {
  if (weights.length === 0) throw new RangeError('weights must not be empty');
  const totalWeight = weights.reduce((acc, w) => acc + w, 0n);
  if (totalWeight <= 0n) throw new RangeError('total weight must be positive');
  for (const w of weights) {
    if (w < 0n) throw new RangeError('weights must be non-negative');
  }
  const negative = m.amountMinor < 0n;
  const absAmount = negative ? -m.amountMinor : m.amountMinor;
  const parts = weights.map((w) => (absAmount * w) / totalWeight);
  const remainders = weights.map((w, index) => {
    const exact = absAmount * w;
    return { index, remainder: exact - (parts[index] ?? 0n) * totalWeight };
  });
  let remainderUnits = absAmount - parts.reduce((acc, p) => acc + p, 0n);
  remainders.sort((a, b) => {
    if (a.remainder === b.remainder) return a.index - b.index;
    return a.remainder > b.remainder ? -1 : 1;
  });
  for (const entry of remainders) {
    if (remainderUnits <= 0n) break;
    parts[entry.index] = (parts[entry.index] ?? 0n) + 1n;
    remainderUnits -= 1n;
  }
  return parts.map((p) => money(negative ? -p : p, m.currency));
}

const MAJOR_PATTERN = /^-?(0|[1-9]\d*)(\.\d+)?$/;

/**
 * Parse a decimal string in major units (e.g. "12.34"). Never accepts
 * floating-point input; more fractional digits than the currency allows are
 * rejected rather than silently rounded.
 */
export function fromMajorUnits(major: string, currency: Currency): Money {
  const match = MAJOR_PATTERN.exec(major);
  if (!match) {
    throw new AppError('validation_failed', `invalid monetary amount: ${major}`, { status: 422 });
  }
  const exponent = MINOR_UNIT_EXPONENT[currency];
  const negative = major.startsWith('-');
  const [wholePart = '0', fractionPart = ''] = (negative ? major.slice(1) : major).split('.');
  if (fractionPart.length > exponent) {
    throw new AppError(
      'validation_failed',
      `amount has more than ${exponent} decimal places for ${currency}`,
      {
        status: 422,
      },
    );
  }
  const paddedFraction = fractionPart.padEnd(exponent, '0');
  const digits = `${wholePart}${paddedFraction}`;
  const amount = BigInt(digits);
  return money(negative ? -amount : amount, currency);
}

export function toMajorString(m: Money): string {
  const exponent = MINOR_UNIT_EXPONENT[m.currency];
  const negative = m.amountMinor < 0n;
  const digits = (negative ? -m.amountMinor : m.amountMinor).toString().padStart(exponent + 1, '0');
  const whole = digits.slice(0, digits.length - exponent) || '0';
  const fraction = exponent > 0 ? `.${digits.slice(digits.length - exponent)}` : '';
  return `${negative ? '-' : ''}${whole}${fraction}`;
}

export function isMoney(value: unknown): value is Money {
  if (typeof value !== 'object' || value === null) return false;
  if (!('amountMinor' in value) || !('currency' in value)) return false;
  return typeof value.amountMinor === 'bigint' && isCurrency(value.currency);
}
