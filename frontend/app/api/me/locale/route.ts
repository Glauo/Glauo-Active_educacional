import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getResolvedLocale, getSchoolDisplayLanguage } from "@/lib/locale-server";
import { isSupportedLocale, LOCALE_COOKIE, normalizeLocale } from "@/lib/locale";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function localeCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  };
}

export async function GET() {
  const schoolDefault = await getSchoolDisplayLanguage();
  const locale = await getResolvedLocale();
  const cookieStore = await cookies();
  const userOverride = cookieStore.get(LOCALE_COOKIE)?.value || null;
  return NextResponse.json({
    locale,
    schoolDefault: schoolDefault || "pt-BR",
    userOverride: userOverride && isSupportedLocale(userOverride) ? userOverride : null,
  });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { locale?: string };
  const locale = normalizeLocale(body.locale);
  if (!locale) {
    return NextResponse.json({ error: "Invalid locale." }, { status: 400 });
  }
  const res = NextResponse.json({ ok: true, locale });
  res.cookies.set(LOCALE_COOKIE, locale, localeCookieOptions());
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(LOCALE_COOKIE, "", { ...localeCookieOptions(), maxAge: 0 });
  return res;
}
