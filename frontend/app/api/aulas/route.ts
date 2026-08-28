import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dbList, dbSet } from "@/lib/db";
import { isAdminOrCoordinator, isTeacher, sameName } from "@/lib/roles";
import { isVipModule, migrateModule, VIP_DEFAULT_TOTAL, vipPackageStats } from "@/lib/course-modules";
import { configuredTeacherClassValue } from "@/lib/course-module-values.server";

type Row = Record<string, unknown>;

const CLASSES_KEY = "classes.json";
const TEACHERS_KEY = "teachers.json";
const SESSIONS_KEY = "class_sessions.json";
const PAYABLES_KEY = "payables.json";
const ATTENDANCE_KEY = "attendance.json";
const STUDENTS_KEY = "students.json";

function text(value: unknown) {
  return String(value || "").trim();
}

function todaySaoPauloISO() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function nowIso() {
  return new Date().toISOString();
}

function moneyValue(value: unknown) {
  const n = parseFloat(String(value || "").replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function classModule(turma: Row) {
  return migrateModule(turma.modulo || turma.tipo_aula || turma.modalidade || turma.nivel);
}

function toInt(value: unknown) {
  const n = parseInt(String(value || "0"), 10);
  return Number.isFinite(n) ? n : 0;
}

function className(turma: Row) {
  return text(turma.nome || turma.name || turma.turma);
}

function classId(turma: Row) {
  return text(turma.id || className(turma));
}

function teacherName(professor: Row) {
  return text(professor.nome || professor.name || professor.pessoa);
}

function findClass(turmas: Row[], idOrName: string) {
  return turmas.find((t) => classId(t) === idOrName || className(t) === idOrName);
}

function canUseClass(session: NonNullable<Awaited<ReturnType<typeof getSession>>>, turma: Row) {
  if (isAdminOrCoordinator(session)) return true;
  if (!isTeacher(session)) return false;
  return sameName(session.pessoa || session.usuario, turma.professor);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const aulas = await dbList<Row>(SESSIONS_KEY);
  const visible = isAdminOrCoordinator(session)
    ? aulas
    : aulas.filter((a) => sameName(a.professor, session.pessoa || session.usuario));
  return NextResponse.json({ aulas: visible });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  try {
    const body = await req.json();
    const action = text(body.action);
    const turmaRef = text(body.turmaId || body.turma || body.turmaNome);
    if (!turmaRef) return NextResponse.json({ error: "Turma obrigatória." }, { status: 400 });

    const [turmas, professores, aulas, despesas, frequencias, alunos] = await Promise.all([
      dbList<Row>(CLASSES_KEY),
      dbList<Row>(TEACHERS_KEY),
      dbList<Row>(SESSIONS_KEY),
      dbList<Row>(PAYABLES_KEY),
      dbList<Row>(ATTENDANCE_KEY),
      dbList<Row>(STUDENTS_KEY)
    ]);

    const turma = findClass(turmas, turmaRef);
    if (!turma) return NextResponse.json({ error: "Turma não encontrada." }, { status: 404 });
    if (!canUseClass(session, turma)) return NextResponse.json({ error: "Sem permissão para esta turma." }, { status: 403 });

    const turmaId = classId(turma);
    const manager = isAdminOrCoordinator(session);
    // Admin/Coordenador pode escolher professor; professor comum sempre registra como ele mesmo/da turma.
    const professor = manager
      ? text(body.professor || turma.professor || session.pessoa)
      : text(turma.professor || session.pessoa || session.usuario);
    const teacher: Row = professores.find((p) => sameName(teacherName(p), professor)) || {};
    const livro = text(turma.livro || turma.book || body.livro);
    const modulo = classModule(turma);
    const licaoAtual = text(turma.ultima_licao || turma.licao_atual || turma.ultima_aula || body.licao_inicio);
    // Lancamento manual com data retroativa e troca de professor e exclusivo de Admin/Coordenador.
    const today = todaySaoPauloISO();
    const dataAulaISO = manager ? (text(body.data_aula) || today) : today;

    if (action === "open") {
      const aberta = aulas.find((a) => a.status === "aberta" && text(a.turma_id) === turmaId);
      if (aberta) return NextResponse.json({ error: "Esta turma já possui aula aberta." }, { status: 409 });

      const tipoAula = text(body.tipo_aula || "Aula Normal");
      const horaInicio = text(body.hora_inicio);
      const aula = {
        id: crypto.randomUUID(),
        turma_id: turmaId,
        turma: className(turma),
        professor,
        professor_telefone: text(teacher.telefone || teacher.whatsapp || teacher.celular),
        professor_email: text(teacher.email),
        modulo,
        tipo_aula: tipoAula,
        livro,
        licao_inicio: text(body.licao_inicio) || licaoAtual,
        status: "aberta",
        data_aula: dataAulaISO,
        hora_inicio: horaInicio,
        aberta_por: session.pessoa || session.usuario,
        inicio: nowIso(),
        created_at: nowIso()
      };

      const nextTurmas = turmas.map((t) => classId(t) === turmaId ? { ...t, aula_aberta_id: aula.id, aula_status: "Aberta" } : t);
      await Promise.all([dbSet(SESSIONS_KEY, [...aulas, aula]), dbSet(CLASSES_KEY, nextTurmas)]);
      return NextResponse.json({ ok: true, aula }, { status: 201 });
    }

    if (action === "close") {
      const aulaId = text(body.aulaId);
      const idx = aulas.findIndex((a) =>
        a.status === "aberta" &&
        (text(a.id) === aulaId || text(a.turma_id) === turmaId)
      );
      if (idx === -1) return NextResponse.json({ error: "Nenhuma aula aberta encontrada para esta turma." }, { status: 404 });

      const licaoFim = text(body.licao_fim || body.licao_final);
      if (!licaoFim) return NextResponse.json({ error: "Informe a lição em que a aula parou." }, { status: 400 });

      const materia = text(body.materia || body.conteudo || body.tipo_aula || "Aula Normal");
      const tarefa = text(body.tarefa || body.trabalho_casa);
      const presencas = Array.isArray(body.presencas) ? body.presencas as Row[] : [];
      if (presencas.some((p) => typeof p.presente !== "boolean")) return NextResponse.json({ error: "Marque presenca ou falta de todos os alunos." }, { status: 400 });

      const modulo = classModule(turma);
      const valorPorModulo = await configuredTeacherClassValue(modulo);
      const valorAula = valorPorModulo || moneyValue((manager ? body.valor_aula : undefined) || turma.valor_aula || teacher.valor_aula || teacher.valor_hora || teacher.valor);
      const base = aulas[idx];
      const professorDaAula = manager ? professor : text(base.professor || turma.professor || session.pessoa || session.usuario);
      const vipConsumidos: Row[] = [];
      const fechada = {
        ...base,
        status: "fechada",
        licao_fim: licaoFim,
        materia,
        tarefa,
        presencas,
        observacoes: text(body.observacoes),
        valor_aula: valorAula,
        modulo,
        vip_consumed_students: vipConsumidos,
        fechada_por: session.pessoa || session.usuario,
        fim: nowIso(),
        updated_at: nowIso()
      };
      const nextAulas = [...aulas];
      nextAulas[idx] = fechada;

      const nextTurmas = turmas.map((t) => classId(t) === turmaId ? {
        ...t,
        ultima_licao: licaoFim,
        ultima_aula: nowIso(),
        aula_aberta_id: "",
        aula_status: "Fechada"
      } : t);

      const aulaFechadaId = text(base.id);
      const registrosFrequencia = presencas.map((p) => ({
        id: crypto.randomUUID(),
        aula_id: aulaFechadaId,
        turma_id: turmaId,
        turma: className(turma),
        professor: professorDaAula,
        aluno_id: text(p.aluno_id),
        aluno: text(p.aluno),
        presente: Boolean(p.presente),
        falta: !Boolean(p.presente),
        livro,
        licao_inicio: text(base.licao_inicio),
        licao_fim: licaoFim,
        materia,
        tarefa,
        data: nowIso()
      }));
      const nextAlunos = alunos.map((aluno) => {
        const alunoTurma = text(aluno.turma || aluno.classe);
        const alunoModulo = text(aluno.modulo || aluno.modalidade || modulo);
        if (!sameName(alunoTurma, className(turma)) || !isVipModule(alunoModulo)) return aluno;
        const pacote = vipPackageStats({ ...aluno, modulo: alunoModulo });
        // Unlimited plan: only increment dadas counter, never deduct
        if (pacote?.unlimited) {
          const dadas = Math.max(0, toInt(aluno.vip_aulas_dadas ?? aluno.aulas_dadas_vip) + 1);
          vipConsumidos.push({ aluno: text(aluno.nome || aluno.name), anteriores: -1, restantes: -1, total: -1 });
          return { ...aluno, vip_aulas_dadas: dadas, aulas_dadas_vip: dadas };
        }
        const total = pacote?.total || VIP_DEFAULT_TOTAL;
        const restantesAtuais = pacote?.restantes ?? Math.max(0, toInt(aluno.vip_aulas_restantes || total));
        if (restantesAtuais <= 0) return { ...aluno, vip_aulas_total: total, vip_aulas_restantes: 0 };
        const restantes = Math.max(0, restantesAtuais - 1);
        vipConsumidos.push({
          aluno: text(aluno.nome || aluno.name),
          anteriores: restantesAtuais,
          restantes,
          total,
        });
        return { ...aluno, vip_aulas_total: total, vip_aulas_restantes: restantes };
      });
      const alreadyPayable = despesas.some((d) => text(d.aula_id) === aulaFechadaId);
      const descricao = `Aula dada - ${className(turma)} - ${livro || "Livro não informado"} - lição ${text(base.licao_inicio) || "início"} até ${licaoFim}`;
      const payable = {
        id: crypto.randomUUID(),
        aula_id: aulaFechadaId,
        tipo_origem: "aula_professor",
        categoria: "Professor",
        aluno: professorDaAula,
        nome: professorDaAula,
        professor: professorDaAula,
        professor_telefone: text(teacher.telefone || teacher.whatsapp || teacher.celular),
        professor_email: text(teacher.email),
        turma: className(turma),
        modulo,
        livro,
        licao_inicio: text(base.licao_inicio),
        licao_fim: licaoFim,
        descricao,
        valor: valorAula,
        valor_unitario: valorAula,
        vencimento: dataAulaISO,
        data_vencimento: dataAulaISO,
        data_aula: text(base.data_aula) || dataAulaISO,
        vip_consumed_students: vipConsumidos,
        status: "Pendente",
        created_at: nowIso()
      };

      await Promise.all([
        dbSet(SESSIONS_KEY, nextAulas),
        dbSet(CLASSES_KEY, nextTurmas),
        dbSet(PAYABLES_KEY, alreadyPayable ? despesas : [...despesas, payable]),
        dbSet(ATTENDANCE_KEY, [...frequencias, ...registrosFrequencia]),
        dbSet(STUDENTS_KEY, nextAlunos)
      ]);

      return NextResponse.json({ ok: true, aula: fechada, financeiro: alreadyPayable ? null : payable });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (err) {
    console.error("[aulas POST]", err);
    return NextResponse.json({ error: "Erro ao processar aula." }, { status: 500 });
  }
}
