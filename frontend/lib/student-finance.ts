import type { SessionUser } from "./auth";

type Row = Record<string, unknown>;

export type StudentFinanceSession = Pick<SessionUser, "usuario" | "pessoa" | "unit">;

const STUDENT_LOGIN_KEYS = ["login", "usuario", "aluno_login", "user", "username", "email", "aluno_email"];
const STUDENT_ID_KEYS = ["id", "_id", "uuid", "aluno_id", "student_id", "codigo", "codigo_aluno", "matricula"];
const STUDENT_NAME_KEYS = [
  "nome",
  "name",
  "nome_completo",
  "aluno",
  "aluno_nome",
  "nome_aluno",
  "responsavel_nome",
  "responsavel_financeiro",
];
const STUDENT_DOC_KEYS = [
  "cpf",
  "cpf_aluno",
  "cpf_do_aluno",
  "aluno_cpf",
  "responsavel_cpf",
  "cpf_responsavel",
  "documento",
  "documento_pagador",
  "cnpj",
];
const STUDENT_PHONE_KEYS = [
  "telefone",
  "celular",
  "whatsapp",
  "aluno_telefone",
  "aluno_celular",
  "responsavel_telefone",
  "telefone_responsavel",
  "responsavel_celular",
  "whatsapp_responsavel",
];

const FINANCE_ALIAS_KEYS = [
  "aluno_login",
  "login",
  "usuario",
  "user",
  "username",
  "aluno_id",
  "student_id",
  "studentId",
  "id_aluno",
  "idAluno",
  "codigo_aluno",
  "codigo",
  "matricula",
  "aluno_matricula",
  "matricula_aluno",
  "aluno",
  "aluno_nome",
  "nome_aluno",
  "nome",
  "pessoa",
  "cliente",
  "cliente_nome",
  "pagador",
  "estudante",
  "student_name",
  "responsavel",
  "responsavel_nome",
  "responsavel_financeiro",
  "email",
  "aluno_email",
  "email_aluno",
  "responsavel_email",
  "email_responsavel",
  "payer_email",
];
const FINANCE_NAME_KEYS = [
  "aluno",
  "aluno_nome",
  "nome_aluno",
  "nome",
  "pessoa",
  "cliente",
  "cliente_nome",
  "pagador",
  "estudante",
  "student_name",
];
const FINANCE_DOC_KEYS = [
  "cpf",
  "cpf_aluno",
  "cpf_do_aluno",
  "aluno_cpf",
  "responsavel_cpf",
  "cpf_responsavel",
  "documento",
  "documento_pagador",
  "cnpj",
];
const FINANCE_PHONE_KEYS = [
  "telefone",
  "celular",
  "whatsapp",
  "aluno_telefone",
  "aluno_celular",
  "responsavel_telefone",
  "telefone_responsavel",
  "responsavel_celular",
  "whatsapp_responsavel",
];

function text(value: unknown) {
  return String(value || "").trim();
}

export function normalizeStudentFinanceValue(value: unknown) {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function digits(value: unknown) {
  return text(value).replace(/\D/g, "");
}

function asRow(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function valuesFrom(row: Row | undefined | null, keys: string[]) {
  if (!row) return [];
  return keys.map((key) => text(row[key])).filter(Boolean);
}

function normalizedValues(row: Row | undefined | null, keys: string[]) {
  return valuesFrom(row, keys).map(normalizeStudentFinanceValue).filter(Boolean);
}

function digitValues(row: Row | undefined | null, keys: string[]) {
  return valuesFrom(row, keys).map(digits).filter(Boolean);
}

function uniq(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function intersects(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.some((item) => rightSet.has(item));
}

function responsible(student?: Row | null) {
  return asRow(student?.responsavel);
}

function studentAliases(student: Row | undefined | null, session: StudentFinanceSession) {
  const resp = responsible(student);
  return uniq([
    normalizeStudentFinanceValue(session.usuario),
    normalizeStudentFinanceValue(session.pessoa),
    ...normalizedValues(student, STUDENT_LOGIN_KEYS),
    ...normalizedValues(student, STUDENT_ID_KEYS),
    ...normalizedValues(student, STUDENT_NAME_KEYS),
    ...normalizedValues(resp, ["nome", "name", "email", "email_responsavel"]),
  ]);
}

function studentNames(student: Row | undefined | null, session: StudentFinanceSession) {
  const resp = responsible(student);
  return uniq([
    normalizeStudentFinanceValue(session.pessoa),
    ...normalizedValues(student, STUDENT_NAME_KEYS),
    ...normalizedValues(resp, ["nome", "name"]),
  ]);
}

function studentDigits(student?: Row | null) {
  const resp = responsible(student);
  return uniq([
    ...digitValues(student, STUDENT_DOC_KEYS),
    ...digitValues(student, STUDENT_PHONE_KEYS).filter((phone) => phone.length >= 10),
    ...digitValues(resp, ["cpf", "cpf_responsavel", "documento", "cnpj"]),
    ...digitValues(resp, ["telefone", "celular", "whatsapp"]).filter((phone) => phone.length >= 10),
  ]);
}

function hasCompatibleName(entry: Row, student: Row | undefined | null, session: StudentFinanceSession) {
  const financeNames = normalizedValues(entry, FINANCE_NAME_KEYS);
  const aliases = studentNames(student, session);
  return financeNames.some((name) =>
    aliases.some((alias) =>
      name === alias ||
      (name.length > 8 && alias.length > 8 && (name.includes(alias) || alias.includes(name)))
    )
  );
}

export function findStudentForSession<T extends Row>(students: T[], session: StudentFinanceSession): T | undefined {
  const sessionLogin = normalizeStudentFinanceValue(session.usuario);
  const sessionName = normalizeStudentFinanceValue(session.pessoa);

  return students.find((student) => {
    const resp = responsible(student);
    const logins = [
      ...normalizedValues(student, STUDENT_LOGIN_KEYS),
      ...normalizedValues(resp, ["email", "email_responsavel"]),
    ];
    const names = [
      ...normalizedValues(student, STUDENT_NAME_KEYS),
      ...normalizedValues(resp, ["nome", "name"]),
    ];
    return logins.includes(sessionLogin) || names.includes(sessionName) || names.includes(sessionLogin);
  });
}

export function sameStudentFinanceEntry(
  entry: Row,
  student: Row | undefined | null,
  session: StudentFinanceSession
) {
  const financeAliases = normalizedValues(entry, FINANCE_ALIAS_KEYS);
  const financeDigits = uniq([
    ...digitValues(entry, FINANCE_DOC_KEYS),
    ...digitValues(entry, FINANCE_PHONE_KEYS).filter((phone) => phone.length >= 10),
  ]);

  return (
    intersects(financeAliases, studentAliases(student, session)) ||
    intersects(financeDigits, studentDigits(student)) ||
    hasCompatibleName(entry, student, session)
  );
}
