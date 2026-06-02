import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dbList } from "@/lib/db";
import { createMercadoPagoBoleto } from "@/lib/mercadopago-boleto";
import { sendWhatsApp } from "@/lib/whatsapp";

function text(value: unknown) {
  return String(value || "").trim();
}

async function replaceInternalBoletoLinks(message: string, origin: string) {
  const matches = Array.from(message.matchAll(/(?:https?:\/\/[^/\s]+)?\/api\/financeiro\/boleto(?:-pdf)?\?id=([A-Za-z0-9._-]+)/g));
  if (matches.length === 0) return message;

  let next = message;
  const receivables = await dbList<Record<string, unknown>>("receivables.json");
  for (const match of matches) {
    const id = decodeURIComponent(match[1] || "");
    const currentUrl = match[0];
    if (!id || !currentUrl) continue;

    const lancamento = receivables.find((item) => text(item.id) === id);
    if (!lancamento) continue;

    const existing = text(lancamento.mercado_pago_ticket_url || lancamento.boleto_url);
    if (existing.startsWith("http")) {
      next = next.replaceAll(currentUrl, existing);
      continue;
    }

    const generated = await createMercadoPagoBoleto(lancamento, id, origin);
    if (generated.ok) next = next.replaceAll(currentUrl, generated.url);
  }
  return next;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });

  try {
    const body = await req.json();
    const telefone = text(body.telefone || body.whatsapp || body.numero);
    const mensagem = text(body.mensagem || body.message);
    if (!telefone || !mensagem) {
      return NextResponse.json({ error: "Telefone e mensagem sao obrigatorios." }, { status: 400 });
    }

    const finalMessage = await replaceInternalBoletoLinks(mensagem, new URL(req.url).origin);
    const result = await sendWhatsApp(telefone, finalMessage, session);
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (err) {
    console.error("[whatsapp/send POST]", err);
    return NextResponse.json({ error: "Erro ao enviar WhatsApp." }, { status: 500 });
  }
}
