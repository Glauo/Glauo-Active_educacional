import type { SessionUser } from "./auth";
import { polishPortugueseText } from "./portuguese-text";
import { sendEmail } from "./email";
import { manualWhatsAppUrl } from "./manual-whatsapp";

export type StudentCredentialRow = {
  nome?: string;
  name?: string;
  login?: string;
  usuario?: string;
  senha?: string;
  cpf?: string;
  data_nascimento?: string;
  nascimento?: string;
  celular?: string;
  telefone?: string;
  whatsapp?: string;
  email?: string;
  responsavel?: unknown;
  responsavel_telefone?: string;
  responsavel_email?: string;
  [key: string]: unknown;
};

function text(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const row = value as Record<string, unknown>;
    return String(row.nome || row.name || row.celular || row.telefone || row.whatsapp || row.email || "").trim();
  }
  return String(value || "").trim();
}

function digits(value: unknown) {
  return text(value).replace(/\D/g, "");
}

function responsavel(row: StudentCredentialRow) {
  return row.responsavel && typeof row.responsavel === "object" && !Array.isArray(row.responsavel)
    ? row.responsavel as Record<string, unknown>
    : {};
}

export function credentialLoginFromBirthdate(value: unknown) {
  const raw = text(value);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}${iso[2]}${iso[1]}`;
  return digits(raw);
}

export function credentialPasswordFromCpf(value: unknown) {
  return digits(value).slice(0, 5);
}

export function generatedStudentCredentials(row: StudentCredentialRow) {
  const login = credentialLoginFromBirthdate(row.data_nascimento || row.nascimento);
  const senha = credentialPasswordFromCpf(row.cpf);
  return { login, senha };
}

export function applyGeneratedStudentCredentials<T extends StudentCredentialRow>(row: T): T {
  const generated = generatedStudentCredentials(row);
  return {
    ...row,
    login: generated.login || text(row.login || row.usuario).toLowerCase(),
    usuario: generated.login || text(row.login || row.usuario).toLowerCase(),
    senha: generated.senha || text(row.senha),
  };
}

export function studentCredentialPhone(row: StudentCredentialRow) {
  const resp = responsavel(row);
  return text(row.celular || row.whatsapp || row.telefone || row.responsavel_telefone || resp.celular || resp.telefone || resp.whatsapp);
}

export function studentCredentialEmail(row: StudentCredentialRow) {
  const resp = responsavel(row);
  return text(row.responsavel_email || resp.email || row.email);
}

export function studentCredentialMessage(row: StudentCredentialRow, login = text(row.login || row.usuario), senha = text(row.senha)) {
  const nome = text(row.nome || row.name || "aluno");
  return polishPortugueseText([
    `Olá, ${nome}!`,
    "Seu acesso ao portal do aluno Active Educacional está liberado.",
    "",
    `Login: ${login}`,
    `Senha: ${senha}`,
    "",
    "Portal: https://ativoeducacional.tech/aluno/login",
    "",
    "Guarde esses dados com segurança.",
  ].join("\n"));
}

export async function notifyStudentCredentials(row: StudentCredentialRow, session?: Pick<SessionUser, "usuario" | "pessoa" | "perfil"> | null) {
  const login = text(row.login || row.usuario);
  const senha = text(row.senha);
  const mensagem = studentCredentialMessage(row, login, senha);
  const phone = studentCredentialPhone(row);
  const email = studentCredentialEmail(row);
  const mail = email
    ? await sendEmail(email, "Acesso ao portal Active Educacional", mensagem, session)
    : { ok: false, status: "sem email" };
  return {
    whatsapp: phone ? "link_manual_gerado" : "sem telefone",
    whatsapp_url: phone ? manualWhatsAppUrl(phone, mensagem) : "",
    email: mail.ok ? "enviado_smtp" : mail.status,
    whatsapp_enviado: false,
    email_enviado: mail.ok,
    telefone: phone,
    email_destino: email,
  };
}
