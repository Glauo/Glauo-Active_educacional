import { NextRequest, NextResponse } from "next/server";
import { dbList, dbListWithoutKeys, dbSet } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { sendWhatsApp } from "@/lib/whatsapp";
import { sendEmail } from "@/lib/email";
import { isAdmin } from "@/lib/roles";
import { financeMessage } from "@/lib/finance-message";
import { applyMercadoPagoToLancamento, createMercadoPagoBoleto } from "@/lib/mercadopago-boleto";

function text(value: unknown) {
  return String(value || "").trim();
}

const HEAVY_KEYS = ["boleto_pdf_b64", "file_b64", "pdf_b64", "base64", "arquivo_b64", "foto_b64", "imagem_b64", "documento_b64", "anexo_b64"];

function isPaid(value: unknown) {
  const status = text(value).toLowerCase();
  return status.includes("pago") || status.includes("baixado") || status.includes("liquidado");
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
  const log = await dbList<Record<string, unknown>>("finance_audit.json");
  await dbSet("finance_audit.json", [
    ...log,
    { id: crypto.randomUUID(), data: new Date().toISOString(), ...entry },
  ]);
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
  if (text(lancamento.mercado_pago_ticket_url).startsWith("http")) return { ok: true as const, lancamento };

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

    const current = await dbList<Record<string, unknown>>(key);
    const repaired = ensureFinanceIds(current);
    const lancamentos = repaired.items;

    // Batch create (mensalidades mensais)
    if (Array.isArray(data.items) && (data.items as unknown[]).length > 0) {
      const novos = (data.items as Record<string, unknown>[]).map((item) => ({
        ...item,
        id: text(item.id) || crypto.randomUUID(),
        created_at: new Date().toISOString(),
        created_by: session.pessoa || session.usuario,
      }));
      await dbSet(key, [...lancamentos, ...novos]);
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
    lancamentos.push(novo);
    await dbSet(key, lancamentos);
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
        const atualizados = await dbList<Record<string, unknown>>(key);
        const notificationStatus = { ...(novo.notification_status as Record<string, unknown> | undefined), whatsapp: result.ok ? "enviado_wapi" : result.status };
        await dbSet(key, atualizados.map((item) => item.id === id ? { ...item, notification_status: notificationStatus } : item));
      })(), "whatsapp");
    }
    if (tipo !== "despesas" && shouldSendEmail(data)) {
      runNotification((async () => {
        const message = financeMessage(novo, origin);
        const result = await sendEmail(emailOf(novo), message.subject, message.body, session);
        const atualizados = await dbList<Record<string, unknown>>(key);
        const current = atualizados.find((item) => item.id === id) || novo;
        const notificationStatus = { ...(current.notification_status as Record<string, unknown> | undefined), email: result.ok ? "enviado_smtp" : result.status };
        await dbSet(key, atualizados.map((item) => item.id === id ? { ...item, notification_status: notificationStatus } : item));
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
    const baseLancamentos = await dbList<Record<string, unknown>>(key);
    const repairedLancamentos = ensureFinanceIds(baseLancamentos);
    const lancamentos = repairedLancamentos.items;
    const idx = lancamentos.findIndex((l) => l.id === id);
    if (idx === -1) return NextResponse.json({ error: "Lancamento nao encontrado." }, { status: 404 });

    const before = { ...lancamentos[idx] };
    const wasPaid = isPaid(lancamentos[idx].status);
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
    const estornoUpdate = isReversal ? {
      status: "Pendente",
      estornado_em: new Date().toISOString(),
      estornado_por: session.pessoa || session.usuario,
      estorno_motivo: text(updates.estorno_motivo) || "Estorno manual",
      data_baixa: "",
      valor_pago: "",
      forma_pagamento: "",
    } : {};

    lancamentos[idx] = {
      ...lancamentos[idx],
      ...updates,
      ...pdfUpdate,
      ...estornoUpdate,
      updated_at: new Date().toISOString(),
      updated_by: session.pessoa || session.usuario,
    };

    const writes: Promise<boolean>[] = [dbSet(key, lancamentos)];
    if (!wasPaid && willBePaid) {
      const recibos = await dbList<Record<string, unknown>>("receipts.json");
      const lancamento = lancamentos[idx];
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
      writes.push(dbSet("receipts.json", [...recibos, recibo]));
    }

    await Promise.all(writes);
    const origin = new URL(req.url).origin;

    if (tipo !== "despesas" && updates.gerar_boleto && !pdfUpdate.boleto_pdf_url) {
      const mp = await maybeGenerateMercadoPagoBoleto(lancamentos[idx], id, origin, true, false);
      if (!mp.ok) {
        return NextResponse.json({
          error: mp.error,
          title: mp.title,
          detail: mp.detail,
          lancamento: lancamentos[idx],
        }, { status: 422 });
      }
      lancamentos[idx] = mp.lancamento;
      await dbSet(key, lancamentos);
    }

    if (tipo !== "despesas" && shouldSendWhatsApp(updates)) {
      const lancamento = { ...lancamentos[idx] };
      runNotification((async () => {
        const message = financeMessage(lancamento, origin);
        const result = await sendWhatsApp(phoneOf(lancamento), message.body, session);
        const atualizados = await dbList<Record<string, unknown>>(key);
        const current = atualizados.find((item) => item.id === id) || lancamento;
        const notificationStatus = { ...(current.notification_status as Record<string, unknown> | undefined), whatsapp: result.ok ? "enviado_wapi" : result.status };
        await dbSet(key, atualizados.map((item) => item.id === id ? { ...item, notification_status: notificationStatus } : item));
      })(), "whatsapp");
    }
    if (tipo !== "despesas" && shouldSendEmail(updates)) {
      const lancamento = { ...lancamentos[idx] };
      runNotification((async () => {
        const message = financeMessage(lancamento, origin);
        const result = await sendEmail(emailOf(lancamento), message.subject, message.body, session);
        const atualizados = await dbList<Record<string, unknown>>(key);
        const current = atualizados.find((item) => item.id === id) || lancamento;
        const notificationStatus = { ...(current.notification_status as Record<string, unknown> | undefined), email: result.ok ? "enviado_smtp" : result.status };
        await dbSet(key, atualizados.map((item) => item.id === id ? { ...item, notification_status: notificationStatus } : item));
      })(), "email");
    }
    await audit({
      acao: isReversal ? "estornar_baixa" : willBePaid && !wasPaid ? "baixar_pagamento" : updates.gerar_boleto ? "gerar_boleto" : "editar_lancamento",
      tipo,
      lancamento_id: id,
      usuario: session.pessoa || session.usuario,
      perfil: session.perfil,
      antes: before,
      depois: lancamentos[idx],
    });
    return NextResponse.json({ ok: true, lancamento: lancamentos[idx] });
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
  const repaired = ensureFinanceIds(await dbList<Record<string, unknown>>(key));
  const lancamentos = repaired.items;
  const selected = lancamentos.filter((l) => ids.includes(text(l.id)));
  const paid = selected.filter((l) => isPaid(l.status));
  if (paid.length > 0) {
    return NextResponse.json({ error: "Lancamento pago nao pode ser excluido. Use estorno/cancelamento auditado." }, { status: 409 });
  }
  const selectedIds = new Set(ids);
  const filtered = lancamentos.filter((l) => !selectedIds.has(text(l.id)));
  await dbSet(key, filtered);
  const deleted = lancamentos.filter((l) => selectedIds.has(text(l.id)));
  for (const target of deleted) {
    await audit({
      acao: ids.length > 1 ? "excluir_lancamentos_em_lote" : "excluir_lancamento",
      tipo,
      lancamento_id: target.id,
      usuario: session.pessoa || session.usuario,
      perfil: session.perfil,
      antes: target,
      total_selecionado: ids.length,
    });
  }
  return NextResponse.json({ ok: true, deleted: deleted.length });
}

// Bulk baixa — marks multiple payables as Pago in a single atomic write
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

    const repairedLancamentos = ensureFinanceIds(await dbList<Record<string, unknown>>(key));
    const lancamentos = repairedLancamentos.items;
    const idsSet = new Set(ids);
    const recibosNovos: Record<string, unknown>[] = [];
    let baixados = 0;
    let jaPageos = 0;

    const updated = lancamentos.map((l) => {
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
      return novo;
    });

    const recibosExistentes = await dbList<Record<string, unknown>>("receipts.json");
    await Promise.all([
      dbSet(key, updated),
      dbSet("receipts.json", [...recibosExistentes, ...recibosNovos]),
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
