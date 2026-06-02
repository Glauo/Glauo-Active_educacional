import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dbList } from "@/lib/db";
import { createMercadoPagoBoleto } from "@/lib/mercadopago-boleto";

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
  const mercadoPagoUrl = text(lancamento.mercado_pago_ticket_url || lancamento.boleto_url);
  if (mercadoPagoUrl.startsWith("http")) return NextResponse.redirect(mercadoPagoUrl);

  const externalPdf = text(lancamento.boleto_pdf_url);
  if (isMercadoPagoUrl(externalPdf)) return NextResponse.redirect(externalPdf);

  const generated = await createMercadoPagoBoleto(lancamento, id, origin);
  if (generated.ok) return NextResponse.redirect(generated.url);

  const importedPdf = importedPdfUrl(lancamento, origin);
  if (importedPdf && new URL(req.url).searchParams.get("importado") === "true") return NextResponse.redirect(importedPdf);

  return errorHtml(generated.title, generated.message, generated.detail);
}
