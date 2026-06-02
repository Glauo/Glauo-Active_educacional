/**
 * POST /api/financeiro/regerar-boleto
 *
 * Regera o boleto via Mercado Pago para um ou mais lançamentos que ainda não
 * possuem boleto_url real (boletos internos AE-XXXX ou com "Erro MP").
 *
 * Body: { id?: string }           → regera apenas o lançamento com esse id
 *       { todos_sem_mp?: true }   → regera todos os lançamentos sem boleto_url
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dbList, dbSet } from "@/lib/db";
import { criarBoleteMercadoPago } from "@/lib/mercadopago";

type Row = Record<string, unknown>;

function text(v: unknown) {
  return String(v || "").trim();
}
function money(v: unknown) {
  const n = parseFloat(String(v || "0").replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function webhookUrl() {
  return (
    process.env.ACTIVE_MERCADO_PAGO_WEBHOOK_URL ||
    process.env.MERCADO_PAGO_WEBHOOK_URL ||
    "https://ativoeducacional.tech/api/financeiro/mercado-pago/webhook"
  );
}

function precisaRegerar(r: Row) {
  const boletoUrl = text(r.mercado_pago_ticket_url || r.boleto_url);
  const status = text(r.boleto_status);
  // Precisa regerar se: não tem URL real do MP, ou está com Erro MP, ou tem código AE-
  return (
    !boletoUrl.startsWith("http") &&
    (status === "Erro MP" || status === "Gerado" || status === "" || text(r.boleto_codigo).startsWith("AE-"))
  );
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!["Admin", "Secretaria", "Financeiro"].includes(session.perfil || "")) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as { id?: string; todos_sem_mp?: boolean };
  const lancamentos = await dbList<Row>("receivables.json");

  // Selecionar quais lançamentos regerar
  let alvos: Row[];
  if (body.id) {
    const found = lancamentos.find((r) => text(r.id) === body.id);
    if (!found) return NextResponse.json({ error: "Lancamento nao encontrado" }, { status: 404 });
    // Quando ID especifico: sempre regera (mesmo que ja tenha boleto_url), para permitir geracao manual
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

  for (const lanc of alvos) {
    const id = text(lanc.id);
    const valor = money(lanc.valor_parcela || lanc.valor);
    const nomeAluno = text(lanc.aluno || lanc.nome);
    const nomeParts = nomeAluno.split(" ");
    const payerEmail =
      text(lanc.email || lanc.email_responsavel) ||
      `aluno.${nomeAluno.replace(/\s+/g, ".").toLowerCase()}@activeeducacional.com.br`;
    const vencimentoRaw = text(lanc.vencimento || lanc.data_vencimento);
    // Converter data BR (DD/MM/YYYY) para ISO (YYYY-MM-DD) se necessario
    let vencimentoISO = vencimentoRaw;
    const brMatch = vencimentoRaw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (brMatch) vencimentoISO = `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
    const dateOfExpiration = vencimentoISO ? `${vencimentoISO}T23:59:59.000-03:00` : undefined;

    if (!valor || valor <= 0) {
      resultados.push({ id, aluno: nomeAluno, ok: false, erro: "Valor invalido" });
      continue;
    }

    // Endereço do pagador (obrigatório para boleto registrado no MP)
    const payerAddress = {
      zip_code: text(lanc.cep) || undefined,
      street_name: text(lanc.rua || lanc.endereco) || undefined,
      street_number: text(lanc.numero) || undefined,
      neighborhood: text(lanc.bairro) || undefined,
      city: text(lanc.cidade) || undefined,
      federal_unit: text(lanc.estado || lanc.uf) || undefined,
    };
    const mpResult = await criarBoleteMercadoPago({
      transaction_amount: valor,
      description: text(lanc.descricao) || `Mensalidade - ${nomeAluno}`,
      payer_email: payerEmail,
      payer_first_name: nomeParts[0] || "Responsavel",
      payer_last_name: nomeParts.slice(1).join(" ") || "Financeiro",
      payer_cpf: text(lanc.cpf || lanc.responsavel_cpf || ""),
      payer_address: payerAddress,
      date_of_expiration: dateOfExpiration,
      external_reference: id,
      notification_url: webhookUrl(),
    });

    if (mpResult.ok) {
      updatedMap.set(id, {
        ...lanc,
        boleto_status: "Gerado MP",
        mercado_pago_ticket_url: mpResult.boleto_url,
        boleto_url: mpResult.boleto_url,
        boleto_codigo: mpResult.barcode || "",
        boleto_linha_digitavel: mpResult.digitable_line || mpResult.barcode || "",
        mp_payment_id: mpResult.payment_id,
        mp_status: mpResult.status,
        mp_status_detail: mpResult.status_detail,
        mp_date_of_expiration: mpResult.date_of_expiration,
        boleto_gerado_em: new Date().toISOString(),
        boleto_erro: "",
        status: "Boleto gerado",
      });
      resultados.push({ id, aluno: nomeAluno, ok: true, boleto_url: mpResult.boleto_url });
    } else {
      updatedMap.set(id, {
        ...lanc,
        boleto_status: "Erro MP",
        boleto_erro: mpResult.error,
        boleto_gerado_em: new Date().toISOString(),
      });
      resultados.push({ id, aluno: nomeAluno, ok: false, erro: mpResult.error });
    }
  }

  // Salvar todos os lançamentos atualizados
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
