import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dbList, dbUpdate } from "@/lib/db";
import { isAdminOrCoordinator } from "@/lib/roles";
import { createMercadoPagoBoleto } from "@/lib/mercadopago-boleto";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return String(value || "").trim();
}

function monthOf(row: Row) {
  const value = text(row.vencimento || row.data_vencimento);
  const iso = value.match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return br ? `${br[3]}-${br[2]}` : "";
}

function paid(row: Row) {
  const status = text(row.status || row.situacao).toLowerCase();
  return status.includes("pago") || status.includes("baixado") || status.includes("liquidado");
}

function needsBoleto(row: Row) {
  const url = text(row.mercado_pago_ticket_url || row.boleto_url || row.boleto_pdf_url).toLowerCase();
  const paymentStatus = text(row.payment_status || row.mercado_pago_status || row.boleto_status).toLowerCase();
  const hasMercadoPagoUrl = url.includes("mercadopago") || url.includes("mercado_pago");
  const invalidPayment = ["reject", "cancel", "refunded", "charged_back", "contestad", "erro"].some((term) => paymentStatus.includes(term));
  return !hasMercadoPagoUrl || invalidPayment;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  if (!isAdminOrCoordinator(session)) return NextResponse.json({ error: "Sem permissao para gerar boletos em lote." }, { status: 403 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const competencia = text(body.competencia);
  if (!/^\d{4}-\d{2}$/.test(competencia)) {
    return NextResponse.json({ error: "Informe o mes no formato AAAA-MM." }, { status: 400 });
  }

  const lancamentos = await dbList<Row>("receivables.json");
  const alvos = lancamentos.filter((row) => monthOf(row) === competencia && !paid(row) && needsBoleto(row));
  const ignorados = lancamentos.filter((row) => monthOf(row) === competencia && !paid(row) && !needsBoleto(row)).length;
  const resultados: { id: string; aluno: string; ok: boolean; erro?: string }[] = [];
  const origin = new URL(req.url).origin;

  for (const lancamento of alvos) {
    const id = text(lancamento.id);
    const aluno = text(lancamento.aluno || lancamento.nome || lancamento.descricao) || "Aluno";
    if (!id) {
      resultados.push({ id: "", aluno, ok: false, erro: "Lancamento sem identificador." });
      continue;
    }

    const result = await createMercadoPagoBoleto(lancamento, id, origin, { forceNewPayment: true });
    resultados.push({ id, aluno, ok: result.ok, erro: result.ok ? undefined : (result.detail || result.message) });
  }

  const gerados = resultados.filter((item) => item.ok).length;
  const erros = resultados.length - gerados;
  await dbUpdate<Row[]>("finance_audit.json", (current) => [
    ...(Array.isArray(current) ? current : []),
    {
      id: crypto.randomUUID(),
      data: new Date().toISOString(),
      acao: "gerar_boletos_mercado_pago_mes",
      usuario: session.pessoa || session.usuario,
      perfil: session.perfil,
      competencia,
      gerados,
      ignorados,
      erros,
    },
  ], []);

  return NextResponse.json({ ok: true, competencia, gerados, ignorados, erros, resultados });
}
