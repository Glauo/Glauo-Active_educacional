import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dbList, dbSet } from "@/lib/db";
import { canManageAllSchoolContent, canManageSchoolContent, normalizeList, nowIso, text, todayPtBr, type WallPost } from "@/lib/school-modules";
import { notifyStudentsAboutLaunch } from "@/lib/student-launch-notifications";

const KEY = "messages.json";

function ownedBy(post: WallPost, actor: string) {
  return text(post.autor).toLowerCase() === actor.toLowerCase();
}

function isDraft(status: unknown) {
  return text(status).toLowerCase().includes("rascunho");
}

function notificationDone(status: unknown) {
  const data = status && typeof status === "object" ? status as Record<string, unknown> : {};
  const whatsapp = text(data.whatsapp).toLowerCase();
  const email = text(data.email).toLowerCase();
  return whatsapp.includes("enviados:") || whatsapp.includes("sem_destinatarios") || email.includes("enviados:") || email.includes("sem_destinatarios");
}

function shouldNotifyOnUpdate(before: WallPost, after: WallPost, body: WallPost) {
  if (isDraft(after.status)) return false;
  if (text(body.enviar_notificacao).toLowerCase() === "true") return true;
  if (isDraft(before.status) && !isDraft(after.status)) return true;
  return !notificationDone(after.notification_status);
}

async function notifyMuralPost(post: WallPost, session: NonNullable<Awaited<ReturnType<typeof getSession>>>) {
  const students = await dbList<Record<string, unknown>>("students.json");
  try {
    return {
      ...(await notifyStudentsAboutLaunch({
        students,
        item: post,
        kind: "comunicado",
        title: `${text(post.tipo_post || "Comunicado")}: ${text(post.titulo)}`,
        body: text(post.mensagem),
        session,
      })),
      notificado_em: nowIso(),
    };
  } catch (err) {
    console.error("[mural notificacao]", err);
    return {
      push: "erro",
      whatsapp: `erro:${err instanceof Error ? err.message : "falha no envio"}`.slice(0, 180),
      email: `erro:${err instanceof Error ? err.message : "falha no envio"}`.slice(0, 180),
      total_destinatarios: 0,
      notificado_em: nowIso(),
    };
  }
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const posts = await dbList<WallPost>(KEY);
  return NextResponse.json(posts);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canManageSchoolContent(session)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const body = (await req.json()) as WallPost;
  const titulo = text(body.titulo);
  const mensagem = text(body.mensagem || body.conteudo);
  if (!titulo || !mensagem) {
    return NextResponse.json({ error: "Titulo e conteudo sao obrigatorios." }, { status: 400 });
  }
  if (titulo.length > 100) {
    return NextResponse.json({ error: "Titulo deve ter no maximo 100 caracteres." }, { status: 400 });
  }

  const canPin = canManageAllSchoolContent(session);
  const post: WallPost = {
    ...body,
    id: text(body.id) || crypto.randomUUID(),
    titulo,
    mensagem,
    data: text(body.data) || todayPtBr(),
    publicado_em: text(body.publicado_em) || nowIso(),
    autor: session.pessoa || session.usuario,
    turma: text(body.turma || "Todas") || "Todas",
    turmas: normalizeList(body.turmas),
    aluno: text(body.aluno),
    alunos: normalizeList(body.alunos),
    publico: text(body.publico || "Alunos"),
    tipo_post: text(body.tipo_post || "Aviso Geral"),
    status: text(body.status || "Ativo"),
    fixado: canPin ? Boolean(body.fixado) : false,
    requer_confirmacao: Boolean(body.requer_confirmacao),
    confirmacoes: Array.isArray(body.confirmacoes) ? body.confirmacoes : [],
    votos: Array.isArray(body.votos) ? body.votos : [],
    notification_status: {
      push: "pendente",
      whatsapp: "pendente",
      email: "pendente",
      urgent: text(body.tipo_post).toLowerCase().includes("urgente"),
    },
  };

  const posts = await dbList<WallPost>(KEY);
  if (!text(post.status).toLowerCase().includes("rascunho")) {
    post.notification_status = await notifyMuralPost(post, session);
  } else {
    post.notification_status = { push: "rascunho", whatsapp: "rascunho", email: "rascunho", total_destinatarios: 0 };
  }
  await dbSet(KEY, [...posts, post]);
  return NextResponse.json(post, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || !canManageSchoolContent(session)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const body = (await req.json()) as WallPost;
  const id = text(body.id);
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });

  const posts = await dbList<WallPost>(KEY);
  const idx = posts.findIndex((post) => text(post.id) === id);
  if (idx === -1) return NextResponse.json({ error: "Nao encontrado" }, { status: 404 });
  if (!canManageAllSchoolContent(session) && !ownedBy(posts[idx], session.pessoa || session.usuario)) {
    return NextResponse.json({ error: "Voce so pode editar posts proprios." }, { status: 403 });
  }

  const next: WallPost = {
    ...posts[idx],
    ...body,
    titulo: text(body.titulo || posts[idx].titulo).slice(0, 100),
    mensagem: text(body.mensagem || body.conteudo || posts[idx].mensagem),
    turma: text(body.turma || posts[idx].turma || "Todas") || "Todas",
    turmas: body.turmas === undefined ? normalizeList(posts[idx].turmas) : normalizeList(body.turmas),
    aluno: body.aluno === undefined ? text(posts[idx].aluno) : text(body.aluno),
    alunos: body.alunos === undefined ? normalizeList(posts[idx].alunos) : normalizeList(body.alunos),
    tipo_post: text(body.tipo_post || posts[idx].tipo_post || "Aviso Geral"),
    status: text(body.status || posts[idx].status || "Ativo"),
    fixado: canManageAllSchoolContent(session) ? Boolean(body.fixado) : Boolean(posts[idx].fixado),
    atualizado_em: nowIso(),
  };
  if (shouldNotifyOnUpdate(posts[idx], next, body)) {
    next.notification_status = await notifyMuralPost(next, session);
  } else if (isDraft(next.status)) {
    next.notification_status = { push: "rascunho", whatsapp: "rascunho", email: "rascunho", total_destinatarios: 0 };
  }
  posts[idx] = next;
  await dbSet(KEY, posts);
  return NextResponse.json(next);
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || !canManageSchoolContent(session)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
  const posts = await dbList<WallPost>(KEY);
  const target = posts.find((post) => text(post.id) === id);
  if (!target) return NextResponse.json({ error: "Nao encontrado" }, { status: 404 });
  if (!canManageAllSchoolContent(session) && !ownedBy(target, session.pessoa || session.usuario)) {
    return NextResponse.json({ error: "Voce so pode excluir posts proprios." }, { status: 403 });
  }
  await dbSet(KEY, posts.filter((post) => text(post.id) !== id));
  return NextResponse.json({ ok: true });
}
