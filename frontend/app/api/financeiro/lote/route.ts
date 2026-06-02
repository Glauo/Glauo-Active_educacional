import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dbList, dbSet } from "@/lib/db";
import { criarBoleteMercadoPago } from "@/lib/mercadopago";

function text(value: unknown) {
  return String(value || "").trim();
}

function money(value: unknown) {
  return parseFloat(String(value || "0").replace(/[^\d.,-]/g, "").replace(",", ".")) || 0;
}

function webhookUrl() {
  return (
    process.env.ACTIVE_MERCADO_PAGO_WEBHOOK_URL ||
    process.env.MERCADO_PAGO_WEBHOOK_URL ||
    "https://ativoeducacional.tech/api/financeiro/mercado-pago/webhook"
  );
}

function activeStudent(student: Record<string, unknown>) {
  const status = text(student.status || student.situacao).toLowerCase();
  return !status.includes("inativ") && !status.includes("cancel") && !status.includes("tranc");
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const competencia = text(body.competencia) || new Date().toISOString().slice(0, 7);
  const valorPadrao = money(body.valor_padrao);
  const dia = Math.max(1, Math.min(28, Number(body.dia_vencimento) || 10));
  const vencimento = `${competencia}-${String(dia).padStart(2, "0")}`;
  const [students, receivables, audit] = await Promise.all([
    dbList<Record<string, unknown>>("students.json"),
    dbList<Record<string, unknown>>("receivables.json"),
    dbList<Record<string, unknown>>("finance_audit.json"),
  ]);

  const created: Record<string, unknown>[] = [];
  const skipped: Record<string, unknown>[] = [];
  const errosMp: Record<string, unknown>[] = [];

  for (const student of students.filter(activeStudent)) {
    const aluno = text(student.nome || student.name || student.login);
    if (!aluno) continue;

    const mensalidade = money(student.mensalidade || student.valor_mensalidade || student.plano_valor) || valorPadrao;
    if (!mensalidade) {
      skipped.push({ aluno, motivo: "sem_valor" });
      continue;
    }

    const duplicate = receivables.some((item) =>
      text(item.aluno || item.nome).toLowerCase() === aluno.toLowerCase()
      && text(item.competencia || item.referencia || item.descricao).includes(competencia)
    );
    if (duplicate) {
      skipped.push({ aluno, motivo: "ja_existe" });
      continue;
    }

    const id = crypto.randomUUID();

    // Dados do pagador
    const payerEmail = text(student.email || student.email_responsavel) || `aluno.${text(student.login || id).replace(/\s+/g, ".")}@activeeducacional.com.br`;
    const nomeCompleto = aluno.trim();
    const nomeParts = nomeCompleto.split(" ");
    const firstName = nomeParts[0] || "Responsavel";
    const lastName = nomeParts.slice(1).join(" ") || "Financeiro";
    const cpf = text(student.cpf || student.responsavel_cpf || "00000000000").replace(/\D/g, "") || "00000000000";

    // Endereço do aluno (obrigatório para boleto registrado no MP)
    const payerAddress = {
      zip_code: text(student.cep) || undefined,
      street_name: text(student.rua || student.endereco) || undefined,
      street_number: text(student.numero) || undefined,
      neighborhood: text(student.bairro) || undefined,
      city: text(student.cidade) || undefined,
      federal_unit: text(student.estado || student.uf) || undefined,
    };

    // Chamar API do Mercado Pago
    const mpResult = await criarBoleteMercadoPago({
      transaction_amount: mensalidade,
      description: `Mensalidade ${competencia} - ${aluno}`,
      payer_email: payerEmail,
      payer_first_name: firstName,
      payer_last_name: lastName,
      payer_cpf: cpf,
      payer_address: payerAddress,
      external_reference: id,
      notification_url: webhookUrl(),
    });

    if (!mpResult.ok) {
      errosMp.push({ aluno, erro: mpResult.error });
      // Mesmo com erro no MP, cria o lançamento interno como pendente
      created.push({
        id,
        aluno,
        aluno_login: student.login || "",
        turma: student.turma || student.classe || "",
        responsavel: student.responsavel || student.responsavel_financeiro || "",
        telefone: student.telefone || student.celular || student.whatsapp || "",
        email: payerEmail,
        descricao: `Mensalidade ${competencia}`,
        competencia,
        tipo_cobranca: "Mensalidade escolar",
        valor: mensalidade,
        vencimento,
        status: "Boleto pendente",
        boleto_status: "Erro MP",
        boleto_erro: mpResult.error,
        boleto_gerado_em: new Date().toISOString(),
        created_at: new Date().toISOString(),
        created_by: session.pessoa || session.usuario,
      });
      continue;
    }

    // Sucesso: salvar dados reais do Mercado Pago
    created.push({
      id,
      aluno,
      aluno_login: student.login || "",
      turma: student.turma || student.classe || "",
      responsavel: student.responsavel || student.responsavel_financeiro || "",
      telefone: student.telefone || student.celular || student.whatsapp || "",
      email: payerEmail,
      descricao: `Mensalidade ${competencia}`,
      competencia,
      tipo_cobranca: "Mensalidade escolar",
      valor: mensalidade,
      vencimento,
      status: "Boleto gerado",
      // Dados reais do Mercado Pago
      boleto_status: "Gerado MP",
      boleto_url: mpResult.boleto_url,
      boleto_codigo: mpResult.barcode || "",
      boleto_linha_digitavel: mpResult.digitable_line || mpResult.barcode || "",
      mp_payment_id: mpResult.payment_id,
      mp_status: mpResult.status,
      mp_status_detail: mpResult.status_detail,
      mp_date_of_expiration: mpResult.date_of_expiration,
      boleto_gerado_em: new Date().toISOString(),
      created_at: new Date().toISOString(),
      created_by: session.pessoa || session.usuario,
    });
  }

  await Promise.all([
    dbSet("receivables.json", [...receivables, ...created]),
    dbSet("finance_audit.json", [
      ...audit,
      {
        id: crypto.randomUUID(),
        data: new Date().toISOString(),
        acao: "gerar_boletos_lote_mp",
        usuario: session.pessoa || session.usuario,
        perfil: session.perfil,
        competencia,
        criados: created.length,
        ignorados: skipped.length,
        erros_mp: errosMp.length,
      },
    ]),
  ]);

  return NextResponse.json({
    ok: true,
    criados: created.length,
    ignorados: skipped.length,
    erros_mp: errosMp.length,
    detalhes_ignorados: skipped,
    detalhes_erros_mp: errosMp,
  });
}

