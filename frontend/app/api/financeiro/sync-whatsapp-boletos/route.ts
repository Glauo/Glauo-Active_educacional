import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dbList, dbSet } from "@/lib/db";
import { isAdminOrCoordinator } from "@/lib/roles";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return String(value || "").trim();
}

function normalize(value: unknown) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function onlyDigits(value: unknown) {
  return text(value).replace(/\D/g, "");
}

function asRow(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function firstPresent(...values: unknown[]) {
  return values.map(text).find(Boolean) || "";
}

function studentName(student: Row) {
  return firstPresent(student.nome, student.name, student.aluno);
}

function receivableName(item: Row) {
  return firstPresent(item.aluno, item.nome, item.pagador, item.estudante, item.student_name);
}

function studentPhone(student: Row) {
  const responsavel = asRow(student.responsavel);
  return firstPresent(
    student.whatsapp,
    student.celular,
    student.telefone,
    student.phone,
    student.aluno_telefone,
    student.responsavel_telefone,
    student.telefone_responsavel,
    student.celular_responsavel,
    student.whatsapp_responsavel,
    responsavel.whatsapp,
    responsavel.celular,
    responsavel.telefone,
    responsavel.phone
  );
}

function studentEmail(student: Row) {
  const responsavel = asRow(student.responsavel);
  return firstPresent(
    student.email,
    student.aluno_email,
    student.email_responsavel,
    student.responsavel_email,
    responsavel.email
  );
}

function studentResponsible(student: Row) {
  const responsavel = asRow(student.responsavel);
  return firstPresent(
    responsavel.nome,
    responsavel.name,
    student.responsavel_nome,
    student.responsavel_financeiro,
    typeof student.responsavel === "string" ? student.responsavel : ""
  );
}

function studentKeys(student: Row) {
  return {
    ids: [student.id, student._id, student.uuid, student.codigo, student.matricula].map(normalize).filter(Boolean),
    logins: [student.login, student.usuario, student.aluno_login, student.email].map(normalize).filter(Boolean),
    names: [student.nome, student.name, student.aluno].map(normalize).filter(Boolean),
  };
}

function findStudent(students: Row[], item: Row) {
  const itemIds = [item.aluno_id, item.student_id, item.id_aluno, item.studentId].map(normalize).filter(Boolean);
  const itemLogins = [item.aluno_login, item.login, item.usuario, item.aluno_email, item.email].map(normalize).filter(Boolean);
  const itemNames = [item.aluno, item.nome, item.pagador, item.estudante, item.student_name].map(normalize).filter(Boolean);

  return students.find((student) => {
    const keys = studentKeys(student);
    return Boolean(
      itemIds.some((id) => keys.ids.includes(id)) ||
      itemLogins.some((login) => keys.logins.includes(login)) ||
      itemNames.some((name) => keys.names.includes(name))
    );
  }) || null;
}

function existingPhone(item: Row) {
  return firstPresent(
    item.whatsapp,
    item.telefone,
    item.celular,
    item.aluno_telefone,
    item.responsavel_telefone,
    item.telefone_responsavel,
    item.whatsapp_responsavel
  );
}

function shouldUpdatePhone(current: unknown, phone: string, force: boolean) {
  if (!phone) return false;
  if (force) return onlyDigits(current) !== onlyDigits(phone);
  return !text(current);
}

function shouldUpdateText(current: unknown, next: string, force: boolean) {
  if (!next) return false;
  if (force) return text(current) !== next;
  return !text(current);
}

async function runSync(req: NextRequest, dryRun: boolean) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  if (!isAdminOrCoordinator(session)) return NextResponse.json({ error: "Sem permissao." }, { status: 403 });

  const body = req.method === "POST" ? await req.json().catch(() => ({})) as Row : {};
  const url = new URL(req.url);
  const force = text(body.force || url.searchParams.get("force")).toLowerCase() === "true";
  const now = new Date().toISOString();

  const [students, receivables, audit] = await Promise.all([
    dbList<Row>("students.json"),
    dbList<Row>("receivables.json"),
    dbList<Row>("finance_audit.json"),
  ]);

  let encontrados = 0;
  let atualizados = 0;
  let jaTinhamTelefone = 0;
  let semAluno = 0;
  let semWhatsapp = 0;
  const detalhes: Row[] = [];

  const nextReceivables = receivables.map((item) => {
    const student = findStudent(students, item);
    if (!student) {
      semAluno += 1;
      return item;
    }

    encontrados += 1;
    const phone = studentPhone(student);
    if (!phone) {
      semWhatsapp += 1;
      return item;
    }

    const updates: Row = {};
    if (shouldUpdatePhone(item.whatsapp, phone, force)) updates.whatsapp = phone;
    if (shouldUpdatePhone(item.telefone, phone, force)) updates.telefone = phone;
    if (shouldUpdatePhone(item.aluno_telefone, phone, force)) updates.aluno_telefone = phone;
    if (shouldUpdatePhone(item.responsavel_telefone, phone, force)) updates.responsavel_telefone = phone;

    const email = studentEmail(student);
    if (email && shouldUpdateText(item.email, email, force)) updates.email = email;

    const responsavel = studentResponsible(student);
    if (responsavel && shouldUpdateText(item.responsavel, responsavel, force)) updates.responsavel = responsavel;

    if (Object.keys(updates).length === 0) {
      if (existingPhone(item)) jaTinhamTelefone += 1;
      return item;
    }

    atualizados += 1;
    if (detalhes.length < 80) {
      detalhes.push({
        id: item.id,
        aluno: receivableName(item) || studentName(student),
        telefone_anterior: existingPhone(item),
        telefone_novo: phone,
      });
    }

    return {
      ...item,
      ...updates,
      whatsapp_boleto_sync_em: now,
      whatsapp_boleto_sync_origem: "students",
    };
  });

  if (!dryRun && atualizados > 0) {
    await Promise.all([
      dbSet("receivables.json", nextReceivables),
      dbSet("finance_audit.json", [
        ...audit,
        {
          id: crypto.randomUUID(),
          data: now,
          acao: "sync_whatsapp_boletos",
          usuario: session.pessoa || session.usuario,
          perfil: session.perfil,
          analisados: receivables.length,
          encontrados,
          atualizados,
          sem_aluno: semAluno,
          sem_whatsapp: semWhatsapp,
          force,
        },
      ]),
    ]);
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    force,
    alunos: students.length,
    boletos_analisados: receivables.length,
    alunos_encontrados: encontrados,
    boletos_atualizados: dryRun ? 0 : atualizados,
    boletos_que_seriam_atualizados: dryRun ? atualizados : undefined,
    ja_tinham_telefone: jaTinhamTelefone,
    sem_aluno: semAluno,
    sem_whatsapp: semWhatsapp,
    detalhes,
  });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const executar = text(url.searchParams.get("executar")).toLowerCase();
  return runSync(req, executar !== "sim");
}

export async function POST(req: NextRequest) {
  return runSync(req, false);
}
