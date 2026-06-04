import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dbList } from "@/lib/db";
import { findStudentForSession, sameStudentFinanceEntry } from "@/lib/student-finance";

function text(value: unknown) {
  return String(value || "").trim();
}

function isMercadoPagoUrl(value: unknown) {
  const url = text(value).toLowerCase();
  return url.startsWith("http") && (url.includes("mercadopago") || url.includes("mercado_pago"));
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatorio." }, { status: 400 });

  const lancamentos = await dbList<Record<string, unknown>>("receivables.json");
  const item = lancamentos.find((row) => text(row.id) === id);
  if (!item) return NextResponse.json({ error: "Boleto nao encontrado." }, { status: 404 });

  if (session.perfil.toLowerCase().includes("aluno")) {
    const aluno = findStudentForSession(await dbList<Record<string, unknown>>("students.json"), session);
    if (!sameStudentFinanceEntry(item, aluno, session)) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }
  }

  const mercadoPagoUrl = text(item.mercado_pago_ticket_url || item.boleto_url);
  if (isMercadoPagoUrl(mercadoPagoUrl)) return NextResponse.redirect(mercadoPagoUrl);

  const importado = req.nextUrl.searchParams.get("importado") === "true";
  if (!importado) {
    return NextResponse.redirect(new URL(`/api/financeiro/boleto?id=${encodeURIComponent(id)}`, req.url));
  }

  const b64 = text(item.boleto_pdf_b64);
  if (b64) {
    const buffer = Buffer.from(b64, "base64");
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": text(item.boleto_pdf_mime) || "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(text(item.boleto_pdf_nome) || `boleto-${id}.pdf`)}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  }

  const url = text(item.boleto_pdf_public_url || item.boleto_pdf_url);
  if (url && url !== req.nextUrl.pathname && url.startsWith("/uploads/")) {
    return NextResponse.redirect(new URL(url, req.url));
  }

  return NextResponse.json({ error: "PDF nao encontrado para este boleto." }, { status: 404 });
}
