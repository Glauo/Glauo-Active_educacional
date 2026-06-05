import { dbList, dbSet } from "./db";

type Row = Record<string, unknown>;

const RECEIVABLES_KEY = "receivables.json";
const DELETED_BILLING_KEY = "finance_deleted_keys.json";
const CYCLE_MONTHS = 6;

function text(value: unknown) {
  return String(value || "").trim();
}

function lower(value: unknown) {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function moneyValue(value: unknown) {
  return Number.parseFloat(text(value).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
}

function moneyInput(value: number) {
  return value.toFixed(2).replace(".", ",");
}

function moneyKey(value: unknown) {
  return moneyValue(value).toFixed(2);
}

function parseDate(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), 12);
  const date = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  const wantedDay = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(wantedDay, lastDay));
  return next;
}

function competencia(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function studentName(student: Row) {
  return text(student.nome || student.name || student.aluno || student.login);
}

function studentLogin(student: Row) {
  return text(student.login || student.usuario);
}

function studentPhone(student: Row) {
  const responsavel = student.responsavel && typeof student.responsavel === "object" ? student.responsavel as Row : {};
  return text(student.responsavel_telefone || responsavel.telefone || responsavel.celular || student.telefone || student.celular || student.whatsapp);
}

function studentEmail(student: Row) {
  const responsavel = student.responsavel && typeof student.responsavel === "object" ? student.responsavel as Row : {};
  return text(student.responsavel_email || responsavel.email || student.email || student.aluno_email);
}

function activeStudent(student: Row) {
  const status = lower(student.status || student.situacao || "ativo");
  return !status.includes("inativ") && !status.includes("cancel") && !status.includes("tranc");
}

function firstDueDate(student: Row) {
  const explicit = parseDate(student.vencimento || student.data_vencimento || student.primeiro_vencimento);
  if (explicit) return explicit;
  const day = Math.max(1, Math.min(28, Number(student.dia_vencimento) || 10));
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const date = new Date(today.getFullYear(), today.getMonth(), day, 12);
  return date < today ? addMonths(date, 1) : date;
}

function nextDueDateFromToday(student: Row) {
  const explicit = parseDate(student.vencimento || student.data_vencimento || student.primeiro_vencimento);
  const day = Math.max(1, Math.min(28, Number(student.dia_vencimento) || explicit?.getDate() || 10));
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const date = new Date(today.getFullYear(), today.getMonth(), day, 12);
  return date <= today ? addMonths(date, 1) : date;
}

function sameStudent(receivable: Row, student: Row) {
  const studentKeys = [
    text(student.id),
    studentLogin(student),
    studentName(student),
    text(student.cpf),
  ].map(lower).filter(Boolean);
  const receivableKeys = [
    text(receivable.aluno_id),
    text(receivable.aluno_login),
    text(receivable.aluno || receivable.nome),
    text(receivable.cpf),
  ].map(lower).filter(Boolean);
  return receivableKeys.some((key) => studentKeys.includes(key));
}

function isMonthly(receivable: Row) {
  const raw = lower(`${text(receivable.categoria)} ${text(receivable.tipo_lancamento_detalhe)} ${text(receivable.tipo_cobranca)} ${text(receivable.descricao)}`);
  return raw.includes("mensal");
}

function dueMonth(receivable: Row) {
  const explicit = text(receivable.competencia || receivable.referencia);
  if (/^\d{4}-\d{2}$/.test(explicit)) return explicit;
  const due = parseDate(receivable.vencimento || receivable.data_vencimento);
  return due ? competencia(due) : "";
}

function studentBillingKeys(student: Row) {
  return [
    text(student.id),
    studentLogin(student),
    studentName(student),
    text(student.cpf),
  ].map(lower).filter(Boolean);
}

function billingTombstoneKey(entityKey: string, comp: string, value: unknown) {
  return `${entityKey}|${comp}|${moneyKey(value)}`;
}

function hasDeletedBilling(student: Row, comp: string, value: unknown, deletedKeys: Set<string>) {
  return studentBillingKeys(student).some((key) => deletedKeys.has(billingTombstoneKey(key, comp, value)));
}

function shouldCreateRenewal(existingMonthly: Row[], today = new Date()) {
  if (existingMonthly.length === 0) return true;
  const latest = existingMonthly
    .map((row) => parseDate(row.vencimento || row.data_vencimento))
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  if (!latest) return false;
  today.setHours(0, 0, 0, 0);
  latest.setHours(0, 0, 0, 0);
  return latest < today;
}

function monthlyRowsForStudent(student: Row, receivables: Row[], actor: Row = {}, deletedKeys = new Set<string>()) {
  if (!activeStudent(student)) return [];
  const value = moneyValue(student.valor_mensalidade || student.mensalidade || student.plano_valor);
  const aluno = studentName(student);
  if (!aluno || !value) return [];

  const existingMonthly = receivables.filter((item) => sameStudent(item, student) && isMonthly(item));
  if (!shouldCreateRenewal(existingMonthly)) return [];

  const latest = existingMonthly
    .map((row) => parseDate(row.vencimento || row.data_vencimento))
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const start = latest ? nextDueDateFromToday(student) : firstDueDate(student);
  const now = new Date().toISOString();
  const created: Row[] = [];

  for (let i = 0; i < CYCLE_MONTHS; i++) {
    const due = addMonths(start, i);
    const comp = competencia(due);
    const duplicate = receivables.some((item) => sameStudent(item, student) && isMonthly(item) && dueMonth(item) === comp)
      || created.some((item) => text(item.competencia) === comp);
    if (duplicate) continue;
    if (hasDeletedBilling(student, comp, value, deletedKeys)) continue;

    created.push({
      id: crypto.randomUUID(),
      aluno,
      nome: aluno,
      aluno_id: text(student.id),
      aluno_login: studentLogin(student),
      turma: text(student.turma || student.classe),
      responsavel: text(student.responsavel_nome || (student.responsavel as Row | undefined)?.nome),
      telefone: studentPhone(student),
      whatsapp: studentPhone(student),
      email: studentEmail(student),
      descricao: "Mensalidade",
      categoria: "Mensalidade",
      tipo_lancamento_detalhe: "Mensalidade",
      tipo_cobranca: "Mensalidade escolar",
      competencia: comp,
      valor: moneyInput(value),
      valor_parcela: moneyInput(value),
      vencimento: isoDate(due),
      data_vencimento: isoDate(due),
      status: "Aberto",
      ciclo_meses: CYCLE_MONTHS,
      origem: "mensalidade_automatica_6_meses",
      created_at: now,
      created_by: text(actor.pessoa || actor.usuario || actor.nome || "Sistema"),
    });
  }

  return created;
}

export async function ensureStudentMonthlyBilling(student: Row, actor: Row = {}) {
  const receivables = await dbList<Row>(RECEIVABLES_KEY);
  const deletedKeys = new Set((await dbList<Row>(DELETED_BILLING_KEY)).map((item) => text(item.key)).filter(Boolean));
  const created = monthlyRowsForStudent(student, receivables, actor, deletedKeys);
  if (created.length > 0) await dbSet(RECEIVABLES_KEY, [...receivables, ...created]);
  return created;
}

export async function ensureStudentsMonthlyBilling(students: Row[], actor: Row = {}) {
  const receivables = await dbList<Row>(RECEIVABLES_KEY);
  const deletedKeys = new Set((await dbList<Row>(DELETED_BILLING_KEY)).map((item) => text(item.key)).filter(Boolean));
  const created: Row[] = [];
  let current = receivables;
  for (const student of students) {
    const rows = monthlyRowsForStudent(student, current, actor, deletedKeys);
    if (rows.length > 0) {
      created.push(...rows);
      current = [...current, ...rows];
    }
  }
  if (created.length > 0) await dbSet(RECEIVABLES_KEY, current);
  return created;
}
