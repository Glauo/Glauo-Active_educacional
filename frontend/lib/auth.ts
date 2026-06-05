import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { dbList } from "./db";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "active-educacional-secret-2026-change-in-production"
);

const COOKIE_NAME = "ae_session";
const TTL_SECONDS = 60 * 60 * 8; // 8 horas

export type SessionUser = {
  usuario: string;
  perfil: string;
  pessoa: string;
  unit?: string;
};

type RawUser = {
  usuario: string;
  senha: string;
  perfil: string;
  pessoa: string;
  unit?: string;
  is_active?: boolean;
  status?: string;
  deleted_at?: string;
  must_change_password?: boolean;
  last_login_at?: string;
};

export async function signToken(payload: SessionUser): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

type StudentRecord = {
  id?: string;
  nome?: string;
  name?: string;
  login?: string;
  senha?: string;
  turma?: string;
  classe?: string;
  is_active?: boolean;
  status?: string;
  deleted_at?: string;
  [k: string]: unknown;
};

function normalize(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function isActiveRecord(record: { is_active?: boolean; status?: string; deleted_at?: string } | null | undefined) {
  if (!record) return false;
  if (record.is_active === false) return false;
  if (String(record.deleted_at || "").trim()) return false;
  const status = normalize(record.status || "ativo");
  return !status.includes("inativ") && !status.includes("cancel") && !status.includes("arquiv");
}

export function dashboardForPerfil(perfil?: string) {
  const p = normalize(perfil);
  if (p.includes("aluno")) return "/aluno";
  if (p.includes("prof")) return "/agenda";
  if (p.includes("comercial")) return "/comercial";
  if (p.includes("coord")) return "/";
  if (p.includes("admin") || p.includes("dire")) return "/";
  return "/";
}

export async function validateCredentials(
  usuario: string,
  senha: string,
  unit?: string
): Promise<SessionUser | null> {
  const login = normalize(usuario);
  const password = String(senha);
  let users: RawUser[] = await dbList<RawUser>("users.json");

  if (!users || users.length === 0) {
    users = [
      { usuario: "admin", senha: "2523", perfil: "Admin", pessoa: "Administrador" }
    ];
  }

  const found = users.find(
    (u) => isActiveRecord(u) && normalize(u.usuario) === login && String(u.senha) === password
  );

  if (!found) {
    return validateStudentCredentials(login, password);
  }

  return {
    usuario: found.usuario,
    perfil: found.perfil,
    pessoa: found.pessoa,
    unit: unit || found.unit || "Matriz"
  };
}

export async function validateStudentCredentials(
  login: string,
  senha: string
): Promise<SessionUser | null> {
  const normalizedLogin = normalize(login);
  const password = String(senha);
  const students = await dbList<StudentRecord>("students.json");
  const found = students.find(
    (s) => isActiveRecord(s) && s.login && normalize(s.login) === normalizedLogin && String(s.senha) === password
  );
  if (!found) return null;
  return {
    usuario: String(found.login),
    perfil: "Aluno",
    pessoa: String(found.nome || found.name || found.login),
    unit: String(found.turma || found.classe || "")
  };
}

export { COOKIE_NAME, TTL_SECONDS };
