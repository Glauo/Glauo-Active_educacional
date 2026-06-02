import { DEFAULT_LOCALE, normalizeLocale, type AppLocale } from "@/lib/locale";

export function getFormatLocale(locale?: string): AppLocale {
  return normalizeLocale(locale) || DEFAULT_LOCALE;
}

export function formatCurrency(value: number, locale?: string): string {
  const loc = getFormatLocale(locale);
  return value.toLocaleString(loc, { style: "currency", currency: "BRL" });
}

export function formatDate(value: Date | string | number, locale?: string, options?: Intl.DateTimeFormatOptions): string {
  const loc = getFormatLocale(locale);
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(loc, options);
}

export function formatDateTime(value: Date | string | number, locale?: string): string {
  const loc = getFormatLocale(locale);
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(loc, { dateStyle: "short", timeStyle: "short" });
}

export function formatNumber(value: number, locale?: string, options?: Intl.NumberFormatOptions): string {
  return value.toLocaleString(getFormatLocale(locale), options);
}
