import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dbList, dbSet } from "@/lib/db";
import { canManageSchoolContent, homeworkTotal, normalizeList, nowIso, text, type Homework, type HomeworkQuestion } from "@/lib/school-modules";
import { notifyStudentsAboutLaunch } from "@/lib/student-launch-notifications";
import { resolveBookContentTarget } from "@/lib/book-content-targeting";

const KEY = "activities.json";

function normalizeQuestions(body: Homework): HomeworkQuestion[] {
  const source = Array.isArray(body.questions) ? body.questions : [];
  if (source.length === 0) {
    return [{
      id: crypto.randomUUID(),
      tipo: "aberta",
      enunciado: "Descreva o que voce aprendeu no conteudo indicado.",
      pontos: Number(body.peso) || 10,
    }];
  }
  return source.map((question, index) => ({
    id: text(question.id) || crypto.randomUUID(),
    tipo: question.tipo || "aberta",
    enunciado: text(question.enunciado) || `Questao ${index + 1}`,
    opcoes: normalizeList(question.opcoes),
    correta_idx: null,
    correta_texto: "",
    pontos: Number(question.pontos) || 1,
    feedback: text(question.feedback),
  }));
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const activities = await dbList<Homework>(KEY);
  return NextResponse.json(activities);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canManageSchoolContent(session)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }
  const body = (await req.json()) as Homework;
  const titulo = text(body.titulo);
  if (!titulo) return NextResponse.json({ error: "Titulo da licao e obrigatorio." }, { status: 400 });
  let target;
  try {
    target = await resolveBookContentTarget(body);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Destinatario invalido." }, { status: 400 });
  }
  const questions = normalizeQuestions(body);
  const item: Homework = {
    ...body,
    id: text(body.id) || crypto.randomUUID(),
    tipo: "Licao de Casa",
    titulo,
    descricao: text(body.descricao || body.instrucoes),
    disciplina: text(body.disciplina || "Geral"),
    turma: target.turma,
    turmas: target.turmas,
    aluno: target.aluno,
    alunos: target.alunos,
    livro: target.livro,
    capitulo: text(body.capitulo || target.referencia),
    aula_referencia: text(body.aula_referencia),
    habilidade: text(body.habilidade),
    due_date: text(body.due_date),
    peso: Number(body.peso) || homeworkTotal({ questions }),
    questions,
    allow_resubmission: Boolean(body.allow_resubmission),
    status: text(body.status || "Ativa"),
    autor: session.pessoa || session.usuario,
    created_at: nowIso(),
    notification_status: { push: "pendente", whatsapp: "pendente", email: "pendente" },
  };
  const [activities, students] = await Promise.all([dbList<Homework>(KEY), dbList<Record<string, unknown>>("students.json")]);
  if (!text(item.status).toLowerCase().includes("rascunho")) {
    item.notification_status = await notifyStudentsAboutLaunch({
      students,
      item,
      kind: "licao",
      title: `Nova lição de casa: ${titulo}`,
      body: `Você recebeu uma nova lição de ${item.disciplina}. Prazo: ${text(item.due_date) || "consulte no portal"}.`,
      session,
    });
  } else {
    item.notification_status = { push: "rascunho", whatsapp: "rascunho", email: "rascunho", total_destinatarios: 0 };
  }
  await dbSet(KEY, [...activities, item]);
  return NextResponse.json(item, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || !canManageSchoolContent(session)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }
  const body = (await req.json()) as Homework;
  const id = text(body.id);
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
  const activities = await dbList<Homework>(KEY);
  const idx = activities.findIndex((item) => text(item.id) === id);
  if (idx === -1) return NextResponse.json({ error: "Nao encontrado" }, { status: 404 });
  let target;
  try {
    target = await resolveBookContentTarget({ ...activities[idx], ...body });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Destinatario invalido." }, { status: 400 });
  }
  activities[idx] = {
    ...activities[idx],
    ...body,
    turma: target.turma,
    turmas: target.turmas,
    aluno: target.aluno,
    alunos: target.alunos,
    livro: target.livro,
    capitulo: text(body.capitulo || activities[idx].capitulo || target.referencia),
    questions: body.questions ? normalizeQuestions(body) : activities[idx].questions,
    updated_at: nowIso(),
  };
  await dbSet(KEY, activities);
  return NextResponse.json(activities[idx]);
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || !canManageSchoolContent(session)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const bulk = searchParams.get("bulk");
  const activities = await dbList<Homework>(KEY);

  if (bulk === "today") {
    const today = new Date().toISOString().slice(0, 10);
    const kept = activities.filter((item) => !text(item.created_at).startsWith(today));
    const deleted = activities.length - kept.length;
    await dbSet(KEY, kept);
    return NextResponse.json({ ok: true, deleted });
  }

  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
  await dbSet(KEY, activities.filter((item) => text(item.id) !== id));
  return NextResponse.json({ ok: true });
}
