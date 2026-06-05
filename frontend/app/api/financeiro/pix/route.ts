import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dbList } from "@/lib/db";
import { createMercadoPagoPix } from "@/lib/mercadopago-boleto";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return String(value || "").trim();
}

function lower(value: unknown) {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function isStudentSession(session: { perfil?: string }) {
  return lower(session.perfil).includes("aluno");
}

function sameStudentInvoice(row: Row, session: { usuario?: string; pessoa?: string }) {
  const invoiceKeys = [
    row.aluno_login,
    row.aluno_id,
    row.aluno,
    row.nome,
  ].map(lower).filter(Boolean);
  const sessionKeys = [
    session.usuario,
    session.pessoa,
  ].map(lower).filter(Boolean);
  return invoiceKeys.some((item) => sessionKeys.includes(item));
}

function errorHtml(title: string, message: string, detail?: string) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
    body{font-family:Arial,sans-serif;background:#f8fafc;color:#172033;margin:0;padding:40px}.box{max-width:760px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;box-shadow:0 18px 45px rgba(15,23,42,.08)}
    h1{font-size:22px;margin:0 0 10px}.muted{color:#64748b;line-height:1.55}.detail{margin-top:16px;padding:12px;border-radius:8px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412}
    textarea{width:100%;min-height:120px;margin-top:14px;border:1px solid #cbd5e1;border-radius:8px;padding:12px;font-family:monospace}
  </style></head><body><div class="box"><h1>${title}</h1><p class="muted">${message}</p>${detail ? `<div class="detail">${detail}</div>` : ""}</div></body></html>`;
  return new NextResponse(html, { status: 422, headers: { "content-type": "text/html; charset=utf-8" } });
}

function pixHtml(lancamento: Row) {
  const qrCode = text(lancamento.pix_qr_code);
  const qrCodeBase64 = text(lancamento.pix_qr_code_base64);
  const nome = text(lancamento.aluno || lancamento.nome || "Aluno");
  const valor = text(lancamento.valor_parcela || lancamento.valor);
  const img = qrCodeBase64 ? `<img alt="QR Code PIX" src="data:image/png;base64,${qrCodeBase64}" style="width:240px;height:240px;object-fit:contain;margin:10px auto;display:block">` : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>PIX Mercado Pago</title><style>
    body{font-family:Arial,sans-serif;background:#f8fafc;color:#172033;margin:0;padding:40px}.box{max-width:760px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;box-shadow:0 18px 45px rgba(15,23,42,.08)}
    h1{font-size:24px;margin:0 0 8px}.muted{color:#64748b;line-height:1.55}.label{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-top:18px}textarea{width:100%;min-height:120px;margin-top:8px;border:1px solid #cbd5e1;border-radius:8px;padding:12px;font-family:monospace}
  </style></head><body><div class="box"><h1>PIX Mercado Pago</h1><p class="muted">${nome}${valor ? ` - ${valor}` : ""}</p>${img}<div class="label">Copia e cola PIX</div><textarea readonly>${qrCode}</textarea></div></body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

async function findLancamento(id: string) {
  const recebimentos = await dbList<Row>("receivables.json");
  return recebimentos.find((r) => text(r.id) === id) || null;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });

  const lancamento = await findLancamento(id);
  if (!lancamento) return NextResponse.json({ error: "Lancamento nao encontrado" }, { status: 404 });
  if (isStudentSession(session) && !sameStudentInvoice(lancamento, session)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 403 });
  }

  const existingUrl = text(lancamento.pix_ticket_url);
  if (existingUrl.startsWith("http")) return NextResponse.redirect(existingUrl);
  if (text(lancamento.pix_qr_code)) return pixHtml(lancamento);

  const generated = await createMercadoPagoPix(lancamento, id, new URL(req.url).origin);
  if (generated.ok) {
    if (generated.url) return NextResponse.redirect(generated.url);
    const refreshed = await findLancamento(id);
    return pixHtml(refreshed || generated.lancamento || lancamento);
  }

  return errorHtml(generated.title, generated.message, generated.detail);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as Row;
  const id = text(body.id);
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });

  const lancamento = await findLancamento(id);
  if (!lancamento) return NextResponse.json({ error: "Lancamento nao encontrado" }, { status: 404 });

  const generated = await createMercadoPagoPix(lancamento, id, new URL(req.url).origin);
  if (!generated.ok) {
    return NextResponse.json({
      ok: false,
      title: generated.title,
      error: generated.message,
      detail: generated.detail,
    }, { status: 422 });
  }

  return NextResponse.json({
    ok: true,
    url: generated.url,
    qr_code: generated.qrCode,
    qr_code_base64: generated.qrCodeBase64,
    payment_id: generated.paymentId,
    lancamento: generated.lancamento,
  });
}
