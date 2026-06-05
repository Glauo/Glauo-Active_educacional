import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { dbGet, dbList, dbSet } from "@/lib/db";
import { syncMercadoPagoPayment } from "@/lib/mercadopago-sync";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return String(value || "").trim();
}

function lower(value: unknown) {
  return text(value).toLowerCase();
}

function moneyNumber(value: unknown) {
  const n = parseFloat(String(value || "0").replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Number(n.toFixed(2)) : 0;
}

function parseSignature(header: string) {
  const parts = Object.fromEntries(header.split(",").map((part) => {
    const [key, ...rest] = part.trim().split("=");
    return [key, rest.join("=")];
  }));
  return { ts: text(parts.ts), v1: text(parts.v1) };
}

function safeCompareHex(a: string, b: string) {
  if (!/^[a-f0-9]+$/i.test(a) || !/^[a-f0-9]+$/i.test(b)) return false;
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function boletoToken(config: Row | null) {
  return text(
    process.env.ACTIVE_MERCADO_PAGO_ACCESS_TOKEN ||
    process.env.MERCADO_PAGO_ACCESS_TOKEN ||
    process.env.MP_ACCESS_TOKEN ||
    config?.mercado_pago_access_token ||
    config?.MERCADO_PAGO_ACCESS_TOKEN ||
    config?.mp_access_token ||
    config?.access_token ||
    config?.api_key
  );
}

function webhookSecret(config: Row | null) {
  return text(
    process.env.ACTIVE_MERCADO_PAGO_WEBHOOK_SECRET ||
    process.env.MERCADO_PAGO_WEBHOOK_SECRET ||
    config?.mercado_pago_webhook_secret ||
    config?.webhook_secret
  );
}

async function audit(entry: Row) {
  const log = await dbList<Row>("finance_audit.json");
  await dbSet("finance_audit.json", [
    ...log,
    { id: crypto.randomUUID(), data: new Date().toISOString(), ...entry },
  ]);
}

function verifySignature(req: NextRequest, dataId: string, secret: string) {
  const signature = text(req.headers.get("x-signature"));
  const requestId = text(req.headers.get("x-request-id"));
  if (!secret) return { configured: false, valid: true, reason: "secret_not_configured" };
  if (!signature || !requestId || !dataId) return { configured: true, valid: false, reason: "headers_missing" };
  const { ts, v1 } = parseSignature(signature);
  if (!ts || !v1) return { configured: true, valid: false, reason: "signature_malformed" };
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  return { configured: true, valid: safeCompareHex(expected, v1), reason: "checked" };
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "mercado-pago-webhook" });
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const body = await req.json().catch(() => ({})) as Row;
  const data = (body.data || {}) as Row;
  const paymentId = text(data.id || url.searchParams.get("data.id") || url.searchParams.get("id"));
  const topic = lower(body.type || body.topic || url.searchParams.get("type") || url.searchParams.get("topic"));

  if (body.live_mode === false || paymentId === "123456") {
    return NextResponse.json({ ok: true, test: true });
  }

  if (!paymentId || (topic && !topic.includes("payment"))) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const config = await dbGet<Row>("boleto_config.json");
  const token = boletoToken(config);
  if (!token) return NextResponse.json({ error: "Mercado Pago Access Token nao configurado." }, { status: 500 });

  const signature = verifySignature(req, paymentId, webhookSecret(config));
  if (signature.configured && !signature.valid) {
    await audit({
      acao: "mercado_pago_webhook_assinatura_nao_validada",
      mercado_pago_payment_id: paymentId,
      motivo: signature.reason,
    });
  }

  try {
    const result = await syncMercadoPagoPayment(paymentId, "webhook");
    await audit({
      acao: "mercado_pago_webhook_processado",
      mercado_pago_payment_id: paymentId,
      matched: result.matched,
      paid: result.paid,
      status: result.status,
      assinatura_webhook_validada: signature.valid,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[mercado-pago webhook]", err);
    await audit({
      acao: "mercado_pago_webhook_erro",
      mercado_pago_payment_id: paymentId,
      erro: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Erro ao processar webhook Mercado Pago." }, { status: 500 });
  }
}
