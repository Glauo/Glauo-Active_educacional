import { dbList, dbSet, dbUpdate } from "./db";
import { applyGeneratedStudentCredentials, notifyStudentCredentials } from "./student-credentials";
import { ensureStudentMonthlyBilling } from "./monthly-billing";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return String(value || "").trim();
}

function lower(value: unknown) {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function normalizeCpf(value: unknown) {
  return text(value).replace(/\D/g, "");
}

function isInactiveStudent(student: Row) {
  const status = lower(student.status || student.situacao || "ativo");
  return Boolean(student.is_active === false || text(student.deleted_at) || status.includes("inativ") || status.includes("cancel") || status.includes("arquiv"));
}

function hasPortalAccess(student: Row) {
  return Boolean(text(student.login || student.usuario) && text(student.senha));
}

function looksLikeEnrollment(receivable: Row) {
  const raw = lower(`${text(receivable.categoria)} ${text(receivable.tipo_lancamento_detalhe)} ${text(receivable.tipo_cobranca)} ${text(receivable.descricao)}`);
  return raw.includes("matric") || raw.includes("curso") || raw.includes("plano") || raw.includes("mensal");
}

function studentRefs(student: Row) {
  return {
    ids: [student.id, student._id, student.uuid, student.codigo, student.matricula].map(text).filter(Boolean),
    logins: [student.login, student.usuario].map(lower).filter(Boolean),
    names: [student.nome, student.name, student.aluno].map(lower).filter(Boolean),
    cpfs: [student.cpf, student.responsavel_cpf].map(normalizeCpf).filter(Boolean),
  };
}

function receivableRefs(receivable: Row) {
  return {
    ids: [receivable.aluno_id, receivable.student_id, receivable.matricula, receivable.codigo_aluno].map(text).filter(Boolean),
    logins: [receivable.aluno_login, receivable.login, receivable.usuario].map(lower).filter(Boolean),
    names: [receivable.aluno, receivable.nome].map(lower).filter(Boolean),
    cpfs: [receivable.cpf_aluno, receivable.cpf, receivable.responsavel_cpf].map(normalizeCpf).filter(Boolean),
  };
}

function matchesStudent(receivable: Row, student: Row) {
  const studentKey = studentRefs(student);
  const receivableKey = receivableRefs(receivable);
  return (
    receivableKey.ids.some((value) => studentKey.ids.includes(value)) ||
    receivableKey.logins.some((value) => studentKey.logins.includes(value)) ||
    receivableKey.names.some((value) => studentKey.names.includes(value)) ||
    receivableKey.cpfs.some((value) => studentKey.cpfs.includes(value))
  );
}

async function audit(entry: Row) {
  await dbUpdate<Row[]>("finance_audit.json", (log) => [
    ...(Array.isArray(log) ? log : []),
    { id: crypto.randomUUID(), data: new Date().toISOString(), ...entry },
  ], []);
}

export async function releaseStudentAccessAfterPayment(receivable: Row, paymentId: string) {
  const students = await dbList<Row>("students.json");
  const idx = students.findIndex((student) => matchesStudent(receivable, student));
  if (idx === -1) {
    await audit({
      acao: "liberacao_aluno_pagamento_sem_match",
      lancamento_id: text(receivable.id),
      mercado_pago_payment_id: paymentId,
      aluno_recebivel: text(receivable.aluno || receivable.nome),
      aluno_login_recebivel: text(receivable.aluno_login),
    });
    return { matched: false, updated: false, notified: false };
  }

  const before = students[idx];
  const needsRelease = looksLikeEnrollment(receivable) || isInactiveStudent(before) || !hasPortalAccess(before);
  if (!needsRelease) {
    await audit({
      acao: "liberacao_aluno_pagamento_ignorada",
      lancamento_id: text(receivable.id),
      mercado_pago_payment_id: paymentId,
      aluno_id: text(before.id),
      aluno: text(before.nome || before.name),
      motivo: "ja_ativo_com_acesso",
    });
    return { matched: true, updated: false, notified: false, student: before };
  }

  const now = new Date().toISOString();
  const prepared = applyGeneratedStudentCredentials(before);
  const next: Row = {
    ...prepared,
    is_active: true,
    status: "Ativo",
    situacao: "Ativo",
    deleted_at: "",
    deleted_by: "",
    status_financeiro: "Regular",
    situacao_financeira: "Regular",
    portal_liberado_automaticamente_em: now,
    portal_liberado_por_pagamento_id: paymentId,
    portal_liberado_por_lancamento_id: text(receivable.id),
    updated_at: now,
    updated_by: "Automacao pagamento aprovado",
  };

  students[idx] = next;
  await dbSet("students.json", students);
  await ensureStudentMonthlyBilling(next, { usuario: "mercado_pago", pessoa: "Mercado Pago", perfil: "Sistema" });

  const samePaymentAlreadyNotified = text(before.portal_liberado_notificado_pagamento_id) === paymentId;
  const shouldNotify = !samePaymentAlreadyNotified && Boolean(text(next.login || next.usuario) && text(next.senha));
  let notificationStatus: Row | null = null;
  if (shouldNotify) {
    notificationStatus = await notifyStudentCredentials(next, { usuario: "mercado_pago", pessoa: "Mercado Pago", perfil: "Sistema" });
    const latest = await dbList<Row>("students.json");
    const latestIdx = latest.findIndex((student) => text(student.id) === text(next.id));
    if (latestIdx >= 0) {
      latest[latestIdx] = {
        ...latest[latestIdx],
        portal_liberado_notificado_em: new Date().toISOString(),
        portal_liberado_notificado_pagamento_id: paymentId,
        portal_liberado_notificacao_status: notificationStatus,
      };
      await dbSet("students.json", latest);
    }
  }

  await audit({
    acao: "liberar_aluno_automaticamente_por_pagamento",
    lancamento_id: text(receivable.id),
    mercado_pago_payment_id: paymentId,
    aluno_id: text(next.id),
    aluno: text(next.nome || next.name),
    login: text(next.login || next.usuario),
    notificado: shouldNotify,
    notification_status: notificationStatus || {},
    antes: before,
    depois: next,
  });

  return { matched: true, updated: true, notified: shouldNotify, student: next, notificationStatus };
}
