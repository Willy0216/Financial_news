/**
 * Global dynamic currency formatting helper using Intl.NumberFormat
 */
export function formatCurrency(
  value: number | null | undefined,
  currencyCode: string = 'EUR',
  decimals: number = 2
): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '-';
  }

  const code = (currencyCode || 'EUR').toUpperCase().trim();

  // Handle British pence / GBX / GBp
  if (code === 'GBX' || code === 'GBP' || code === 'GBP') {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  }

  // Handle standard ISO currencies (USD, EUR, CHF, JPY, CAD, AUD, etc.)
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    // Fallback if currency code is non-standard
    return `${code} ${value.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;
  }
}
