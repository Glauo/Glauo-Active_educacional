import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ACCESS_MODULES, blockedRoutesFromUser, canAccessPath, defaultCanAccess } from "@/lib/access-control";
import { dbList, dbSet } from "@/lib/db";
import { isAdmin } from "@/lib/roles";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return String(value || "").trim();
}

function lower(value: unknown) {
  return text(value).toLowerCase();
}

function allowedProfiles(perfil: unknown) {
  return ACCESS_MODULES.filter((module) => defaultCanAccess(perfil, module.path));
}

export async function GET() {
  const session = await getSession();
  if (!session || !isAdmin(session)) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const users = await dbList<Row>("users.json");
  const payload = users
    .filter((user) => text(user.usuario))
    .map((user) => {
      const perfil = text(user.perfil || "Usuario");
      const blockedRoutes = blockedRoutesFromUser(user);
      return {
        id: text(user.id || user.professor_id || user.usuario),
        usuario: text(user.usuario),
        nome: text(user.pessoa || user.nome || user.usuario),
        perfil,
        blocked_routes: blockedRoutes,
        modules: allowedProfiles(perfil).map((module) => ({
          ...module,
          allowed: canAccessPath(perfil, module.path, blockedRoutes),
        })),
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return NextResponse.json({ modules: ACCESS_MODULES, usuarios: payload });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || !isAdmin(session)) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as { usuario?: string; blocked_routes?: unknown };
  const usuario = lower(body.usuario);
  if (!usuario) return NextResponse.json({ error: "Usuario obrigatorio." }, { status: 400 });

  const blockedRoutes = Array.isArray(body.blocked_routes)
    ? body.blocked_routes.map((item) => text(item)).filter(Boolean)
    : [];

  const users = await dbList<Row>("users.json");
  const idx = users.findIndex((user) => lower(user.usuario) === usuario);
  if (idx === -1) return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 404 });

  const target = users[idx];
  const perfil = text(target.perfil);
  const allowedPaths = new Set(allowedProfiles(perfil).map((module) => module.path));
  const sanitized = Array.from(new Set(blockedRoutes.filter((path) => allowedPaths.has(path))));

  users[idx] = {
    ...target,
    blocked_routes: sanitized,
    acessos_bloqueados: sanitized,
    access_updated_at: new Date().toISOString(),
    access_updated_by: session.pessoa || session.usuario,
  };

  await dbSet("users.json", users);
  return NextResponse.json({ ok: true, usuario, blocked_routes: sanitized });
}
