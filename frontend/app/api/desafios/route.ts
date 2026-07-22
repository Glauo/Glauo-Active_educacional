import { NextRequest, NextResponse } from "next/server";
import { dbList, dbSet } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { notifyStudentsAboutLaunch } from "@/lib/student-launch-notifications";
import { canManageSchoolContent, normalizeList, text } from "@/lib/school-modules";
import { resolveBookContentTarget } from "@/lib/book-content-targeting";

type QuestaoDesafio = {
  id?: string;
  tipo?: string;
  enunciado?: string;
  opcoes?: string[] | string;
  pontos?: number | string;
  feedback?: string;
  [k: string]: unknown;
};

type Desafio = { id?: string; titulo?: string; turma?: string; turmas?: string[]; aluno?: string; alunos?: string[]; pontos?: number | string; status?: string; questions?: QuestaoDesafio[]; [k: string]: unknown };

function questionType(value: unknown) {
  const raw = text(value).toLowerCase();
  if (raw.includes("multipla") || raw.includes("multipla_escolha") || raw.includes("assinal")) return "multipla_escolha";
  if (raw.includes("verdadeiro") || raw.includes("falso")) return "verdadeiro_falso";
  if (raw.includes("upload") || raw.includes("arquivo") || raw.includes("link")) return "upload";
  return "aberta";
}

function normalizeQuestions(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item, index) => {
      const question = (item || {}) as QuestaoDesafio;
      const tipo = questionType(question.tipo);
      return {
        ...question,
        id: text(question.id) || `desafio_q_${Date.now()}_${index + 1}`,
        tipo,
        enunciado: text(question.enunciado),
        opcoes: tipo === "multipla_escolha" ? normalizeList(question.opcoes) : [],
        pontos: Number(question.pontos) || 1,
        feedback: text(question.feedback),
      };
    })
    .filter((question) => question.enunciado);
}

function questionsTotal(questions?: QuestaoDesafio[]) {
  return (questions || []).reduce((sum, question) => sum + (Number(question.pontos) || 0), 0);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const desafios = await dbList<Desafio>("challenges.json");
  return NextResponse.json(desafios);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canManageSchoolContent(session)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const body = await req.json() as Desafio;
  const [desafios, students] = await Promise.all([dbList<Desafio>("challenges.json"), dbList<Record<string, unknown>>("students.json")]);
  let target;
  try {
    target = await resolveBookContentTarget(body);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Destinatário inválido." }, { status: 400 });
  }
  const questions = normalizeQuestions(body.questions);
  const novo: Desafio = {
    ...body,
    id: body.id || `d_${Date.now()}`,
    turma: target.turma,
    turmas: target.turmas,
    aluno: target.aluno,
    alunos: target.alunos,
    livro: target.livro,
    licao: text(body.licao || body.capitulo || target.referencia),
    ...(questions ? { questions, pontos: questionsTotal(questions) || Number(body.pontos) || 0 } : {}),
    status: body.status || "Publicado",
  };
  if (!text(novo.status).toLowerCase().includes("rascunho")) {
    novo.notification_status = await notifyStudentsAboutLaunch({
      students,
      item: novo,
      kind: "desafio",
      title: `Novo desafio: ${text(novo.titulo || "Desafio")}`,
      body: `Um novo desafio foi lançado para você. Pontos: ${text(novo.pontos || 0)}.`,
      session,
    });
  } else {
    novo.notification_status = { push: "rascunho", whatsapp: "rascunho", email: "rascunho", total_destinatarios: 0 };
  }
  desafios.push(novo);
  await dbSet("challenges.json", desafios);
  return NextResponse.json(novo, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || !canManageSchoolContent(session)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const body = await req.json() as Desafio;
  if (!body.id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  const desafios = await dbList<Desafio>("challenges.json");
  const idx = desafios.findIndex((d) => d.id === body.id);
  const questions = body.questions === undefined ? undefined : normalizeQuestions(body.questions);
  if (idx === -1) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  let target;
  try {
    target = await resolveBookContentTarget({ ...desafios[idx], ...body });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Destinatário inválido." }, { status: 400 });
  }
  desafios[idx] = {
    ...desafios[idx],
    ...body,
    turma: target.turma,
    turmas: target.turmas,
    aluno: target.aluno,
    alunos: target.alunos,
    livro: target.livro,
    licao: text(body.licao || body.capitulo || desafios[idx].licao || target.referencia),
    ...(questions ? { questions, pontos: questionsTotal(questions) || Number(body.pontos) || Number(desafios[idx].pontos) || 0 } : {}),
  };
  await dbSet("challenges.json", desafios);
  return NextResponse.json(desafios[idx]);
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || !canManageSchoolContent(session)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  const desafios = await dbList<Desafio>("challenges.json");
  const filtered = desafios.filter((d) => d.id !== id);
  await dbSet("challenges.json", filtered);
  return NextResponse.json({ ok: true });
}
