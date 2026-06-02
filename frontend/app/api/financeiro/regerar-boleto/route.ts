/**
 * POST /api/financeiro/regerar-boleto
 *
 * Regera o boleto via Mercado Pago para um ou mais lancamentos que ainda nao
 * possuem boleto_url real (boletos internos AE-XXXX ou com "Erro MP").
 *
 * Body: { id?: string }           -> regera apenas o lancamento com esse id
 *       { todos_sem_mp?: true }   -> regera todos os lancamentos sem boleto_url
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dbList, dbSet } from "@/lib/db";
import { createMercadoPagoBoleto } from "@/lib/mercadopago-boleto";

type Row = Record<string, unknown>;

function text(v: unknown) {
  return String(v || "").trim();
}
function money(v: unknown) {
  const n = parseFloat(String(v || "0").replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function precisaRegerar(r: Row) {
  const boletoUrl = text(r.mercado_pago_ticket_url || r.boleto_url || r.boleto_pdf_url);
  const status = text(r.boleto_status).toLowerCase();
  const codigo = text(r.boleto_codigo);
  const isMercadoPago = boletoUrl.toLowerCase().includes("mercadopago") || boletoUrl.toLowerCase().includes("mercado_pago");
  return !isMercadoPago || status.includes("erro") || status === "gerado" || codigo.startsWith("AE-");
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!["Admin", "Secretaria", "Financeiro"].includes(session.perfil || "")) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as { id?: string; todos_sem_mp?: boolean };
  const lancamentos = await dbList<Row>("receivables.json");

  let alvos: Row[];
  if (body.id) {
    const found = lancamentos.find((r) => text(r.id) === body.id);
    if (!found) return NextResponse.json({ error: "Lancamento nao encontrado" }, { status: 404 });
    alvos = [found];
  } else if (body.todos_sem_mp) {
    alvos = lancamentos.filter((r) => {
      const tipo = text(r.tipo || r.tipo_cobranca || "");
      if (tipo.toLowerCase().includes("despesa")) return false;
      return precisaRegerar(r);
    });
    if (alvos.length === 0) {
      return NextResponse.json({ ok: true, message: "Nenhum lancamento precisa ser regerado.", regerados: 0 });
    }
  } else {
    return NextResponse.json({ error: "Informe id ou todos_sem_mp=true" }, { status: 400 });
  }

  const resultados: { id: string; aluno: string; ok: boolean; boleto_url?: string; erro?: string }[] = [];
  const updatedMap = new Map<string, Row>();
  const origin = new URL(req.url).origin;

  for (const lanc of alvos) {
    const id = text(lanc.id);
    const valor = money(lanc.valor_parcela || lanc.valor);
    const nomeAluno = text(lanc.aluno || lanc.nome);
    if (!valor || valor <= 0) {
      resultados.push({ id, aluno: nomeAluno, ok: false, erro: "Valor invalido" });
      continue;
    }

    const mpResult = await createMercadoPagoBoleto(lanc, id, origin);

    if (mpResult.ok) {
      updatedMap.set(id, {
        ...lanc,
        boleto_status: "Gerado MP",
        mercado_pago_ticket_url: mpResult.url,
        boleto_url: mpResult.url,
        boleto_pdf_url: mpResult.url,
        boleto_codigo: mpResult.paymentId,
        boleto_linha_digitavel: mpResult.linha,
        mp_payment_id: mpResult.paymentId,
        boleto_gerado_em: new Date().toISOString(),
        boleto_erro: "",
        status: "Boleto gerado",
      });
      resultados.push({ id, aluno: nomeAluno, ok: true, boleto_url: mpResult.url });
    } else {
      updatedMap.set(id, {
        ...lanc,
        boleto_status: "Erro MP",
        boleto_erro: mpResult.message,
        boleto_gerado_em: new Date().toISOString(),
      });
      resultados.push({ id, aluno: nomeAluno, ok: false, erro: mpResult.detail || mpResult.message });
    }
  }

  const novaLista = lancamentos.map((r) => updatedMap.get(text(r.id)) || r);
  await dbSet("receivables.json", novaLista);

  const sucesso = resultados.filter((r) => r.ok).length;
  const erros = resultados.filter((r) => !r.ok).length;

  return NextResponse.json({
    ok: true,
    regerados: sucesso,
    erros,
    resultados,
  });
}
