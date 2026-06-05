import { dbGet, dbList, dbSet } from "@/lib/db";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return String(value || "").trim();
}

function lower(value: unknown) {
  return text(value).toLowerCase();
}

function asRow(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function moneyNumber(value: unknown) {
  const raw = text(value).replace(/[^\d.,-]/g, "");
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function toIsoDate(value: unknown, fallbackIso: string) {
  const parsed = new Date(text(value) || fallbackIso);
  return Number.isNaN(parsed.getTime()) ? fallbackIso.slice(0, 10) : parsed.toISOString().slice(0, 10);
}

function isSettledStatus(status: unknown) {
  const value = lower(status);
  return value.includes("pago") || value.includes("baixado") || value.includes("liquidado") || value === "approved";
}

function paymentMetadata(payment: Row) {
  return payment.metadata && typeof payment.metadata === "object" && !Array.isArray(payment.metadata)
    ? payment.metadata as Row
    : {};
}

function paymentMethodId(payment: Row) {
  const method = payment.payment_method && typeof payment.payment_method === "object" && !Array.isArray(payment.payment_method)
    ? payment.payment_method as Row
    : {};
  return lower(payment.payment_method_id || method.id);
}

function paymentMethodLabel(payment: Row) {
  const methodId = paymentMethodId(payment);
  if (methodId === "pix") return "Pix Mercado Pago";
  if (methodId.includes("bol")) return "Boleto Mercado Pago";
  return text((payment.payment_method as Row | undefined)?.type || methodId || "Mercado Pago");
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

async function audit(entry: Row) {
  const log = await dbList<Row>("finance_audit.json");
  await dbSet("finance_audit.json", [
    ...log,
    { id: crypto.randomUUID(), data: new Date().toISOString(), ...entry },
  ]);
}

export async function loadMercadoPagoPayment(paymentId: string) {
  const config = await dbGet<Row>("boleto_config.json");
  const token = boletoToken(config);
  if (!token) {
    throw new Error("Mercado Pago Access Token nao configurado.");
  }

  const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({})) as Row;
  if (!res.ok) {
    throw new Error(text(data.message || data.error || `Mercado Pago HTTP ${res.status}`));
  }
  return data;
}

function mappedFinanceStatus(status: string) {
  switch (lower(status)) {
    case "approved":
      return "Pago";
    case "pending":
      return "Pendente";
    case "in_process":
      return "Em processamento";
    case "rejected":
      return "Recusada";
    case "cancelled":
      return "Cancelada";
    case "refunded":
      return "Estornada";
    case "charged_back":
      return "Contestada";
    default:
      return "Pendente";
  }
}

function candidateReferences(payment: Row) {
  const metadata = paymentMetadata(payment);
  const additional = asRow(payment.additional_info);
  const payer = asRow(payment.payer);
  const payerIdentification = asRow(payer.identification);
  return Array.from(new Set([
    payment.id,
    payment.external_reference,
    metadata.lancamento_id,
    metadata.external_reference,
    metadata.invoice_id,
    metadata.installment_id,
    additional.external_reference,
    additional.items && Array.isArray(additional.items) ? (additional.items[0] as Row | undefined)?.id : "",
    payer.email,
    payerIdentification.number,
  ].map(text).filter(Boolean)));
}

function findReceivableIndex(receivables: Row[], payment: Row, paymentId: string) {
  const refs = candidateReferences(payment);
  return receivables.findIndex((item) => {
    const itemRefs = [
      item.id,
      item.external_reference,
      item.payment_external_reference,
      item.mercado_pago_payment_id,
      item.mp_payment_id,
      item.boleto_codigo,
      item.pix_codigo,
      item.aluno_id,
      item.aluno_login,
      item.email,
      item.aluno_email,
      item.cpf,
      item.cpf_aluno,
      item.responsavel_cpf,
    ].map(text).filter(Boolean);
    return itemRefs.includes(paymentId) || refs.some((ref) => itemRefs.includes(ref));
  });
}

export type MercadoPagoSyncResult = {
  ok: true;
  matched: boolean;
  paid: boolean;
  paymentId: string;
  status: string;
  lancamento?: Row;
}

export async function syncMercadoPagoPayment(paymentId: string, source: "webhook" | "manual") : Promise<MercadoPagoSyncResult> {
  const payment = await loadMercadoPagoPayment(paymentId);
  const metadata = paymentMetadata(payment);
  const externalReference = text(payment.external_reference || metadata.lancamento_id || metadata.external_reference);
  const status = lower(payment.status);
  const statusDetail = text(payment.status_detail);
  const paid = status === "approved";
  const now = new Date().toISOString();
  const receivables = await dbList<Row>("receivables.json");
  const idx = findReceivableIndex(receivables, payment, paymentId);

  await audit({
    acao: source === "webhook" ? "mercado_pago_webhook_recebido" : "mercado_pago_verificacao_manual",
    mercado_pago_payment_id: paymentId,
    external_reference: externalReference,
    status,
    status_detail: statusDetail,
  });

  if (idx === -1) {
    await audit({
      acao: "mercado_pago_pagamento_sem_lancamento",
      mercado_pago_payment_id: paymentId,
      external_reference: externalReference,
      status,
      status_detail: statusDetail,
      origem: source,
    });
    return { ok: true, matched: false, paid, paymentId, status };
  }

  const before = receivables[idx];
  const paymentDate = toIsoDate(payment.date_approved || payment.date_last_updated || payment.date_created, now);
  const paidAmount =
    moneyNumber((payment.transaction_details as Row | undefined)?.total_paid_amount) ||
    moneyNumber(payment.transaction_amount) ||
    moneyNumber(before.valor_pago) ||
    moneyNumber(before.valor_parcela) ||
    moneyNumber(before.valor);
  const nextStatus = mappedFinanceStatus(status);
  const alreadySettled = isSettledStatus(before.status || before.situacao);

  const next: Row = {
    ...before,
    external_reference: externalReference || text(before.external_reference || before.id),
    payment_status: status,
    mercado_pago_status: status,
    mp_status: status,
    mercado_pago_detail: statusDetail,
    mp_status_detail: statusDetail,
    mercado_pago_payment_id: paymentId,
    mp_payment_id: paymentId,
    mercado_pago_payment_method: paymentMethodId(payment),
    payment_method: paymentMethodLabel(payment),
    webhook_received_at: source === "webhook" ? now : text(before.webhook_received_at),
    mercado_pago_webhook_at: source === "webhook" ? now : text(before.mercado_pago_webhook_at),
    last_payment_check_at: now,
    paid_amount: paidAmount || moneyNumber(before.paid_amount || before.valor_pago),
    paid_at: paid ? paymentDate : text(before.paid_at),
    updated_at: now,
    updated_by: source === "webhook" ? "Mercado Pago" : "Verificacao manual Mercado Pago",
  };

  if (paid) {
    next.status = "Pago";
    next.situacao = "Pago";
    next.data_baixa = text(before.data_baixa) || paymentDate;
    next.valor_pago = paidAmount || text(before.valor_pago);
    next.forma_pagamento = paymentMethodLabel(payment);
    next.baixado_por = text(before.baixado_por) || "Mercado Pago";
  } else {
    next.status = nextStatus;
    next.situacao = nextStatus;
    if (!alreadySettled) {
      next.forma_pagamento = text(before.forma_pagamento);
    }
  }

  const nextReceivables = receivables.map((item, index) => index === idx ? next : item);
  const writes: Promise<boolean>[] = [dbSet("receivables.json", nextReceivables)];

  if (paid) {
    const receipts = await dbList<Row>("receipts.json");
    const alreadyReceipt = receipts.some((receipt) =>
      text(receipt.mercado_pago_payment_id) === paymentId ||
      text(receipt.autenticidade) === `AE-MP-${paymentId}`
    );
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
          valor_pago: paidAmount,
          forma_pagamento: paymentMethodLabel(payment),
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
    acao: paid && !alreadySettled ? "baixar_pagamento_mercado_pago" : "atualizar_status_mercado_pago",
    origem: source,
    tipo: "recebimentos",
    lancamento_id: before.id,
    mercado_pago_payment_id: paymentId,
    external_reference: externalReference,
    status,
    status_detail: statusDetail,
    antes: before,
    depois: next,
  });

  return { ok: true, matched: true, paid, paymentId, status, lancamento: next };
}
