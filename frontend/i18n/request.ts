import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, type AppLocale } from "@/lib/locale";
import { getSchoolDisplayLanguage } from "@/lib/locale-server";
import { resolveLocale } from "@/lib/locale";

async function loadMessages(locale: AppLocale) {
  switch (locale) {
    case "en-US":
      return (await import("../messages/en-US.json")).default;
    case "pt-BR":
    default:
      return (await import("../messages/pt-BR.json")).default;
  }
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const schoolLocale = await getSchoolDisplayLanguage();
  const locale = resolveLocale(cookieLocale, schoolLocale);
  const messages = await loadMessages(locale);

  return {
    locale,
    messages,
  };
});
