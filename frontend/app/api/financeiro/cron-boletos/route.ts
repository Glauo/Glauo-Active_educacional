/**
 * GET /api/financeiro/cron-boletos?secret=<CRON_SECRET>
 *
 * Rota de cron protegida por token secreto.
 * Chamada automaticamente pelo wizbot todo dia 5 do mês às 06:00 (BRT).
 *
 * O que faz:
 *  1. Regera via Mercado Pago todos os boletos com código interno AE-XXXX ou status "Erro MP"
 *  2. Registra o resultado no log de auditoria financeira
 *  3. Retorna JSON com o resumo da execução
 *
 * Variável de ambiente necessária: CRON_SECRET (qualquer string secreta)
 */

import { NextRequest, NextResponse } from "next/server";
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
  const codigo = text(r.boleto_codigo);
  return (
    !boletoUrl.startsWith("http") &&
    (status === "Erro MP" || status === "Gerado" || status === "" || codigo.startsWith("AE-"))
  );
}

export async function GET(req: NextRequest) {
  // Autenticação por token secreto
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET || process.env.ACTIVE_CRON_SECRET;

  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const inicio = Date.now();
  console.log("[cron-boletos] Iniciando regeracao automatica de boletos...");

  try {
    const lancamentos = await dbList<Row>("receivables.json");

    // Filtrar apenas lançamentos de receita que precisam de regeração
    const alvos = lancamentos.filter((r) => {
      const tipo = text(r.tipo || r.tipo_cobranca || "");
      if (tipo.toLowerCase().includes("despesa")) return false;
      const status = text(r.status);
      // Não regerar boletos já pagos ou cancelados
      if (["Pago", "Cancelado", "Estornado"].includes(status)) return false;
      return precisaRegerar(r);
    });

    console.log(`[cron-boletos] ${alvos.length} lancamento(s) para regerar.`);

    if (alvos.length === 0) {
      const resultado = {
        ok: true,
        executado_em: new Date().toISOString(),
        regerados: 0,
        erros: 0,
        mensagem: "Nenhum lancamento precisava de regeracao.",
        duracao_ms: Date.now() - inicio,
      };
      console.log("[cron-boletos]", resultado.mensagem);
      return NextResponse.json(resultado);
    }

    const updatedMap = new Map<string, Row>();
    let regerados = 0;
    let erros = 0;
    const detalhes: { id: string; aluno: string; ok: boolean; erro?: string }[] = [];

    for (const lanc of alvos) {
      const id = text(lanc.id);
      const valor = money(lanc.valor_parcela || lanc.valor);
      const nomeAluno = text(lanc.aluno || lanc.nome);
      const nomeParts = nomeAluno.split(" ");
      const payerEmail =
        text(lanc.email || lanc.email_responsavel) ||
        `aluno.${nomeAluno.replace(/\s+/g, ".").toLowerCase()}@activeeducacional.com.br`;
      const vencimentoRawCron = text(lanc.vencimento || lanc.data_vencimento);
      const brMatchCron = vencimentoRawCron.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      const vencimentoISOCron = brMatchCron ? `${brMatchCron[3]}-${brMatchCron[2]}-${brMatchCron[1]}` : vencimentoRawCron;
      const dateOfExpiration = vencimentoISOCron ? `${vencimentoISOCron}T23:59:59.000-03:00` : undefined;

      if (!valor || valor <= 0) {
        detalhes.push({ id, aluno: nomeAluno, ok: false, erro: "Valor invalido" });
        erros++;
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
        regerados++;
        detalhes.push({ id, aluno: nomeAluno, ok: true });
      } else {
        updatedMap.set(id, {
          ...lanc,
          boleto_status: "Erro MP",
          boleto_erro: mpResult.error,
          boleto_gerado_em: new Date().toISOString(),
        });
        erros++;
        detalhes.push({ id, aluno: nomeAluno, ok: false, erro: mpResult.error });
        console.error(`[cron-boletos] Erro MP para ${nomeAluno}: ${mpResult.error}`);
      }
    }

    // Salvar lançamentos atualizados
    const novaLista = lancamentos.map((r) => updatedMap.get(text(r.id)) || r);

    // Registrar na auditoria
    const audit = await dbList<Row>("finance_audit.json");
    const auditEntry: Row = {
      id: crypto.randomUUID(),
      data: new Date().toISOString(),
      acao: "cron_regerar_boletos_mp",
      usuario: "sistema",
      perfil: "Cron",
      regerados,
      erros,
      total_processados: alvos.length,
      duracao_ms: Date.now() - inicio,
    };

    await Promise.all([
      dbSet("receivables.json", novaLista),
      dbSet("finance_audit.json", [...audit, auditEntry]),
    ]);

    const resultado = {
      ok: true,
      executado_em: new Date().toISOString(),
      regerados,
      erros,
      total_processados: alvos.length,
      duracao_ms: Date.now() - inicio,
      detalhes,
    };

    console.log(`[cron-boletos] Concluido: ${regerados} regerado(s), ${erros} erro(s) em ${resultado.duracao_ms}ms`);
    return NextResponse.json(resultado);

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[cron-boletos] Excecao:", errMsg);
    return NextResponse.json(
      { ok: false, error: errMsg, duracao_ms: Date.now() - inicio },
      { status: 500 }
    );
  }
}
