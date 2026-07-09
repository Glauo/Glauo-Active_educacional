import { dbGet, dbList, dbSet, dbUpdate } from "@/lib/db";
import { releaseStudentAccessAfterPayment } from "@/lib/student-payment-automation";

type Row = Record<string, unknown>;
type ReconcileState = {
  running_until?: string;
  last_run_started_at?: string;
  last_run_completed_at?: string;
  last_run_result?: {
    checked: number;
    matched: number;
    paid: number;
    errors: number;
  };
};
type ReconcileOptions = {
  limit?: number;
  minIntervalMs?: number;
  lockMs?: number;
  force?: boolean;
};
const RECONCILE_STATE_KEY = "mercado_pago_reconcile_state.json";

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

function isManualSettlementLocked(row: Row) {
  return Boolean(row.mercado_pago_manual_lock) && isSettledStatus(row.status || row.situacao);
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
  await dbUpdate<Row[]>("finance_audit.json", (log) => [
    ...(Array.isArray(log) ? log : []),
    { id: crypto.randomUUID(), data: new Date().toISOString(), ...entry },
  ], []);
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
  const exact = Array.from(new Set([
    payment.id,
    payment.external_reference,
    metadata.lancamento_id,
    metadata.external_reference,
    metadata.invoice_id,
    metadata.installment_id,
    additional.external_reference,
    additional.items && Array.isArray(additional.items) ? (additional.items[0] as Row | undefined)?.id : "",
  ].map(text).filter(Boolean)));
  const student = Array.from(new Set([
    metadata.aluno_id,
    metadata.aluno_login,
    metadata.aluno,
    payer.email,
    payerIdentification.number,
  ].map(text).filter(Boolean)));
  return { exact, student };
}

function findReceivableIndex(receivables: Row[], payment: Row, paymentId: string) {
  const refs = candidateReferences(payment);
  const exactMatch = receivables.findIndex((item) => {
    const itemRefs = [
      item.id,
      item.external_reference,
      item.payment_external_reference,
      item.mercado_pago_payment_id,
      item.mercado_pago_previous_payment_id,
      item.mp_payment_id,
      item.boleto_codigo,
      item.pix_codigo,
    ].map(text).filter(Boolean);
    return itemRefs.includes(paymentId) || refs.exact.some((ref) => itemRefs.includes(ref));
  });
  if (exactMatch >= 0) return exactMatch;

  const amount = moneyNumber(payment.transaction_amount);
  const studentMatches = receivables
    .map((item, index) => {
      const studentRefs = [
        item.aluno_id,
        item.aluno_login,
        item.email,
        item.aluno_email,
        item.cpf,
        item.cpf_aluno,
        item.responsavel_cpf,
      ].map(text).filter(Boolean);
      const itemAmount =
        moneyNumber(item.valor_parcela) ||
        moneyNumber(item.valor) ||
        moneyNumber(item.valor_total);
      const sameStudent = refs.student.some((ref) => studentRefs.includes(ref));
      const sameAmount = amount > 0 && itemAmount > 0 && Math.abs(itemAmount - amount) < 0.01;
      return sameStudent && sameAmount ? index : -1;
    })
    .filter((index) => index >= 0);

  return studentMatches.length === 1 ? studentMatches[0] : -1;
}

export type MercadoPagoSyncResult = {
  ok: true;
  matched: boolean;
  paid: boolean;
  paymentId: string;
  status: string;
  lancamento?: Row;
}

function isOpenFinanceStatus(status: unknown) {
  const value = lower(status);
  return !value || (!value.includes("pago") && !value.includes("baixado") && !value.includes("liquidado") && !value.includes("cancel") && !value.includes("estorn") && !value.includes("contest"));
}

function isTerminalMercadoPagoStatus(status: unknown) {
  const value = lower(status);
  return value === "approved" || value === "rejected" || value === "cancelled" || value === "refunded" || value === "charged_back";
}

function minutesSince(value: unknown) {
  const raw = text(value);
  if (!raw) return Number.POSITIVE_INFINITY;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - parsed.getTime()) / 60000);
}

function msSince(value: unknown) {
  const raw = text(value);
  if (!raw) return Number.POSITIVE_INFINITY;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return Number.POSITIVE_INFINITY;
  return Date.now() - parsed.getTime();
}

function isLockActive(state: ReconcileState | null) {
  const until = text(state?.running_until);
  if (!until) return false;
  const parsed = new Date(until);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now();
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
  const manualSettlementLocked = isManualSettlementLocked(before);

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
  } else if (!manualSettlementLocked) {
    next.status = nextStatus;
    next.situacao = nextStatus;
    if (!alreadySettled) {
      next.forma_pagamento = text(before.forma_pagamento);
    }
  }

  const writes: Promise<unknown>[] = [
    dbUpdate<Row[]>("receivables.json", (current) => {
      const latest = Array.isArray(current) ? current : [];
      const currentIdx = latest.findIndex((item) => text(item.id) === text(before.id));
      if (currentIdx === -1) return latest;
      return latest.map((item, index) => index === currentIdx ? { ...item, ...next } : item);
    }, []),
  ];

  if (paid) {
    const receipts = await dbList<Row>("receipts.json");
    const alreadyReceipt = receipts.some((receipt) =>
      text(receipt.mercado_pago_payment_id) === paymentId ||
      text(receipt.autenticidade) === `AE-MP-${paymentId}`
    );
    if (!alreadyReceipt) {
      writes.push(dbUpdate<Row[]>("receipts.json", (current) => [
        ...(Array.isArray(current) ? current : receipts),
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
      ], receipts));
    }
  }

  await Promise.all(writes);

  let releaseResult: Row | null = null;
  if (paid) {
    releaseResult = await releaseStudentAccessAfterPayment(next, paymentId) as unknown as Row;
  }

  await audit({
    acao: manualSettlementLocked && !paid
      ? "ignorar_status_mercado_pago_por_baixa_manual"
      : paid && !alreadySettled
        ? "baixar_pagamento_mercado_pago"
        : "atualizar_status_mercado_pago",
    origem: source,
    tipo: "recebimentos",
    lancamento_id: before.id,
    mercado_pago_payment_id: paymentId,
    external_reference: externalReference,
    status,
    status_detail: statusDetail,
    liberacao_aluno: releaseResult || {},
    antes: before,
    depois: next,
  });

  return { ok: true, matched: true, paid, paymentId, status, lancamento: next };
}

export async function reconcileMercadoPagoPendingReceivables(input: number | ReconcileOptions = 12) {
  const options = typeof input === "number" ? { limit: input } : input;
  const limit = Math.max(0, options.limit ?? 12);
  const minIntervalMs = Math.max(0, options.minIntervalMs ?? 90_000);
  const lockMs = Math.max(10_000, options.lockMs ?? 120_000);
  const force = Boolean(options.force);
  const state = await dbGet<ReconcileState>(RECONCILE_STATE_KEY);
  if (!force) {
    if (isLockActive(state)) {
      return {
        checked: 0,
        matched: 0,
        paid: 0,
        errors: 0,
        skipped: true,
        reason: "lock_active",
      };
    }
    if (msSince(state?.last_run_started_at || state?.last_run_completed_at) < minIntervalMs) {
      return {
        checked: 0,
        matched: 0,
        paid: 0,
        errors: 0,
        skipped: true,
        reason: "recent_run",
      };
    }
  }

  const now = new Date();
  await dbSet(RECONCILE_STATE_KEY, {
    ...(state || {}),
    last_run_started_at: now.toISOString(),
    running_until: new Date(now.getTime() + lockMs).toISOString(),
  } satisfies ReconcileState);

  const receivables = await dbList<Row>("receivables.json");
  const candidates = receivables
    .filter((row) => {
      const paymentId = text(row.mercado_pago_payment_id || row.mp_payment_id || row.boleto_codigo || row.pix_codigo);
      if (!paymentId) return false;
      if (isManualSettlementLocked(row)) return false;
      if (!isOpenFinanceStatus(row.status || row.situacao)) return false;
      if (isTerminalMercadoPagoStatus(row.payment_status || row.mercado_pago_status || row.mp_status)) return false;
      return minutesSince(row.last_payment_check_at) >= 2;
    })
    .sort((a, b) => {
      const aChecked = minutesSince(a.last_payment_check_at);
      const bChecked = minutesSince(b.last_payment_check_at);
      if (aChecked !== bChecked) return bChecked - aChecked;
      return text(a.vencimento || a.data_vencimento).localeCompare(text(b.vencimento || b.data_vencimento));
    })
    .slice(0, limit);

  let checked = 0;
  let matched = 0;
  let paid = 0;
  let errors = 0;

  try {
    for (const row of candidates) {
      const paymentId = text(row.mercado_pago_payment_id || row.mp_payment_id || row.boleto_codigo || row.pix_codigo);
      if (!paymentId) continue;
      checked++;
      try {
        const result = await syncMercadoPagoPayment(paymentId, "manual");
        if (result.matched) matched++;
        if (result.paid) paid++;
      } catch (error) {
        errors++;
        await audit({
          acao: "mercado_pago_reconciliacao_automatica_erro",
          mercado_pago_payment_id: paymentId,
          lancamento_id: row.id,
          erro: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } finally {
    await dbSet(RECONCILE_STATE_KEY, {
      last_run_started_at: now.toISOString(),
      last_run_completed_at: new Date().toISOString(),
      running_until: "",
      last_run_result: { checked, matched, paid, errors },
    } satisfies ReconcileState);
  }

  return { checked, matched, paid, errors };
}
