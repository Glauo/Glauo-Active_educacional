import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dbList, dbUpdate } from "@/lib/db";
import { isAdmin, isAdminOrCoordinator } from "@/lib/roles";

type Row = Record<string, unknown>;
const CONTRACT_MONTHS = 24;
const CANCELLATION_RATE = 0.1;

function text(value: unknown) { return String(value || "").trim(); }

function studentId(student: Row) {
  return text(student.id || student.aluno_id || student.student_id || student.login || student.usuario || student.cpf);
}

function money(value: unknown) {
  const parsed = Number.parseFloat(text(value).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

function dateOnly(value: unknown) {
  const raw = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : new Date().toISOString().slice(0, 10);
}

function monthDifference(start: string, end = new Date()) {
  const match = start.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return 0;
  const startDate = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  let months = (end.getFullYear() - startDate.getFullYear()) * 12 + end.getMonth() - startDate.getMonth();
  if (end.getDate() < startDate.getDate()) months -= 1;
  return Math.max(0, months);
}

function openContract(contract: Row) {
  const status = text(contract.status).toLowerCase();
  return status === "ativo" || status === "inscrito" || status === "desistencia solicitada";
}

function contractType(contract: Row) {
  const type = text(contract.tipo || contract.documento_tipo).toLowerCase();
  if (type.includes("cancel")) return "Cancelamento";
  if (type.includes("troca") || type.includes("modalidade")) return "Troca de modalidade";
  return "Matricula";
}

function activeStudent(student: Row) {
  const status = text(student.status || student.situacao || "Ativo").toLowerCase();
  return student.is_active !== false && !status.includes("cancel") && !status.includes("inativ") && !status.includes("tranc");
}

function sameStudent(student: Row, receivable: Row) {
  const id = studentId(student);
  const login = text(student.login || student.usuario).toLowerCase();
  const name = text(student.nome || student.name).toLowerCase();
  return Boolean(
    (id && text(receivable.aluno_id || receivable.student_id) === id) ||
    (login && text(receivable.aluno_login || receivable.login).toLowerCase() === login) ||
    (name && text(receivable.aluno || receivable.nome).toLowerCase() === name)
  );
}

function dateValue(value: unknown) {
  const raw = dateOnly(value);
  return new Date(`${raw}T12:00:00`).getTime();
}

function monthlyRows(student: Row, receivables: Row[]) {
  return receivables
    .filter((row) => sameStudent(student, row) && text(`${row.categoria || ""} ${row.tipo_cobranca || ""} ${row.descricao || ""}`).toLowerCase().includes("mensal"))
    .sort((a, b) => dateValue(a.vencimento || a.data_vencimento) - dateValue(b.vencimento || b.data_vencimento));
}

function contractStart(student: Row, monthly: Row[]) {
  return dateOnly(student.contrato_inicio || student.data_matricula || student.matricula_data || monthly[0]?.vencimento || monthly[0]?.data_vencimento || student.created_at);
}

function studentMonthlyValue(student: Row, monthly: Row[]) {
  const direct = money(student.mensalidade || student.valor_mensalidade || student.plano_valor);
  return direct || money(monthly.find((row) => money(row.valor_parcela ?? row.valor) > 0)?.valor_parcela ?? monthly.find((row) => money(row.valor_parcela ?? row.valor) > 0)?.valor);
}

function cancellationValues(contract: Row) {
  const start = dateOnly(contract.data_inicio || contract.inscrito_em);
  const totalInstallments = Math.max(1, Number(contract.parcelas_totais) || CONTRACT_MONTHS);
  const elapsed = Math.min(totalInstallments, monthDifference(start));
  const remaining = Math.max(0, totalInstallments - elapsed);
  const monthlyValue = money(contract.valor_mensal);
  const fee = Number((monthlyValue * remaining * CANCELLATION_RATE).toFixed(2));
  return { totalInstallments, elapsed, remaining, monthlyValue, fee };
}

async function audit(entry: Row) {
  await dbUpdate<Row[]>("contract_audit.json", (items) => [
    ...(Array.isArray(items) ? items : []),
    { id: crypto.randomUUID(), data: new Date().toISOString(), ...entry },
  ], []);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  if (!isAdminOrCoordinator(session)) return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  return NextResponse.json({ contratos: await dbList<Row>("contracts.json") });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  if (!isAdminOrCoordinator(session)) return NextResponse.json({ error: "Sem permissao." }, { status: 403 });

  const body = await req.json().catch(() => ({})) as Row;
  const action = text(body.action).toLowerCase();
  const actor = session.pessoa || session.usuario;

  if (action === "normalizar_matriculas") {
    if (!isAdmin(session)) return NextResponse.json({ error: "Somente administrador pode normalizar contratos existentes." }, { status: 403 });
    let updatedCount = 0;
    await dbUpdate<Row[]>("contracts.json", (items) => (Array.isArray(items) ? items : []).map((contract) => {
      if (text(contract.tipo || contract.documento_tipo)) return contract;
      updatedCount += 1;
      return { ...contract, tipo: "Matricula", tipo_normalizado_em: new Date().toISOString(), tipo_normalizado_por: actor };
    }), []);
    await audit({ acao: "normalizacao_contratos_matricula", usuario: actor, perfil: session.perfil, contratos_atualizados: updatedCount });
    return NextResponse.json({ ok: true, atualizados: updatedCount });
  }

  if (action === "inscricao_lote") {
    const [students, contracts, receivables] = await Promise.all([
      dbList<Row>("students.json"),
      dbList<Row>("contracts.json"),
      dbList<Row>("receivables.json"),
    ]);
    const created: Row[] = [];
    const skipped: Row[] = [];
    for (const student of students.filter(activeStudent)) {
      const alunoId = studentId(student);
      const aluno = text(student.nome || student.name);
      if (!alunoId || !aluno || contracts.some((contract) => text(contract.aluno_id) === alunoId && openContract(contract))) {
        skipped.push({ aluno, motivo: "ja_possui_contrato" });
        continue;
      }
      const monthly = monthlyRows(student, receivables);
      const value = studentMonthlyValue(student, monthly);
      created.push({
        id: crypto.randomUUID(),
        aluno_id: alunoId,
        aluno,
        aluno_login: text(student.login || student.usuario),
        curso: text(student.modulo || student.modalidade) || "Curso de ingles",
        data_inicio: contractStart(student, monthly),
        parcelas_totais: CONTRACT_MONTHS,
        valor_mensal: value,
        valor_total: Number((value * CONTRACT_MONTHS).toFixed(2)),
        valor_pendente: value <= 0,
        tipo: "Matricula",
        status: "Ativo",
        inscrito_em: new Date().toISOString(),
        inscrito_por: actor,
        origem: "inclusao_lote_alunos_ativos",
      });
    }
    if (created.length) {
      const contractIds = new Map(created.map((contract) => [text(contract.aluno_id), contract]));
      await dbUpdate<Row[]>("contracts.json", (items) => [...(Array.isArray(items) ? items : []), ...created], []);
      await dbUpdate<Row[]>("students.json", (items) => (Array.isArray(items) ? items : []).map((student) => {
      const contract = contractIds.get(studentId(student));
        return contract ? {
          ...student,
          contrato_id: contract.id,
          situacao_contrato: "Ativo",
          contrato_inicio: contract.data_inicio,
          contrato_parcelas_totais: CONTRACT_MONTHS,
        } : student;
      }), []);
    }
    const pendentesValor = created.filter((contract) => contract.valor_pendente).length;
    await audit({ acao: "inclusao_lote_contratos", usuario: actor, perfil: session.perfil, criados: created.length, ignorados: skipped.length, valores_pendentes: pendentesValor });
    return NextResponse.json({ ok: true, criados: created.length, ignorados: skipped.length, valores_pendentes: pendentesValor, contratos: created, detalhes_ignorados: skipped });
  }

  if (action === "inscricao") {
    const alunoId = text(body.aluno_id);
    const aluno = text(body.aluno);
    const valorMensal = money(body.valor_mensal);
    if (!alunoId || !aluno || valorMensal <= 0) {
      return NextResponse.json({ error: "Aluno e valor mensal valido sao obrigatorios." }, { status: 400 });
    }
    const contracts = await dbList<Row>("contracts.json");
    if (contracts.some((contract) => text(contract.aluno_id) === alunoId && openContract(contract))) {
      return NextResponse.json({ error: "Este aluno ja possui um contrato ativo. Registre desistência ou cancelamento antes de criar outro." }, { status: 409 });
    }
    const contract = {
      id: crypto.randomUUID(),
      aluno_id: alunoId,
      aluno,
      aluno_login: text(body.aluno_login),
      curso: text(body.curso) || "Curso de ingles",
      data_inicio: dateOnly(body.data_inicio),
      parcelas_totais: CONTRACT_MONTHS,
      valor_mensal: valorMensal,
      valor_total: Number((valorMensal * CONTRACT_MONTHS).toFixed(2)),
      tipo: "Matricula",
      status: "Ativo",
      inscrito_em: new Date().toISOString(),
      inscrito_por: actor,
      observacoes: text(body.observacoes),
    };
    await dbUpdate<Row[]>("contracts.json", (items) => [...(Array.isArray(items) ? items : []), contract], []);
    await dbUpdate<Row[]>("students.json", (items) => (Array.isArray(items) ? items : []).map((student) => studentId(student) === alunoId ? {
          ...student,
      contrato_id: contract.id,
      situacao_contrato: "Ativo",
      contrato_inicio: contract.data_inicio,
      contrato_parcelas_totais: CONTRACT_MONTHS,
    } : student), []);
    await audit({ acao: "inscricao_contrato", contrato_id: contract.id, aluno_id: alunoId, aluno, usuario: actor, perfil: session.perfil });
    return NextResponse.json({ ok: true, contrato: contract }, { status: 201 });
  }

  const contractId = text(body.contrato_id);
  if (!contractId) return NextResponse.json({ error: "Contrato obrigatorio." }, { status: 400 });
  const contracts = await dbList<Row>("contracts.json");
  const current = contracts.find((contract) => text(contract.id) === contractId);
  if (!current) return NextResponse.json({ error: "Contrato nao encontrado." }, { status: 404 });

  if (action === "desistencia") {
    if (!openContract(current)) return NextResponse.json({ error: "Este contrato nao permite desistência." }, { status: 409 });
    const updated = {
      ...current,
      status: "Desistencia solicitada",
      desistencia_em: new Date().toISOString(),
      desistencia_por: actor,
      motivo_desistencia: text(body.motivo),
    };
    await dbUpdate<Row[]>("contracts.json", (items) => (Array.isArray(items) ? items : []).map((item) => text(item.id) === contractId ? updated : item), []);
    await dbUpdate<Row[]>("students.json", (items) => (Array.isArray(items) ? items : []).map((student) => studentId(student) === text(current.aluno_id) ? { ...student, situacao_contrato: "Desistencia solicitada" } : student), []);
    await audit({ acao: "desistencia_contrato", contrato_id: contractId, aluno_id: current.aluno_id, aluno: current.aluno, usuario: actor, perfil: session.perfil, motivo: text(body.motivo) });
    return NextResponse.json({ ok: true, contrato: updated });
  }

  if (action === "cancelamento") {
    if (!isAdmin(session)) return NextResponse.json({ error: "Somente administrador pode confirmar cancelamento com taxa financeira." }, { status: 403 });
    if (!openContract(current)) return NextResponse.json({ error: "Este contrato ja esta encerrado." }, { status: 409 });

    const values = cancellationValues(current);
    const updated = {
      ...current,
      status: "Cancelado",
      cancelado_em: new Date().toISOString(),
      cancelado_por: actor,
      motivo_cancelamento: text(body.motivo),
      taxa_cancelamento_percentual: 10,
      taxa_cancelamento_valor: values.fee,
      parcelas_restantes_cancelamento: values.remaining,
    };
    const receivables = await dbList<Row>("receivables.json");
    const existingFee = receivables.find((row) => text(row.contract_id) === contractId && text(row.tipo_cobranca) === "Taxa de cancelamento" && !text(row.status).toLowerCase().includes("cancel"));
    const cancellationDocument = contracts.find((item) => text(item.contrato_origem_id) === contractId && contractType(item) === "Cancelamento");
    const feeReceivable = existingFee || (values.fee > 0 ? {
      id: crypto.randomUUID(),
      contract_id: contractId,
      aluno_id: text(current.aluno_id),
      aluno: text(current.aluno),
      aluno_login: text(current.aluno_login),
      descricao: `Taxa de cancelamento contratual - 10% de ${values.remaining} parcela(s) restante(s)`,
      tipo_cobranca: "Taxa de cancelamento",
      categoria: "Taxa de cancelamento",
      valor: values.fee,
      valor_parcela: values.fee,
      vencimento: dateOnly(body.vencimento || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)),
      status: "Aberto",
      created_at: new Date().toISOString(),
      created_by: actor,
      envio_automatico_bloqueado: true,
    } : null);

    const cancellationRecord = cancellationDocument || {
      id: crypto.randomUUID(),
      tipo: "Cancelamento",
      contrato_origem_id: contractId,
      aluno_id: text(current.aluno_id),
      aluno: text(current.aluno),
      aluno_login: text(current.aluno_login),
      curso: text(current.curso),
      data_inicio: dateOnly(body.data_cancelamento || new Date().toISOString().slice(0, 10)),
      status: "Registrado",
      motivo_cancelamento: text(body.motivo),
      taxa_cancelamento_percentual: 10,
      taxa_cancelamento_valor: values.fee,
      parcelas_restantes_cancelamento: values.remaining,
      registrado_em: new Date().toISOString(),
      registrado_por: actor,
    };
    await dbUpdate<Row[]>("contracts.json", (items) => {
      const currentItems = Array.isArray(items) ? items : [];
      return [...currentItems.map((item) => text(item.id) === contractId ? updated : item), ...(cancellationDocument ? [] : [cancellationRecord])];
    }, []);
    if (feeReceivable && !existingFee) await dbUpdate<Row[]>("receivables.json", (items) => [...(Array.isArray(items) ? items : []), feeReceivable], []);
    await dbUpdate<Row[]>("students.json", (items) => (Array.isArray(items) ? items : []).map((student) => studentId(student) === text(current.aluno_id) ? {
      ...student,
      situacao_contrato: "Cancelado",
      contrato_cancelado_em: updated.cancelado_em,
      status: "Cancelado",
      is_active: false,
    } : student), []);
    await audit({ acao: "cancelamento_contrato", contrato_id: contractId, aluno_id: current.aluno_id, aluno: current.aluno, usuario: actor, perfil: session.perfil, motivo: text(body.motivo), ...values, taxa_lancamento_id: feeReceivable?.id || "" });
    return NextResponse.json({ ok: true, contrato: updated, documento_cancelamento: cancellationRecord, taxa_cancelamento: feeReceivable, calculo: values });
  }

  if (action === "troca_modalidade") {
    if (!openContract(current)) return NextResponse.json({ error: "Este contrato nao permite troca de modalidade." }, { status: 409 });
    const novaModalidade = text(body.nova_modalidade);
    if (!novaModalidade) return NextResponse.json({ error: "Informe a nova modalidade." }, { status: 400 });
    const antigaModalidade = text(current.curso) || "Curso de ingles";
    if (novaModalidade === antigaModalidade) return NextResponse.json({ error: "Selecione uma modalidade diferente da atual." }, { status: 400 });
    const changeRecord = {
      id: crypto.randomUUID(),
      tipo: "Troca de modalidade",
      contrato_origem_id: contractId,
      aluno_id: text(current.aluno_id),
      aluno: text(current.aluno),
      aluno_login: text(current.aluno_login),
      curso: novaModalidade,
      modalidade_anterior: antigaModalidade,
      modalidade_nova: novaModalidade,
      data_inicio: dateOnly(body.data_troca || new Date().toISOString().slice(0, 10)),
      status: "Registrado",
      motivo_troca_modalidade: text(body.motivo),
      registrado_em: new Date().toISOString(),
      registrado_por: actor,
    };
    const updated = { ...current, curso: novaModalidade, modalidade_atualizada_em: changeRecord.data_inicio };
    await dbUpdate<Row[]>("contracts.json", (items) => {
      const currentItems = Array.isArray(items) ? items : [];
      return [...currentItems.map((item) => text(item.id) === contractId ? updated : item), changeRecord];
    }, []);
    await dbUpdate<Row[]>("students.json", (items) => (Array.isArray(items) ? items : []).map((student) => studentId(student) === text(current.aluno_id) ? {
      ...student,
      modalidade_anterior: text(student.modalidade),
      modalidade: novaModalidade,
    } : student), []);
    await audit({ acao: "troca_modalidade_contrato", contrato_id: contractId, aluno_id: current.aluno_id, aluno: current.aluno, usuario: actor, perfil: session.perfil, modalidade_anterior: antigaModalidade, modalidade_nova: novaModalidade, motivo: text(body.motivo) });
    return NextResponse.json({ ok: true, contrato: updated, documento_troca_modalidade: changeRecord });
  }

  return NextResponse.json({ error: "Acao de contrato invalida." }, { status: 400 });
}
