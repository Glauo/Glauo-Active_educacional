import type { SessionUser } from "./auth";
import { sendEmail } from "./email";
import { polishPortugueseText } from "./portuguese-text";
import { lower, normalizeList, text, type Row } from "./school-modules";
import { sendWhatsApp } from "./whatsapp";

type NotifyResult = {
  push: string;
  whatsapp: string;
  email: string;
  total_destinatarios: number;
};

function normalize(value: unknown) {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function studentName(row: Row) {
  return text(row.nome || row.name || row.aluno || row.login);
}

function studentLogin(row: Row) {
  return text(row.login || row.usuario || row.aluno_login);
}

function studentClass(row: Row) {
  return text(row.turma || row.classe || row.class || row.turma_nome || row.nome_turma || row.turma_atual);
}

function studentClasses(row: Row) {
  return [
    studentClass(row),
    ...normalizeList(row.turmas || row.classes || row.turmas_aluno),
  ].map(normalize).filter(Boolean);
}

function studentPhone(row: Row) {
  const responsavel = (row.responsavel && typeof row.responsavel === "object" ? row.responsavel : {}) as Row;
  return text(
    row.whatsapp ||
    row.celular ||
    row.telefone ||
    row.responsavel_telefone ||
    row.telefone_responsavel ||
    row.whatsapp_responsavel ||
    responsavel.whatsapp ||
    responsavel.celular ||
    responsavel.telefone ||
    row.phone
  );
}

function studentEmail(row: Row) {
  const responsavel = (row.responsavel && typeof row.responsavel === "object" ? row.responsavel : {}) as Row;
  return text(row.email || row.responsavel_email || row.email_responsavel || responsavel.email);
}

function firstName(value: unknown) {
  return text(value).split(/\s+/)[0] || "aluno";
}

function isActiveStudent(row: Row) {
  const status = lower(row.status || row.situacao || "ativo");
  return !status.includes("inativ") && !status.includes("cancel") && !status.includes("exclu");
}

function listMatchesStudent(list: string[], student: Row) {
  const keys = [studentName(student), studentLogin(student), text(student.id)].map(normalize).filter(Boolean);
  return list.map(normalize).some((target) => keys.includes(target));
}

export function itemTargetsStudent(item: Row, student: Row) {
  const targetStudent = text(item.aluno || item.aluno_nome || item.target_aluno || item.destinatario_aluno);
  const targetStudents = normalizeList(item.alunos || item.alunos_especificos || item.target_alunos);
  const targetClass = text(item.turma || item.target_turma || item.classe);
  const targetClasses = normalizeList(item.turmas || item.target_turmas || item.target_turmas_envio);
  const classNames = studentClasses(student);

  if (targetStudent) return listMatchesStudent([targetStudent], student);
  if (targetStudents.length > 0) return listMatchesStudent(targetStudents, student);

  const classTargets = [targetClass, ...targetClasses].filter(Boolean);
  if (classTargets.length > 0) {
    const matchesClass = classTargets.some((turma) => {
      const target = normalize(turma);
      return ["todas", "todos", "escola toda", "todas as turmas"].includes(target) || classNames.includes(target);
    });
    if (!matchesClass) return false;
  }

  return true;
}

export function targetStudents(students: Row[], item: Row) {
  const seen = new Set<string>();
  return students.filter((student) => {
    if (!isActiveStudent(student) || !itemTargetsStudent(item, student)) return false;
    const key = normalize(text(student.id) || studentLogin(student) || studentName(student));
    if (key && seen.has(key)) return false;
    if (key) seen.add(key);
    return true;
  });
}

export async function notifyStudentsAboutLaunch({
  students,
  item,
  kind,
  title,
  body,
  session,
}: {
  students: Row[];
  item: Row;
  kind: "licao" | "desafio" | "comunicado" | "nota";
  title: string;
  body: string;
  session?: Pick<SessionUser, "usuario" | "pessoa" | "perfil"> | null;
}): Promise<NotifyResult> {
  const recipients = targetStudents(students, item);
  const linkByKind: Record<typeof kind, string> = {
    licao: "/aluno?tab=licoes",
    desafio: "/aluno?tab=desafios",
    comunicado: "/aluno?tab=mural",
    nota: "/aluno?tab=notas",
  };
  const labelByKind: Record<typeof kind, string> = {
    licao: "nova lição de casa",
    desafio: "novo desafio",
    comunicado: "novo comunicado",
    nota: "nova nota",
  };
  const link = linkByKind[kind];
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://ativoeducacional.tech").replace(/\/+$/, "");
  const subject = polishPortugueseText(title);
  let whatsappOk = 0;
  let whatsappFail = 0;
  let emailOk = 0;
  let emailFail = 0;

  for (const student of recipients) {
    const phone = studentPhone(student);
    const email = studentEmail(student);
    const message = polishPortugueseText([
      `Olá, ${firstName(studentName(student))}!`,
      "",
      `Você recebeu ${labelByKind[kind]} no Active Educacional.`,
      "",
      title,
      "",
      body,
      "",
      `Acesse para acompanhar: ${appUrl}${link}`,
    ].join("\n"));
    if (phone) {
      const result = await sendWhatsApp(phone, message, session);
      if (result.ok) whatsappOk += 1;
      else whatsappFail += 1;
    }
    if (email) {
      const result = await sendEmail(email, subject, message, session);
      if (result.ok) emailOk += 1;
      else emailFail += 1;
    }
  }

  return {
    push: recipients.length ? "portal_sininho_e_inicio" : "sem_destinatarios",
    whatsapp: recipients.length ? `enviados:${whatsappOk};falhas:${whatsappFail}` : "sem_destinatarios",
    email: recipients.length ? `enviados:${emailOk};falhas:${emailFail}` : "sem_destinatarios",
    total_destinatarios: recipients.length,
  };
}
