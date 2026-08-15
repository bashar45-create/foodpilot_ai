/** Money formatter — fixed two decimals, USD-style. */
export function formatMoney(n: number): string {
  return `$${Number(n ?? 0).toFixed(2)}`;
}

/** Money formatter with explicit sign prefix. */
export function formatSignedMoney(n: number): string {
  const v = Number(n ?? 0);
  const sign = v >= 0 ? '+' : '-';
  return `${sign}${formatMoney(Math.abs(v))}`;
}