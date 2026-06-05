import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dbList, dbSet } from "@/lib/db";
import { createMercadoPagoBoleto } from "@/lib/mercadopago-boleto";
import { extractBoletoPdfUrl, extractLinhaDigitavel } from "@/lib/criar-pagamento-boleto";
import { loadMercadoPagoPayment } from "@/lib/mercadopago-sync";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return String(value || "").trim();
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

function isMercadoPagoUrl(value: unknown) {
  const url = text(value).toLowerCase();
  return url.startsWith("http") && (url.includes("mercadopago") || url.includes("mercado_pago"));
}

function sameStudentInvoice(row: Row, session: { usuario?: string; pessoa?: string }) {
  const invoiceKeys = [
    row.aluno_login,
    row.aluno_id,
    row.aluno,
    row.nome,
  ].map((value) => text(value).toLowerCase()).filter(Boolean);
  const sessionKeys = [
    session.usuario,
    session.pessoa,
  ].map((value) => text(value).toLowerCase()).filter(Boolean);
  return invoiceKeys.some((item) => sessionKeys.includes(item));
}

function boletoFallbackHtml(lancamento: Row, payment: Row | null) {
  const nome = text(lancamento.aluno || lancamento.nome || "Aluno");
  const valor = text(lancamento.valor_parcela || lancamento.valor);
  const linha = text(lancamento.boleto_linha_digitavel || (payment ? extractLinhaDigitavel(payment) : ""));
  const status = text((payment?.status as unknown) || lancamento.mercado_pago_status || "pending");
  const detail = text((payment?.status_detail as unknown) || lancamento.mercado_pago_detail);
  const paymentId = text(payment?.id || lancamento.mercado_pago_payment_id || lancamento.boleto_codigo);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Boleto Mercado Pago</title><style>
    body{font-family:Arial,sans-serif;background:#f8fafc;color:#172033;margin:0;padding:40px}.box{max-width:760px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;box-shadow:0 18px 45px rgba(15,23,42,.08)}
    h1{font-size:22px;margin:0 0 10px}.muted{color:#64748b;line-height:1.55}.label{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-top:18px}textarea{width:100%;min-height:92px;margin-top:8px;border:1px solid #cbd5e1;border-radius:8px;padding:12px;font-family:monospace}
  </style></head><body><div class="box"><h1>Boleto Mercado Pago</h1><p class="muted">${nome}${valor ? ` - ${valor}` : ""}</p><p class="muted">Status do pagamento no Mercado Pago: <strong>${status}</strong>${detail ? ` (${detail})` : ""}</p>${paymentId ? `<p class="muted">Pagamento MP: <strong>${paymentId}</strong></p>` : ""}${linha ? `<div class="label">Linha digitavel</div><textarea readonly>${linha}</textarea>` : `<p class="muted">O boleto foi criado, mas o Mercado Pago ainda nao devolveu um link publico para abertura. Tente novamente em alguns instantes ou use o botao Verificar pagamento no financeiro.</p>`}</div></body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });

  const recebimentos = await dbList<Row>("receivables.json");
  const lancamento = recebimentos.find((r) => text(r.id) === id);
  if (!lancamento) return NextResponse.json({ error: "Boleto nao encontrado" }, { status: 404 });
  if (session.perfil === "Aluno" && !sameStudentInvoice(lancamento, session)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 403 });
  }

  const origin = new URL(req.url).origin;
  const mercadoPagoUrl = text(lancamento.mercado_pago_ticket_url || lancamento.boleto_url);
  if (isMercadoPagoUrl(mercadoPagoUrl)) return NextResponse.redirect(mercadoPagoUrl);

  const externalPdf = text(lancamento.boleto_pdf_url);
  if (isMercadoPagoUrl(externalPdf)) return NextResponse.redirect(externalPdf);

  const paymentId = text(lancamento.mercado_pago_payment_id || lancamento.mp_payment_id || lancamento.boleto_codigo);
  if (paymentId) {
    try {
      const payment = await loadMercadoPagoPayment(paymentId);
      const recoveredUrl = text(extractBoletoPdfUrl(payment));
      const recoveredLinha = text(extractLinhaDigitavel(payment));
      if (recoveredUrl) {
        const nextRecebimentos = recebimentos.map((item) => text(item.id) === id ? {
          ...item,
          mercado_pago_ticket_url: recoveredUrl,
          boleto_url: recoveredUrl,
          boleto_pdf_url: recoveredUrl,
          boleto_linha_digitavel: recoveredLinha || item.boleto_linha_digitavel,
          mercado_pago_status: text(payment.status || item.mercado_pago_status),
          mercado_pago_detail: text(payment.status_detail || item.mercado_pago_detail),
          last_payment_check_at: new Date().toISOString(),
        } : item);
        await dbSet("receivables.json", nextRecebimentos);
        return NextResponse.redirect(recoveredUrl);
      }
      return boletoFallbackHtml(lancamento, payment);
    } catch {
      return boletoFallbackHtml(lancamento, null);
    }
  }

  const generated = await createMercadoPagoBoleto(lancamento, id, origin);
  if (generated.ok) {
    if (generated.url) return NextResponse.redirect(generated.url);
    const refreshed = (await dbList<Row>("receivables.json")).find((item) => text(item.id) === id) || lancamento;
    return boletoFallbackHtml(refreshed, null);
  }

  const importedPdf = importedPdfUrl(lancamento, origin);
  if (importedPdf && new URL(req.url).searchParams.get("importado") === "true") return NextResponse.redirect(importedPdf);

  return errorHtml(generated.title, generated.message, generated.detail);
}
