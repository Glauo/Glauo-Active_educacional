import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dbList, dbUpdate } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { financeMessage } from "@/lib/finance-message";
import { createMercadoPagoBoleto, createMercadoPagoPix } from "@/lib/mercadopago-boleto";
import { sendWhatsApp } from "@/lib/whatsapp";

type Row = Record<string, unknown>;

function text(value: unknown) { return String(value || "").trim(); }

function normalize(value: unknown) {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function phoneOf(row: Row) {
  const responsavel = row.responsavel && typeof row.responsavel === "object" ? row.responsavel as Row : {};
  return text(
    row.telefone || row.whatsapp || row.celular || row.aluno_telefone || row.responsavel_telefone ||
    row.telefone_responsavel || row.celular_responsavel || row.whatsapp_responsavel ||
    responsavel.telefone || responsavel.celular || responsavel.whatsapp
  );
}

function findStudent(students: Row[], lancamento: Row) {
  const alunoId = text(lancamento.aluno_id);
  const alunoLogin = text(lancamento.aluno_login);
  const alunoNome = normalize(lancamento.aluno || lancamento.nome);
  return students.find((student) =>
    (alunoId && text(student.id) === alunoId) ||
    (alunoLogin && [student.login, student.usuario, student.email].map(text).includes(alunoLogin)) ||
    (alunoNome && [student.nome, student.name].map(normalize).includes(alunoNome))
  );
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    canal?: "whatsapp" | "email" | "ambos";
    telefone?: string;
    email?: string;
    assunto?: string;
    mensagem?: string;
    lancamento_id?: string;
    documento?: "boleto" | "pix";
  };
  const canal = body.canal || "whatsapp";
  let telefone = text(body.telefone);
  let email = text(body.email);
  let assunto = text(body.assunto) || "Ativo Educacional";
  let mensagem = text(body.mensagem);

  if (text(body.lancamento_id)) {
    const id = text(body.lancamento_id);
    const documento = body.documento === "pix" ? "pix" : "boleto";
    let lancamento = (await dbList<Row>("receivables.json")).find((item) => text(item.id) === id);
    if (!lancamento) return NextResponse.json({ error: "Lancamento financeiro nao encontrado." }, { status: 404 });

    const status = text(lancamento.status || lancamento.situacao).toLowerCase();
    if (status.includes("pago") || status.includes("baixado") || status.includes("liquidado")) {
      return NextResponse.json({ error: "Esta parcela ja esta paga e nao pode ser cobrada." }, { status: 422 });
    }

    const origin = new URL(req.url).origin;
    const hasBoleto = text(lancamento.mercado_pago_ticket_url || lancamento.boleto_url).startsWith("http");
    const hasPix = Boolean(text(lancamento.pix_ticket_url || lancamento.pix_qr_code));
    const generated = documento === "pix"
      ? (!hasPix ? await createMercadoPagoPix(lancamento, id, origin) : null)
      : (!hasBoleto ? await createMercadoPagoBoleto(lancamento, id, origin) : null);
    if (generated && !generated.ok) {
      return NextResponse.json({ error: generated.message, title: generated.title, detail: generated.detail }, { status: 422 });
    }
    if (generated?.ok) {
      lancamento = (await dbList<Row>("receivables.json")).find((item) => text(item.id) === id) || generated.lancamento || lancamento;
    }

    const student = findStudent(await dbList<Row>("students.json"), lancamento);
    const studentPhone = student ? phoneOf(student) : "";
    const studentEmail = student ? text(student.email || student.email_responsavel || student.responsavel_email) : "";
    const contact = {
      ...student,
      ...lancamento,
      telefone: phoneOf(lancamento) || studentPhone,
      email: text(lancamento.email || lancamento.aluno_email || lancamento.responsavel_email || lancamento.email_responsavel) || studentEmail,
    } as Row;
    telefone = telefone || phoneOf(contact);
    email = email || text(contact.email || contact.aluno_email || contact.responsavel_email || contact.email_responsavel);
    const message = financeMessage(contact, origin, documento);
    mensagem = mensagem || message.body;
    assunto = text(body.assunto) || message.subject;

    if (!telefone && (canal === "whatsapp" || canal === "ambos")) {
      return NextResponse.json({ error: "WhatsApp nao encontrado no lancamento nem no cadastro do aluno/responsavel." }, { status: 422 });
    }

    await dbUpdate<Row[]>("receivables.json", (items) => (Array.isArray(items) ? items : []).map((item) => text(item.id) === id ? {
      ...item,
      telefone: text(item.telefone) || telefone,
      email: text(item.email) || email,
    } : item), []);
  }

  if (!mensagem) return NextResponse.json({ error: "Mensagem obrigatoria." }, { status: 400 });
  const results: Record<string, string> = {};

  if (canal === "whatsapp" || canal === "ambos") {
    if (telefone) results.whatsapp = (await sendWhatsApp(telefone, mensagem, session)).status;
    else results.whatsapp = "sem telefone cadastrado";
  }
  if (canal === "email" || canal === "ambos") {
    if (email) results.email = (await sendEmail(email, assunto, mensagem, session)).status;
    else results.email = "sem email cadastrado";
  }

  const ok = Object.values(results).some((value) => /enviado|enviada|ok|success|sent|queued|accepted|250/i.test(value));
  return NextResponse.json({ ok, results });
}
