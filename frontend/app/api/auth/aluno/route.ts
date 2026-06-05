import { NextRequest, NextResponse } from "next/server";
import { validateStudentCredentials, signToken, COOKIE_NAME, TTL_SECONDS, dashboardForPerfil } from "@/lib/auth";
import { dbList, dbSet } from "@/lib/db";

function text(value: unknown) {
  return String(value || "").trim();
}

function lower(value: unknown) {
  return text(value).toLowerCase();
}

export async function POST(req: NextRequest) {
  try {
    const { login, senha } = await req.json();

    if (!login || !senha) {
      return NextResponse.json({ error: "Login e senha sao obrigatorios." }, { status: 400 });
    }

    const user = await validateStudentCredentials(String(login), String(senha));
    if (!user) {
      return NextResponse.json({ error: "Login ou senha incorretos." }, { status: 401 });
    }

    const students = await dbList<Record<string, unknown>>("students.json");
    const idx = students.findIndex((item) => lower(item.login || item.usuario) === lower(user.usuario));
    if (idx >= 0) {
      students[idx] = { ...students[idx], last_login_at: new Date().toISOString() };
      await dbSet("students.json", students);
    }

    const token = await signToken(user);
    const res = NextResponse.json({ ok: true, user, redirectTo: dashboardForPerfil(user.perfil) });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: TTL_SECONDS,
      path: "/",
    });
    return res;
  } catch (err) {
    console.error("[auth/aluno]", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
