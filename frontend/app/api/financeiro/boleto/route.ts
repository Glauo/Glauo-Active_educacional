import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dbList, dbSet } from "@/lib/db";
import { criarBoleteMercadoPago } from "@/lib/mercadopago";
import { realBoletoTicketUrl } from "@/lib/finance-boleto-links";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return String(value || "").trim();
}

function normalize(value: unknown) {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function asRow(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function firstPresent(...values: unknown[]) {
  return values.map(text).find(Boolean) || "";
}

function moneyNumber(value: unknown) {
  return Number.parseFloat(text(value).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
}

function expirationFrom(value: unknown) {
  const raw = text(value);
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : raw;
  return iso ? `${iso}T23:59:59.000-03:00` : undefined;
}

function findStudent(students: Row[], lancamento: Row) {
  const id = normalize(lancamento.aluno_id || lancamento.student_id || lancamento.id_aluno);
  const login = normalize(lancamento.aluno_login || lancamento.login || lancamento.usuario);
  const name = normalize(lancamento.aluno || lancamento.nome || lancamento.pagador);
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

function errorHtml(title: string, message: string, detail?: string) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
    body{font-family:Arial,sans-serif;background:#f8fafc;color:#172033;margin:0;padding:40px}.box{max-width:760px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;box-shadow:0 18px 45px rgba(15,23,42,.08)}
    h1{font-size:22px;margin:0 0 10px}.muted{color:#64748b;line-height:1.55}.detail{margin-top:16px;padding:12px;border-radius:8px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412}
  </style></head><body><div class="box"><h1>${title}</h1><p class="muted">${message}</p>${detail ? `<div class="detail">${detail}</div>` : ""}</div></body></html>`;
  return new NextResponse(html, { status: 422, headers: { "content-type": "text/html; charset=utf-8" } });
}

function importedPdfUrl(lancamento: Row, origin: string) {
  const pdfUrl = text(lancamento.boleto_pdf_url);
  if (!pdfUrl || pdfUrl.startsWith("http")) return "";
  if (pdfUrl.includes("boleto-pdf")) return pdfUrl.startsWith("/") ? `${origin}${pdfUrl}` : `${origin}/${pdfUrl}`;
  return "";
}

function mercadoPagoPayload(lancamento: Row, id: string, students: Row[], origin: string) {
  const student = findStudent(students, lancamento);
  const responsavel = asRow(student?.responsavel);
  const nomeAluno = firstPresent(lancamento.aluno, lancamento.nome, lancamento.pagador, student?.nome, student?.name, "Aluno Active");
  const nameParts = nomeAluno.split(/\s+/).filter(Boolean);
  return {
    transaction_amount: moneyNumber(lancamento.valor_parcela ?? lancamento.valor),
    description: text(lancamento.descricao) || `Mensalidade - ${nomeAluno}`,
    payer_email: firstPresent(
      lancamento.email,
      lancamento.aluno_email,
      lancamento.responsavel_email,
      lancamento.email_responsavel,
      student?.responsavel_email,
      student?.email_responsavel,
      responsavel.email,
      student?.aluno_email,
      student?.email
    ) || `aluno.${normalize(nomeAluno).replace(/\s+/g, ".") || id.slice(0, 8)}@activeeducacional.com.br`,
    payer_first_name: nameParts[0] || "Responsavel",
    payer_last_name: nameParts.slice(1).join(" ") || "Financeiro",
    payer_cpf: firstPresent(
      lancamento.cpf,
      lancamento.aluno_cpf,
      lancamento.responsavel_cpf,
      student?.cpf,
      student?.aluno_cpf,
      student?.responsavel_cpf,
      responsavel.cpf,
      responsavel.cnpj,
      student?.cnpj,
      lancamento.cnpj
    ),
    payer_address: {
      zip_code: firstPresent(lancamento.cep, lancamento.zip_code, student?.cep, student?.zip_code, responsavel.cep, responsavel.zip_code),
      street_name: firstPresent(lancamento.rua, lancamento.endereco, lancamento.street_name, student?.rua, student?.endereco, student?.street_name, responsavel.rua, responsavel.endereco, responsavel.street_name),
      street_number: firstPresent(lancamento.numero, lancamento.number, lancamento.street_number, student?.numero, student?.number, student?.street_number, responsavel.numero, responsavel.number, responsavel.street_number),
      neighborhood: firstPresent(lancamento.bairro, lancamento.neighborhood, student?.bairro, student?.neighborhood, responsavel.bairro, responsavel.neighborhood),
      city: firstPresent(lancamento.cidade, lancamento.city, student?.cidade, student?.city, responsavel.cidade, responsavel.city),
      federal_unit: firstPresent(lancamento.estado, lancamento.uf, lancamento.federal_unit, student?.estado, student?.uf, student?.federal_unit, responsavel.estado, responsavel.uf, responsavel.federal_unit),
    },
    date_of_expiration: expirationFrom(lancamento.vencimento || lancamento.data_vencimento),
    external_reference: id,
    notification_url: text(process.env.ACTIVE_MERCADO_PAGO_WEBHOOK_URL || process.env.MERCADO_PAGO_WEBHOOK_URL) || `${origin}/api/financeiro/mercado-pago/webhook`,
  };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });

  const recebimentos = await dbList<Row>("receivables.json");
  const lancamento = recebimentos.find((r) => text(r.id) === id);
  if (!lancamento) return NextResponse.json({ error: "Boleto nao encontrado" }, { status: 404 });

  if (session.perfil === "Aluno" && text(lancamento.aluno || lancamento.nome) !== session.pessoa) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 403 });
  }

  const origin = new URL(req.url).origin;
  const mercadoPagoUrl = realBoletoTicketUrl(lancamento);
  if (mercadoPagoUrl.startsWith("http")) return NextResponse.redirect(mercadoPagoUrl);

  const pixUrl = text(lancamento.pix_url);
  if (pixUrl.startsWith("http")) return NextResponse.redirect(pixUrl);

  const externalPdf = text(lancamento.boleto_pdf_url || lancamento.boleto_pdf_public_url);
  if (externalPdf.startsWith("http")) return NextResponse.redirect(externalPdf);

  const importedPdf = importedPdfUrl(lancamento, origin);
  if (importedPdf) return NextResponse.redirect(importedPdf);

  const students = await dbList<Row>("students.json");
  const generated = await criarBoleteMercadoPago(mercadoPagoPayload(lancamento, id, students, origin));
  if (!generated.ok) {
    return errorHtml(
      "Falha ao gerar boleto Mercado Pago",
      generated.error || "Nao foi possivel gerar o boleto real no Mercado Pago.",
      "Verifique o Access Token, CPF/CNPJ, e-mail, endereco do pagador e valor do lancamento."
    );
  }

  await dbSet("receivables.json", recebimentos.map((item) => text(item.id) === id ? {
    ...item,
    mercado_pago_ticket_url: generated.boleto_url,
    boleto_url: generated.boleto_url,
    boleto_codigo: generated.barcode || text(item.boleto_codigo),
    boleto_linha_digitavel: generated.digitable_line || generated.barcode || "",
    boleto_status: "Mercado Pago",
    mp_payment_id: generated.payment_id,
    mp_status: generated.status,
    mp_status_detail: generated.status_detail,
    mp_date_of_expiration: generated.date_of_expiration,
    boleto_gerado_em: new Date().toISOString(),
    boleto_erro: "",
  } : item));

  return generated.boleto_url
    ? NextResponse.redirect(generated.boleto_url)
    : errorHtml("Boleto gerado sem URL", "O Mercado Pago criou o pagamento, mas nao retornou link do boleto.");
}
