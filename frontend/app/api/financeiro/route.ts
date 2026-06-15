import { NextRequest, NextResponse } from "next/server";
import { dbList, dbListWithoutKeys, dbSet, dbUpdate } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { sendWhatsApp } from "@/lib/whatsapp";
import { sendEmail } from "@/lib/email";
import { isAdmin } from "@/lib/roles";
import { financeMessage } from "@/lib/finance-message";
import { applyMercadoPagoToLancamento, createMercadoPagoBoleto } from "@/lib/mercadopago-boleto";
import { reconcileMercadoPagoPendingReceivables } from "@/lib/mercadopago-sync";

function text(value: unknown) {
  return String(value || "").trim();
}

function isMercadoPagoUrl(value: unknown) {
  const url = text(value).toLowerCase();
  return url.startsWith("http") && (url.includes("mercadopago") || url.includes("mercado_pago"));
}

const HEAVY_KEYS = ["boleto_pdf_b64", "file_b64", "pdf_b64", "base64", "arquivo_b64", "foto_b64", "imagem_b64", "documento_b64", "anexo_b64"];

function isPaid(value: unknown) {
  const status = text(value).toLowerCase();
  return status.includes("pago") || status.includes("baixado") || status.includes("liquidado");
}

function hasMercadoPagoLink(row: Record<string, unknown>) {
  return Boolean(
    text(row.mercado_pago_payment_id) ||
    text(row.mp_payment_id) ||
    text(row.mercado_pago_ticket_url) ||
    text(row.boleto_url) ||
    text(row.boleto_pdf_url) ||
    text(row.pix_codigo) ||
    text(row.boleto_codigo)
  );
}

function lower(value: unknown) {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function moneyValue(value: unknown) {
  return Number.parseFloat(text(value).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
}

function moneyKey(value: unknown) {
  return moneyValue(value).toFixed(2);
}

function parseDate(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), 12);
  const date = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dueMonth(row: Record<string, unknown>) {
  const explicit = text(row.competencia || row.referencia);
  if (/^\d{4}-\d{2}$/.test(explicit)) return explicit;
  const due = parseDate(row.vencimento || row.data_vencimento);
  return due ? `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}` : "";
}

function isMonthly(row: Record<string, unknown>) {
  const raw = lower(`${text(row.categoria)} ${text(row.tipo_lancamento_detalhe)} ${text(row.tipo_cobranca)} ${text(row.descricao)}`);
  return raw.includes("mensal");
}

function billingEntityKeys(row: Record<string, unknown>) {
  return [
    text(row.aluno_id),
    text(row.aluno_login),
    text(row.aluno || row.nome),
    text(row.cpf),
  ].map(lower).filter(Boolean);
}

function billingTombstoneEntries(row: Record<string, unknown>, actor: string) {
  const comp = dueMonth(row);
  const value = row.valor_parcela ?? row.valor ?? row.valor_total;
  if (!comp || !moneyValue(value) || !isMonthly(row)) return [];
  return billingEntityKeys(row).map((entityKey) => ({
    id: crypto.randomUUID(),
    key: `${entityKey}|${comp}|${moneyKey(value)}`,
    lancamento_id: text(row.id),
    aluno: text(row.aluno || row.nome),
    competencia: comp,
    valor: moneyKey(value),
    deleted_at: new Date().toISOString(),
    deleted_by: actor,
  }));
}

function ensureFinanceIds(items: Record<string, unknown>[]) {
  let changed = false;
  const next = items.map((item) => {
    if (text(item.id)) return item;
    changed = true;
    return { ...item, id: crypto.randomUUID(), legacy_id_repaired_at: new Date().toISOString() };
  });
  return { items: next, changed };
}

async function audit(entry: Record<string, unknown>) {
  await dbUpdate<Record<string, unknown>[]>("finance_audit.json", (log) => [
    ...(Array.isArray(log) ? log : []),
    { id: crypto.randomUUID(), data: new Date().toISOString(), ...entry },
  ], []);
}

function shouldSendWhatsApp(data: Record<string, unknown>) {
  return data.enviar_whatsapp === true ||
    text(data.enviar_whatsapp).toLowerCase() === "true" ||
    text((data.notification_status as Record<string, unknown> | undefined)?.whatsapp) === "link_gerado";
}

function phoneOf(data: Record<string, unknown>) {
  return text(
    data.telefone ||
    data.whatsapp ||
    data.celular ||
    data.phone ||
    data.responsavel_telefone ||
    data.telefone_responsavel ||
    data.celular_responsavel ||
    data.whatsapp_responsavel ||
    data.aluno_telefone
  );
}

function emailOf(data: Record<string, unknown>) {
  return text(
    data.email ||
    data.aluno_email ||
    data.responsavel_email ||
    data.email_responsavel ||
    data.emailResponsavel
  );
}

function runNotification(task: Promise<unknown>, label: string) {
  void task.catch((err) => {
    console.error(`[financeiro notificacao ${label}]`, err);
  });
}

function shouldSendEmail(data: Record<string, unknown>) {
  return data.enviar_email === true ||
    text(data.enviar_email).toLowerCase() === "true" ||
    text((data.notification_status as Record<string, unknown> | undefined)?.email) === "link_gerado";
}

async function maybeGenerateMercadoPagoBoleto(
  lancamento: Record<string, unknown>,
  id: string,
  origin: string,
  wantsBoleto: boolean,
  hasImportedPdf: boolean,
) {
  if (!wantsBoleto || hasImportedPdf) return { ok: true as const, lancamento };
  const existingUrl = text(lancamento.mercado_pago_ticket_url || lancamento.boleto_url || lancamento.boleto_pdf_url);
  if (isMercadoPagoUrl(existingUrl)) return { ok: true as const, lancamento };

  const result = await createMercadoPagoBoleto(lancamento, id, origin);
  if (!result.ok) {
    return {
      ok: false as const,
      title: result.title,
      error: result.message,
      detail: result.detail,
    };
  }

  const recebimentos = await dbList<Record<string, unknown>>("receivables.json");
  const refreshed = recebimentos.find((item) => text(item.id) === id);
  return {
    ok: true as const,
    lancamento: refreshed || applyMercadoPagoToLancamento(lancamento, result),
  };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get("tipo") || "recebimentos";
  const key = tipo === "despesas" ? "payables.json" : "receivables.json";
  if (tipo !== "despesas") {
    await reconcileMercadoPagoPendingReceivables({ limit: 2, minIntervalMs: 60_000, lockMs: 60_000 });
  }
  const raw = searchParams.get("include_pdf") === "true"
    ? await dbList<Record<string, unknown>>(key)
    : await dbListWithoutKeys<Record<string, unknown>>(key, HEAVY_KEYS);
  const repaired = ensureFinanceIds(raw);
  if (repaired.changed) {
    const full = await dbList<Record<string, unknown>>(key);
    const fixedFull = ensureFinanceIds(full);
    await dbSet(key, fixedFull.items);
  }
  return NextResponse.json({ lancamentos: repaired.items });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });

  try {
    const body = await req.json();
    const { tipo = "recebimentos", ...data } = body;
    const key = tipo === "despesas" ? "payables.json" : "receivables.json";

    if (Array.isArray(data.items) && (data.items as unknown[]).length > 0) {
      const novos = (data.items as Record<string, unknown>[]).map((item) => ({
        ...item,
        id: text(item.id) || crypto.randomUUID(),
        created_at: new Date().toISOString(),
        created_by: session.pessoa || session.usuario,
      }));
      await dbUpdate<Record<string, unknown>[]>(key, (current) => {
        const repaired = ensureFinanceIds(Array.isArray(current) ? current : []);
        return [...repaired.items, ...novos];
      }, []);
      return NextResponse.json({ ok: true, count: novos.length }, { status: 201 });
    }

    const id = text(data.id) || crypto.randomUUID();
    const pdfUpdate = text(data.boleto_pdf_b64) ? {
      boleto_status: "Importado",
      boleto_pdf_url: `/api/financeiro/boleto-pdf?id=${encodeURIComponent(id)}`,
      boleto_pdf_mime: text(data.boleto_pdf_mime) || "application/pdf",
    } : {};
    const novo = {
      ...data,
      ...pdfUpdate,
      id,
      created_at: new Date().toISOString(),
      created_by: session.pessoa || session.usuario
    };
    await dbUpdate<Record<string, unknown>[]>(key, (current) => {
      const repaired = ensureFinanceIds(Array.isArray(current) ? current : []);
      return [...repaired.items, novo];
    }, []);
    const origin = new URL(req.url).origin;

    if (tipo !== "despesas" && data.gerar_boleto && !pdfUpdate.boleto_pdf_url) {
      const mp = await maybeGenerateMercadoPagoBoleto(novo, id, origin, true, false);
      if (!mp.ok) {
        return NextResponse.json({
          error: mp.error,
          title: mp.title,
          detail: mp.detail,
          lancamento: novo,
        }, { status: 422 });
      }
      Object.assign(novo, mp.lancamento);
    }
    if (tipo !== "despesas" && shouldSendWhatsApp(data)) {
      runNotification((async () => {
        const message = financeMessage(novo, origin);
        const result = await sendWhatsApp(phoneOf(novo), message.body, session);
        const notificationStatus = { ...(novo.notification_status as Record<string, unknown> | undefined), whatsapp: result.ok ? "enviado_wapi" : result.status };
        await dbUpdate<Record<string, unknown>[]>(key, (atualizados) =>
          ensureFinanceIds(Array.isArray(atualizados) ? atualizados : []).items.map((item) => item.id === id ? { ...item, notification_status: notificationStatus } : item)
        , []);
      })(), "whatsapp");
    }
    if (tipo !== "despesas" && shouldSendEmail(data)) {
      runNotification((async () => {
        const message = financeMessage(novo, origin);
        const result = await sendEmail(emailOf(novo), message.subject, message.body, session);
        await dbUpdate<Record<string, unknown>[]>(key, (atualizados) => {
          const latest = ensureFinanceIds(Array.isArray(atualizados) ? atualizados : []).items;
          const current = latest.find((item) => item.id === id) || novo;
          const notificationStatus = { ...(current.notification_status as Record<string, unknown> | undefined), email: result.ok ? "enviado_smtp" : result.status };
          return latest.map((item) => item.id === id ? { ...item, notification_status: notificationStatus } : item);
        }, []);
      })(), "email");
    }
    await audit({
      acao: "criar_lancamento",
      tipo,
      lancamento_id: novo.id,
      usuario: session.pessoa || session.usuario,
      perfil: session.perfil,
      depois: novo,
    });
    return NextResponse.json({ ok: true, lancamento: novo }, { status: 201 });
  } catch (err) {
    console.error("[financeiro POST]", err);
    return NextResponse.json({ error: "Erro ao salvar lancamento." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });

  try {
    const { id, tipo = "recebimentos", ...updates } = await req.json();
    if (!id) return NextResponse.json({ error: "ID obrigatorio." }, { status: 400 });

    const key = tipo === "despesas" ? "payables.json" : "receivables.json";
    const baseLancamentos = ensureFinanceIds(await dbList<Record<string, unknown>>(key)).items;
    const idx = baseLancamentos.findIndex((l) => l.id === id);
    if (idx === -1) return NextResponse.json({ error: "Lancamento nao encontrado." }, { status: 404 });

    const before = { ...baseLancamentos[idx] };
    const wasPaid = isPaid(baseLancamentos[idx].status);
    const willBePaid = isPaid(updates.status);
    const isReversal = Boolean(updates.estorno);
    if (isReversal && !isAdmin(session)) {
      return NextResponse.json({ error: "Somente administrador pode tirar baixa de pagamento." }, { status: 403 });
    }
    if (wasPaid && updates.status && !willBePaid && !isReversal) {
      return NextResponse.json({ error: "Lancamento pago so pode voltar para aberto por estorno auditado." }, { status: 409 });
    }

    const pdfUpdate = text(updates.boleto_pdf_b64) ? {
      boleto_status: "Importado",
      boleto_pdf_url: `/api/financeiro/boleto-pdf?id=${encodeURIComponent(id)}`,
      boleto_pdf_mime: text(updates.boleto_pdf_mime) || "application/pdf",
    } : {};
    const shouldLockMercadoPagoManualSettlement = tipo !== "despesas" && !isReversal && !wasPaid && willBePaid && hasMercadoPagoLink(baseLancamentos[idx]);
    const estornoUpdate = isReversal ? {
      status: "Pendente",
      estornado_em: new Date().toISOString(),
      estornado_por: session.pessoa || session.usuario,
      estorno_motivo: text(updates.estorno_motivo) || "Estorno manual",
      data_baixa: "",
      valor_pago: "",
      forma_pagamento: "",
      mercado_pago_manual_lock: false,
      mercado_pago_manual_lock_at: "",
      mercado_pago_manual_lock_by: "",
    } : {};
    const manualSettlementLockUpdate = shouldLockMercadoPagoManualSettlement ? {
      mercado_pago_manual_lock: true,
      mercado_pago_manual_lock_at: new Date().toISOString(),
      mercado_pago_manual_lock_by: session.pessoa || session.usuario,
    } : {};

    const nextLancamento = {
      ...baseLancamentos[idx],
      ...updates,
      ...pdfUpdate,
      ...estornoUpdate,
      ...manualSettlementLockUpdate,
      updated_at: new Date().toISOString(),
      updated_by: session.pessoa || session.usuario,
    };

    const writes: Promise<unknown>[] = [
      dbUpdate<Record<string, unknown>[]>(key, (current) => {
        const lancamentos = ensureFinanceIds(Array.isArray(current) ? current : []).items;
        return lancamentos.map((item) => text(item.id) === id ? { ...item, ...nextLancamento } : item);
      }, []),
    ];
    if (!wasPaid && willBePaid) {
      const lancamento = nextLancamento;
      const recibo = {
        id: crypto.randomUUID(),
        lancamento_id: id,
        tipo,
        pessoa: lancamento.aluno || lancamento.nome || lancamento.professor,
        descricao: lancamento.descricao,
        valor: lancamento.valor,
        valor_pago: lancamento.valor_pago || lancamento.valor,
        forma_pagamento: lancamento.forma_pagamento || "Nao informado",
        data: new Date().toISOString(),
        autenticidade: `AE-${String(id).slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
        gerado_automaticamente: true,
        whatsapp: lancamento.telefone || lancamento.whatsapp || lancamento.professor_telefone || "",
      };
      writes.push(dbUpdate<Record<string, unknown>[]>("receipts.json", (recibos) => [
        ...(Array.isArray(recibos) ? recibos : []),
        recibo,
      ], []));
    }

    await Promise.all(writes);
    const origin = new URL(req.url).origin;

    if (tipo !== "despesas" && updates.gerar_boleto && !pdfUpdate.boleto_pdf_url) {
      const mp = await maybeGenerateMercadoPagoBoleto(nextLancamento, id, origin, true, false);
      if (!mp.ok) {
        return NextResponse.json({
          error: mp.error,
          title: mp.title,
          detail: mp.detail,
          lancamento: nextLancamento,
        }, { status: 422 });
      }
      Object.assign(nextLancamento, mp.lancamento);
    }

    if (tipo !== "despesas" && shouldSendWhatsApp(updates)) {
      const lancamento = { ...nextLancamento };
      runNotification((async () => {
        const message = financeMessage(lancamento, origin);
        const result = await sendWhatsApp(phoneOf(lancamento), message.body, session);
        await dbUpdate<Record<string, unknown>[]>(key, (atualizados) => {
          const latest = ensureFinanceIds(Array.isArray(atualizados) ? atualizados : []).items;
          const current = latest.find((item) => item.id === id) || lancamento;
          const notificationStatus = { ...(current.notification_status as Record<string, unknown> | undefined), whatsapp: result.ok ? "enviado_wapi" : result.status };
          return latest.map((item) => item.id === id ? { ...item, notification_status: notificationStatus } : item);
        }, []);
      })(), "whatsapp");
    }
    if (tipo !== "despesas" && shouldSendEmail(updates)) {
      const lancamento = { ...nextLancamento };
      runNotification((async () => {
        const message = financeMessage(lancamento, origin);
        const result = await sendEmail(emailOf(lancamento), message.subject, message.body, session);
        await dbUpdate<Record<string, unknown>[]>(key, (atualizados) => {
          const latest = ensureFinanceIds(Array.isArray(atualizados) ? atualizados : []).items;
          const current = latest.find((item) => item.id === id) || lancamento;
          const notificationStatus = { ...(current.notification_status as Record<string, unknown> | undefined), email: result.ok ? "enviado_smtp" : result.status };
          return latest.map((item) => item.id === id ? { ...item, notification_status: notificationStatus } : item);
        }, []);
      })(), "email");
    }
    await audit({
      acao: isReversal ? "estornar_baixa" : willBePaid && !wasPaid ? "baixar_pagamento" : updates.gerar_boleto ? "gerar_boleto" : "editar_lancamento",
      tipo,
      lancamento_id: id,
      usuario: session.pessoa || session.usuario,
      perfil: session.perfil,
      antes: before,
      depois: nextLancamento,
    });
    return NextResponse.json({ ok: true, lancamento: nextLancamento });
  } catch (err) {
    console.error("[financeiro PUT]", err);
    return NextResponse.json({ error: "Erro ao atualizar lancamento." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const idsParam = searchParams.get("ids");
  const tipo = searchParams.get("tipo") || "recebimentos";
  const ids = (idsParam ? idsParam.split(",") : [id]).map((item) => text(item)).filter(Boolean);
  if (ids.length === 0) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
  const key = tipo === "despesas" ? "payables.json" : "receivables.json";
  const lancamentos = ensureFinanceIds(await dbList<Record<string, unknown>>(key)).items;
  const selected = lancamentos.filter((l) => ids.includes(text(l.id)));
  const paid = selected.filter((l) => isPaid(l.status));
  if (paid.length > 0) {
    return NextResponse.json({ error: "Lancamento pago nao pode ser excluido. Use estorno/cancelamento auditado." }, { status: 409 });
  }
  const selectedIds = new Set(ids);
  const deleted = lancamentos.filter((l) => selectedIds.has(text(l.id)));
  const actor = text(session.pessoa || session.usuario);

  if (tipo !== "despesas") {
    const deletedKeys = await dbList<Record<string, unknown>>("finance_deleted_keys.json");
    const existingKeys = new Set(deletedKeys.map((item) => text(item.key)).filter(Boolean));
    const tombstones = deleted
      .flatMap((target) => billingTombstoneEntries(target, actor))
      .filter((item) => {
        if (existingKeys.has(item.key)) return false;
        existingKeys.add(item.key);
        return true;
      });
    if (tombstones.length > 0) {
      await dbUpdate<Record<string, unknown>[]>("finance_deleted_keys.json", (current) => [
        ...((Array.isArray(current) ? current : deletedKeys)),
        ...tombstones,
      ].slice(-2000), deletedKeys);
    }
  }

  await dbUpdate<Record<string, unknown>[]>(key, (current) => {
    const latest = ensureFinanceIds(Array.isArray(current) ? current : []).items;
    return latest.filter((l) => !selectedIds.has(text(l.id)));
  }, []);
  for (const target of deleted) {
    await audit({
      acao: ids.length > 1 ? "excluir_lancamentos_em_lote" : "excluir_lancamento",
      tipo,
      lancamento_id: target.id,
      usuario: actor,
      perfil: session.perfil,
      antes: target,
      total_selecionado: ids.length,
    });
  }
  return NextResponse.json({ ok: true, deleted: deleted.length });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });

  try {
    const body = await req.json() as Record<string, unknown>;
    const ids = (Array.isArray(body.ids) ? body.ids : []).map((v) => text(v)).filter(Boolean);
    if (ids.length === 0) return NextResponse.json({ error: "ids obrigatorio." }, { status: 400 });

    const tipo = text(body.tipo) || "despesas";
    const key = tipo === "despesas" ? "payables.json" : "receivables.json";
    const dataHoje = new Date().toISOString().slice(0, 10);
    const dataBaixa = text(body.data_baixa) || dataHoje;
    const formaPagamento = text(body.forma_pagamento) || "PIX";
    const bancoDestino = text(body.banco_destino);
    const observacao = text(body.observacao_baixa);
    const valorPago = text(body.valor_pago);
    const actor = session.pessoa || session.usuario;
    const now = new Date().toISOString();

    const lancamentos = ensureFinanceIds(await dbList<Record<string, unknown>>(key)).items;
    const idsSet = new Set(ids);
    const recibosNovos: Record<string, unknown>[] = [];
    let baixados = 0;
    let jaPageos = 0;

    lancamentos.forEach((l) => {
      if (!idsSet.has(text(l.id))) return l;
      if (isPaid(l.status)) { jaPageos++; return l; }
      baixados++;
      const novo = {
        ...l,
        status: "Pago",
        data_baixa: dataBaixa,
        valor_pago: valorPago || l.valor_pago || l.valor_parcela || l.valor,
        forma_pagamento: formaPagamento,
        banco_destino: bancoDestino,
        observacao_baixa: observacao,
        baixa_em_massa: true,
        updated_at: now,
        updated_by: actor,
      };
      recibosNovos.push({
        id: crypto.randomUUID(),
        lancamento_id: l.id,
        tipo,
        pessoa: l.aluno || l.nome || l.professor,
        descricao: l.descricao,
        valor: l.valor,
        valor_pago: valorPago || l.valor_parcela || l.valor,
        forma_pagamento: formaPagamento,
        data: now,
        autenticidade: `AE-${text(l.id).slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
        gerado_automaticamente: true,
        baixa_em_massa: true,
      });
    });

    await Promise.all([
      dbUpdate<Record<string, unknown>[]>(key, (current) => {
        const latest = ensureFinanceIds(Array.isArray(current) ? current : []).items;
        return latest.map((l) => {
          if (!idsSet.has(text(l.id))) return l;
          if (isPaid(l.status)) return l;
          return {
            ...l,
            status: "Pago",
            data_baixa: dataBaixa,
            valor_pago: valorPago || l.valor_pago || l.valor_parcela || l.valor,
            forma_pagamento: formaPagamento,
            banco_destino: bancoDestino,
            observacao_baixa: observacao,
            baixa_em_massa: true,
            mercado_pago_manual_lock: tipo !== "despesas" && hasMercadoPagoLink(l),
            mercado_pago_manual_lock_at: tipo !== "despesas" && hasMercadoPagoLink(l) ? now : text(l.mercado_pago_manual_lock_at),
            mercado_pago_manual_lock_by: tipo !== "despesas" && hasMercadoPagoLink(l) ? actor : text(l.mercado_pago_manual_lock_by),
            updated_at: now,
            updated_by: actor,
          };
        });
      }, []),
      dbUpdate<Record<string, unknown>[]>("receipts.json", (recibos) => [
        ...(Array.isArray(recibos) ? recibos : []),
        ...recibosNovos,
      ], []),
    ]);

    await audit({
      acao: ids.length > 1 ? "baixa_em_massa" : "baixar_pagamento",
      tipo,
      ids,
      usuario: actor,
      perfil: session.perfil,
      baixados,
      ja_pagos: jaPageos,
      forma_pagamento: formaPagamento,
      data_baixa: dataBaixa,
    });

    return NextResponse.json({ ok: true, baixados, ja_pagos: jaPageos, total: ids.length });
  } catch (err) {
    console.error("[financeiro PATCH]", err);
    return NextResponse.json({ error: "Erro na baixa em massa." }, { status: 500 });
  }
}
