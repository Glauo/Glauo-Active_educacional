import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { dbGet, dbList, dbSet } from "@/lib/db";

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

function isPaidStatus(status: unknown) {
  const value = lower(status);
  return value === "approved" || value === "paid" || value.includes("pago") || value.includes("baixado") || value.includes("liquidado");
}

function isOpenStatus(status: unknown) {
  return !isPaidStatus(status);
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

async function loadPayment(paymentId: string, token: string) {
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({})) as Row;
  if (!res.ok) throw new Error(text(data.message || data.error || `Mercado Pago HTTP ${res.status}`));
  return data;
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

function paymentMetadata(payment: Row) {
  return payment.metadata && typeof payment.metadata === "object" && !Array.isArray(payment.metadata)
    ? payment.metadata as Row
    : {};
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
    const payment = await loadPayment(paymentId, token);
    const metadata = paymentMetadata(payment);
    const externalReference = text(payment.external_reference || metadata.lancamento_id || metadata.external_reference);
    const status = text(payment.status);
    const statusDetail = text(payment.status_detail);
    const paid = isPaidStatus(status);
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    const recebimentos = await dbList<Row>("receivables.json");
    const idx = recebimentos.findIndex((item) =>
      text(item.id) === externalReference ||
      text(item.mercado_pago_payment_id) === paymentId ||
      text(item.mp_payment_id) === paymentId ||
      text(item.boleto_codigo) === paymentId
    );

    if (idx === -1) {
      await audit({
        acao: "mercado_pago_webhook_sem_lancamento",
        mercado_pago_payment_id: paymentId,
        external_reference: externalReference,
        status,
        status_detail: statusDetail,
      });
      return NextResponse.json({ ok: true, matched: false });
    }

    const before = recebimentos[idx];
    const paymentAmount = moneyNumber(payment.transaction_amount) || moneyNumber((payment.transaction_details as Row | undefined)?.total_paid_amount) || moneyNumber(before.valor_pago) || moneyNumber(before.valor_parcela) || moneyNumber(before.valor);
    const next = {
      ...before,
      mercado_pago_payment_id: paymentId,
      mp_payment_id: paymentId,
      mercado_pago_status: status,
      mp_status: status,
      mercado_pago_detail: statusDetail,
      mp_status_detail: statusDetail,
      mercado_pago_webhook_at: now,
      ...(paid ? {
        status: "Pago",
        situacao: "Pago",
        data_baixa: text(before.data_baixa) || today,
        valor_pago: text(before.valor_pago) || paymentAmount,
        forma_pagamento: "Boleto Mercado Pago",
        baixado_por: text(before.baixado_por) || "Mercado Pago",
      } : {
        status: isOpenStatus(before.status) ? before.status : "Pendente",
      }),
      updated_at: now,
      updated_by: "Mercado Pago",
    };

    const nextRecebimentos = recebimentos.map((item, index) => index === idx ? next : item);
    const writes: Promise<boolean>[] = [dbSet("receivables.json", nextRecebimentos)];

    if (paid && isOpenStatus(before.status)) {
      const receipts = await dbList<Row>("receipts.json");
      const alreadyReceipt = receipts.some((receipt) => text(receipt.mercado_pago_payment_id) === paymentId || text(receipt.autenticidade) === `AE-MP-${paymentId}`);
      if (!alreadyReceipt) {
        writes.push(dbSet("receipts.json", [
          ...receipts,
          {
            id: crypto.randomUUID(),
            lancamento_id: text(before.id),
            tipo: "recebimentos",
            pessoa: before.aluno || before.nome,
            descricao: before.descricao || "Mensalidade escolar",
            valor: before.valor,
            valor_pago: paymentAmount,
            forma_pagamento: "Boleto Mercado Pago",
            data: now,
            autenticidade: `AE-MP-${paymentId}`,
            gerado_automaticamente: true,
            mercado_pago_payment_id: paymentId,
          },
        ]));
      }
    }

    await Promise.all(writes);
    await audit({
      acao: paid && isOpenStatus(before.status) ? "baixar_pagamento_mercado_pago" : "atualizar_status_mercado_pago",
      tipo: "recebimentos",
      lancamento_id: before.id,
      mercado_pago_payment_id: paymentId,
      external_reference: externalReference,
      status,
      status_detail: statusDetail,
      assinatura_webhook_validada: signature.valid,
      antes: before,
      depois: next,
    });

    return NextResponse.json({ ok: true, matched: true, paid, status });
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
