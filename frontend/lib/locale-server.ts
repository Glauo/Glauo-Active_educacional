import { cookies } from "next/headers";
import { dbGet } from "@/lib/db";
import { LOCALE_COOKIE, normalizeLocale, resolveLocale, type AppLocale } from "@/lib/locale";

type SistemaConfig = {
  display_language?: string;
  idioma_exibicao?: string;
  [k: string]: unknown;
};

export async function getSchoolDisplayLanguage(): Promise<AppLocale | null> {
  const sistema = await dbGet<SistemaConfig>("sistema_config.json");
  const raw = sistema?.display_language ?? sistema?.idioma_exibicao;
  if (!raw) return null;
  return normalizeLocale(raw);
}

export async function getResolvedLocale(): Promise<AppLocale> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const schoolLocale = await getSchoolDisplayLanguage();
  return resolveLocale(cookieLocale, schoolLocale);
}
