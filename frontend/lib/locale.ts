export const SUPPORTED_LOCALES = ["pt-BR", "en-US"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "pt-BR";
export const LOCALE_COOKIE = "ae_locale";

export function isSupportedLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function normalizeLocale(value: unknown): AppLocale | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === "pt-br" || lower === "pt_br" || lower === "pt") return "pt-BR";
  if (lower === "en-us" || lower === "en_us" || lower === "en") return "en-US";
  if (isSupportedLocale(trimmed)) return trimmed;
  return null;
}

/** Cookie override, then school default, then pt-BR. */
export function resolveLocale(cookieValue: unknown, schoolDefault: unknown): AppLocale {
  return normalizeLocale(cookieValue) || normalizeLocale(schoolDefault) || DEFAULT_LOCALE;
}

export function localeMessagesPath(locale: AppLocale): string {
  return `../messages/${locale}.json`;
}
