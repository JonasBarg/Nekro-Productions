import type { Item } from '../data/types';

const RATE_UNIT = '/min';

function trimFixed(value: number, digits: number): string {
  return value.toFixed(digits).replace(/(?:\.0+|(\.\d+?)0+)$/, '$1');
}

function formatNumericRate(value: number, exact: boolean): string {
  const normalized = Math.abs(value) < 1e-9 ? 0 : value;
  if (exact) return trimFixed(normalized, 4);
  if (Math.abs(normalized) >= 1000) return trimFixed(normalized, 0);
  return trimFixed(normalized, normalized < 10 ? 2 : 1);
}

export function formatRate(value: number, item?: Item, exact = false): string {
  void item;
  return `${formatNumericRate(value, exact)} ${RATE_UNIT}`;
}

export function rateOnly(value: number): string {
  return formatNumericRate(value, false);
}
