import { NextRequest, NextResponse } from "next/server";
import { validateCredentials, signToken, COOKIE_NAME, TTL_SECONDS, dashboardForPerfil } from "@/lib/auth";
import { dbList, dbSet } from "@/lib/db";

function text(value: unknown) {
  return String(value || "").trim();
}

function lower(value: unknown) {
  return text(value).toLowerCase();
}

export async function POST(req: NextRequest) {
  try {
    const { usuario, senha, unit } = await req.json();

    if (!usuario || !senha) {
      return NextResponse.json({ error: "Usuario e senha sao obrigatorios." }, { status: 400 });
    }

    const user = await validateCredentials(String(usuario), String(senha), String(unit || "Matriz"));
    if (!user) {
      return NextResponse.json({ error: "Usuario ou senha incorretos." }, { status: 401 });
    }

    const users = await dbList<Record<string, unknown>>("users.json");
    const idx = users.findIndex((item) => lower(item.usuario) === lower(user.usuario));
    if (idx >= 0) {
      users[idx] = { ...users[idx], last_login_at: new Date().toISOString() };
      await dbSet("users.json", users);
    }

    const token = await signToken(user);
    const redirectTo = String(user.unit || "").toLowerCase().includes("condojob")
      ? "/condojob"
      : dashboardForPerfil(user.perfil);

    const res = NextResponse.json({ ok: true, user, redirectTo });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: TTL_SECONDS,
      path: "/",
    });
    return res;
  } catch (err) {
    console.error("[auth]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE_NAME);
  return res;
}
