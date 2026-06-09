import { NextRequest, NextResponse } from "next/server";
import { dbList, dbSet, dbUpdate } from "@/lib/db";
import { financeMessage } from "@/lib/finance-message";
import { applyMercadoPagoToLancamento, createMercadoPagoBoleto } from "@/lib/mercadopago-boleto";
import { sendWhatsApp } from "@/lib/whatsapp";

type Row = Record<string, unknown>;

const DAYS_BEFORE_DUE = 15;

function text(value: unknown) {
  return String(value || "").trim();
}

function normalize(value: unknown) {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function asRow(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function parseDate(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), 12);
  const date = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function todayLocal() {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return today;
}

function daysUntil(date: Date, today = todayLocal()) {
  const due = new Date(date);
  due.setHours(12, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

function isClosed(row: Row) {
  const status = normalize(`${row.status || ""} ${row.situacao || ""}`);
  return status.includes("pago") || status.includes("baixado") || status.includes("liquidado") || status.includes("cancel") || status.includes("estorn");
}

function isExpense(row: Row) {
  return normalize(`${row.tipo || ""} ${row.tipo_cobranca || ""}`).includes("despesa");
}

function notification(row: Row) {
  return asRow(row.notification_status);
}

function alreadyAttempted(row: Row, dueKey: string) {
  const status = notification(row);
  return text(status.boleto_15_dias_vencimento) === dueKey && Boolean(text(status.boleto_15_dias_whatsapp));
}

function boletoLink(row: Row) {
  return text(row.mercado_pago_ticket_url || row.boleto_url || row.boleto_pdf_url || row.boleto_pdf_public_url);
}

function findStudent(students: Row[], row: Row) {
  const id = normalize(row.aluno_id || row.student_id || row.id_aluno);
  const login = normalize(row.aluno_login || row.login || row.usuario);
  const name = normalize(row.aluno || row.nome || row.pagador);
  return students.find((student) => {
    const ids = [student.id, student._id, student.uuid, student.codigo, student.matricula].map(normalize).filter(Boolean);
    const logins = [student.login, student.usuario, student.aluno_login].map(normalize).filter(Boolean);
    const names = [student.nome, student.name, student.nome_completo, student.aluno].map(normalize).filter(Boolean);
    return Boolean(
      (id && ids.includes(id)) ||
      (login && logins.includes(login)) ||
      (name && names.includes(name))
    );
  }) || null;
}

function phoneOf(row: Row, student: Row | null) {
  const responsible = asRow(student?.responsavel);
  return text(
    row.telefone ||
    row.whatsapp ||
    row.celular ||
    row.phone ||
    row.responsavel_telefone ||
    row.telefone_responsavel ||
    row.celular_responsavel ||
    row.whatsapp_responsavel ||
    row.aluno_telefone ||
    student?.responsavel_telefone ||
    responsible.telefone ||
    responsible.celular ||
    responsible.whatsapp ||
    student?.telefone ||
    student?.celular ||
    student?.whatsapp
  );
}

async function updateReceivable(id: string, patch: Row) {
  await dbUpdate<Row[]>("receivables.json", (latest) =>
    (Array.isArray(latest) ? latest : []).map((item) => text(item.id) === id ? { ...item, ...patch } : item)
  , []);
}

async function handleCron(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret") || req.headers.get("x-cron-secret");
  const cronSecret = process.env.CRON_SECRET || process.env.ACTIVE_CRON_SECRET;
  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const startedAt = Date.now();
  const origin = text(process.env.ACTIVE_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL) || new URL(req.url).origin;
  const [receivables, students] = await Promise.all([
    dbList<Row>("receivables.json"),
    dbList<Row>("students.json"),
  ]);

  let processados = 0;
  let enviados = 0;
  let erros = 0;
  let semTelefone = 0;
  let ignorados = 0;
  const detalhes: Row[] = [];

  for (const row of receivables) {
    const id = text(row.id);
    const due = parseDate(row.vencimento || row.data_vencimento);
    if (!id || !due || isExpense(row) || isClosed(row)) {
      ignorados++;
      continue;
    }

    const dueKey = dateKey(due);
    if (daysUntil(due) !== DAYS_BEFORE_DUE || alreadyAttempted(row, dueKey)) {
      ignorados++;
      continue;
    }

    processados++;
    const student = findStudent(students, row);
    const phone = phoneOf(row, student);
    if (!phone) {
      semTelefone++;
      detalhes.push({ id, aluno: text(row.aluno || row.nome), ok: false, erro: "Sem WhatsApp cadastrado" });
      continue;
    }

    let current = row;
    if (!boletoLink(current)) {
      const generated = await createMercadoPagoBoleto(current, id, origin);
      if (!generated.ok) {
        erros++;
        await updateReceivable(id, {
          notification_status: {
            ...notification(current),
            boleto_15_dias_whatsapp: "falha_gerar_boleto",
            boleto_15_dias_whatsapp_em: new Date().toISOString(),
            boleto_15_dias_vencimento: dueKey,
            boleto_15_dias_erro: generated.message,
          },
        });
        detalhes.push({ id, aluno: text(row.aluno || row.nome), ok: false, erro: generated.message });
        continue;
      }
      current = applyMercadoPagoToLancamento(current, generated);
    }

    const message = financeMessage(current, origin);
    const result = await sendWhatsApp(phone, message.body, { usuario: "sistema", pessoa: "Cron financeiro", perfil: "Cron" });
    const now = new Date().toISOString();
    await updateReceivable(id, {
      ...current,
      notification_status: {
        ...notification(current),
        boleto_15_dias_whatsapp: result.ok ? "enviado_wapi" : result.status,
        boleto_15_dias_whatsapp_em: now,
        boleto_15_dias_vencimento: dueKey,
      },
    });

    if (result.ok) enviados++;
    else erros++;
    detalhes.push({ id, aluno: text(current.aluno || current.nome), ok: result.ok, status: result.status });
  }

  const audit = await dbList<Row>("finance_audit.json");
  await dbUpdate<Row[]>("finance_audit.json", (items) => [
    ...(Array.isArray(items) ? items : audit),
    {
      id: crypto.randomUUID(),
      data: new Date().toISOString(),
      acao: "cron_enviar_boletos_whatsapp_15_dias",
      usuario: "sistema",
      perfil: "Cron",
      dias_antes: DAYS_BEFORE_DUE,
      processados,
      enviados,
      erros,
      sem_telefone: semTelefone,
      ignorados,
      duracao_ms: Date.now() - startedAt,
    },
  ], audit);

  return NextResponse.json({
    ok: true,
    executado_em: new Date().toISOString(),
    dias_antes: DAYS_BEFORE_DUE,
    processados,
    enviados,
    erros,
    sem_telefone: semTelefone,
    ignorados,
    duracao_ms: Date.now() - startedAt,
    detalhes,
  });
}

export async function GET(req: NextRequest) {
  return handleCron(req);
}

export async function POST(req: NextRequest) {
  return handleCron(req);
}
