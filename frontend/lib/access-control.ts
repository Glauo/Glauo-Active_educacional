import { dbList } from "./db";
import type { SessionUser } from "./auth";

export type AccessModule = {
  key: string;
  label: string;
  path: string;
  roles: string[];
};

type UserAccessRecord = {
  usuario?: string;
  perfil?: string;
  blocked_routes?: unknown;
  acessos_bloqueados?: unknown;
  access_blocked?: unknown;
  [k: string]: unknown;
};

export const ACCESS_MODULES: AccessModule[] = [
  { key: "dashboard", label: "Dashboard", path: "/", roles: ["admin", "coord", "dire", "gestor", "comercial", "prof"] },
  { key: "alunos", label: "Alunos", path: "/alunos", roles: ["admin", "coord", "dire", "gestor", "comercial"] },
  { key: "professores", label: "Professores", path: "/professores", roles: ["admin", "coord", "dire", "gestor"] },
  { key: "turmas", label: "Turmas", path: "/turmas", roles: ["admin", "coord", "dire", "gestor", "prof"] },
  { key: "agenda", label: "Agenda", path: "/agenda", roles: ["admin", "coord", "dire", "gestor", "comercial", "prof"] },
  { key: "mural", label: "Mural", path: "/mural", roles: ["admin", "coord", "dire", "gestor", "prof"] },
  { key: "licoes", label: "Licoes de Casa", path: "/licoes", roles: ["admin", "coord", "dire", "gestor", "prof"] },
  { key: "correcao_licoes", label: "Correcao de Licoes", path: "/correcao-licoes", roles: ["admin", "coord", "dire"] },
  { key: "desafios", label: "Desafios", path: "/desafios", roles: ["admin", "coord", "dire", "gestor", "prof"] },
  { key: "notas", label: "Notas", path: "/notas", roles: ["admin", "coord", "dire", "gestor", "prof"] },
  { key: "biblioteca", label: "Material", path: "/biblioteca", roles: ["admin", "coord", "dire", "gestor", "prof"] },
  { key: "financeiro", label: "Financeiro", path: "/financeiro", roles: ["admin", "coord", "dire", "gestor", "comercial"] },
  { key: "comercial", label: "Comercial", path: "/comercial", roles: ["admin", "coord", "dire", "gestor", "comercial"] },
  { key: "atendimento", label: "Atendimento", path: "/atendimento", roles: ["admin", "coord", "dire", "gestor", "comercial"] },
  { key: "estoque", label: "Estoque", path: "/estoque", roles: ["admin", "coord", "dire", "gestor"] },
  { key: "wiz", label: "Wiz IA", path: "/wiz", roles: ["admin", "coord", "dire", "gestor", "comercial", "prof"] },
  { key: "condojob", label: "CondoJob", path: "/condojob", roles: ["admin", "coord", "dire", "gestor", "comercial"] },
  { key: "configuracoes", label: "Configuracoes", path: "/configuracoes", roles: ["admin", "coord", "dire", "gestor"] },
  { key: "acessos", label: "Acessos", path: "/usuarios/credenciais", roles: ["admin"] },
  { key: "acessos_alunos", label: "Credenciais de alunos", path: "/alunos/credenciais", roles: ["admin"] },
];

function lower(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function normalizePath(path: string) {
  const clean = String(path || "/").trim();
  if (!clean || clean === "/") return "/";
  return clean.startsWith("/") ? clean.replace(/\/+$/, "") : `/${clean.replace(/\/+$/, "")}`;
}

export function blockedRoutesFromUser(user?: UserAccessRecord | null) {
  return Array.from(new Set([
    ...list(user?.blocked_routes),
    ...list(user?.acessos_bloqueados),
    ...list(user?.access_blocked),
  ].map(normalizePath)));
}

export function defaultCanAccess(perfil: unknown, path: string) {
  const role = lower(perfil);
  const target = normalizePath(path);
  const module = ACCESS_MODULES.find((item) => item.path === target);
  if (!module) return true;
  return module.roles.some((allowed) => role.includes(allowed));
}

export function isRouteBlocked(path: string, blockedRoutes: string[]) {
  const target = normalizePath(path);
  return blockedRoutes.some((blocked) => {
    const item = normalizePath(blocked);
    if (item === "/") return target === "/";
    return target === item || target.startsWith(`${item}/`);
  });
}

export function canAccessPath(perfil: unknown, path: string, blockedRoutes: string[] = []) {
  return defaultCanAccess(perfil, path) && !isRouteBlocked(path, blockedRoutes);
}

export async function getAccessForSession(session: Pick<SessionUser, "usuario" | "perfil"> | null) {
  if (!session) return { blockedRoutes: [] as string[] };
  const users = await dbList<UserAccessRecord>("users.json");
  const user = users.find((item) => lower(item.usuario) === lower(session.usuario));
  return { blockedRoutes: blockedRoutesFromUser(user) };
}
