import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dbList, dbSet } from "@/lib/db";

function text(value: unknown) {
  return String(value || "").trim();
}

function money(value: unknown) {
  return parseFloat(String(value || "0").replace(/[^\d.,-]/g, "").replace(",", ".")) || 0;
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
    created.push({
      id: crypto.randomUUID(),
      aluno,
      aluno_login: student.login || "",
      turma: student.turma || student.classe || "",
      responsavel: student.responsavel || student.responsavel_financeiro || "",
      telefone: student.telefone || student.celular || student.whatsapp || "",
      email: student.email || student.email_responsavel || "",
      descricao: `Mensalidade ${competencia}`,
      competencia,
      tipo_cobranca: "Mensalidade escolar",
      valor: mensalidade,
      vencimento,
      status: "Aberto",
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
        acao: "gerar_boletos_lote",
        usuario: session.pessoa || session.usuario,
        perfil: session.perfil,
        competencia,
        criados: created.length,
        ignorados: skipped.length,
      },
    ]),
  ]);

  return NextResponse.json({ ok: true, criados: created.length, ignorados: skipped.length, detalhes_ignorados: skipped });
}
