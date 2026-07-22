import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dbList, dbSet } from "@/lib/db";
import { deleteLibraryPdf, saveLibraryPdf, type LibraryPdfKey } from "@/lib/library-pdfs";
import { studentCanAccessLibraryItem } from "@/lib/library-access";
import { getSchoolClasses } from "@/lib/school-data";
import { isAdminOrCoordinator, isTeacher } from "@/lib/roles";

type Livro = { id?: string; titulo?: string; autor?: string; nivel?: string; turma?: string; url?: string; pdf_nome?: string; pdf_mime?: string; [k: string]: unknown };

function keyFor(tipo: string) {
  return tipo === "videos" ? "videos.json" : tipo === "materiais" ? "materials.json" : "books.json";
}

function text(value: unknown) {
  return String(value || "").trim();
}

function canManage(session: NonNullable<Awaited<ReturnType<typeof getSession>>>) {
  return isAdminOrCoordinator(session) || isTeacher(session);
}

async function studentContext(session: NonNullable<Awaited<ReturnType<typeof getSession>>>) {
  const [students, classes] = await Promise.all([dbList<Record<string, unknown>>("students.json"), getSchoolClasses()]);
  const login = text(session.usuario).toLowerCase();
  const name = text(session.pessoa).toLowerCase();
  const student = students.find((row) =>
    text(row.login).toLowerCase() === login || text(row.nome || row.name).toLowerCase() === name
  );
  return { student, classes };
}

async function livroFromFormData(req: NextRequest, key: string, existing: Livro = {}) {
  const form = await req.formData();
  const id = text(form.get("id")) || text(existing.id) || `bib_${Date.now()}`;
  const file = form.get("arquivo_pdf");
  const livro: Livro = {
    ...existing,
    id,
    titulo: text(form.get("titulo")),
    autor: text(form.get("autor")),
    nivel: text(form.get("nivel")),
    turma: text(form.get("turma")) || "Todas",
    url: text(form.get("url")) || text(existing.url),
  };

  if (file instanceof File && file.size > 0) {
    if (file.type && file.type !== "application/pdf") {
      throw new Error("Envie apenas arquivo PDF.");
    }
    if (key === "videos.json") throw new Error("Envie link para videos.");
    Object.assign(
      livro,
      await saveLibraryPdf(
        key as LibraryPdfKey,
        id,
        Buffer.from(await file.arrayBuffer()),
        file.name || `${id}.pdf`,
        file.type || "application/pdf"
      )
    );
  }

  return livro;
}

async function requestBody(req: NextRequest, key: string, existing?: Livro) {
  const isForm = req.headers.get("content-type")?.includes("multipart/form-data");
  return isForm ? livroFromFormData(req, key, existing) : req.json() as Promise<Livro>;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const itens = await dbList(keyFor(searchParams.get("tipo") || "livros"));
  if (text(session.perfil).toLowerCase().includes("aluno")) {
    const { student, classes } = await studentContext(session);
    if (!student) return NextResponse.json([], { status: 200 });
    return NextResponse.json(itens.filter((item) => studentCanAccessLibraryItem(item as Record<string, unknown>, session, student, classes)));
  }
  return NextResponse.json(itens);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!canManage(session)) return NextResponse.json({ error: "Sem permissao para cadastrar materiais." }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const key = keyFor(searchParams.get("tipo") || "livros");
  const itens = await dbList<Livro>(key);
  try {
    const body = await requestBody(req, key);
    const novo = { ...body, id: body.id || `bib_${Date.now()}` };
    itens.push(novo);
    await dbSet(key, itens);
    return NextResponse.json(novo, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro ao salvar." }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!canManage(session)) return NextResponse.json({ error: "Sem permissao para editar materiais." }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const key = keyFor(searchParams.get("tipo") || "livros");
  const itens = await dbList<Livro>(key);
  const incoming = await requestBody(req, key);
  if (!incoming.id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
  const idx = itens.findIndex((l) => l.id === incoming.id);
  if (idx === -1) return NextResponse.json({ error: "Nao encontrado" }, { status: 404 });
  const body = req.headers.get("content-type")?.includes("multipart/form-data")
    ? incoming
    : { ...itens[idx], ...incoming };
  itens[idx] = body;
  await dbSet(key, itens);
  return NextResponse.json(itens[idx]);
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  if (!canManage(session)) return NextResponse.json({ error: "Sem permissao para excluir materiais." }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
  const key = keyFor(searchParams.get("tipo") || "livros");
  const itens = await dbList<Livro>(key);
  if (!itens.some((item) => text(item.id) === id)) {
    return NextResponse.json({ error: "Material nao encontrado ou ja excluido." }, { status: 404 });
  }
  await dbSet(key, itens.filter((item) => text(item.id) !== id));
  if (key === "books.json" || key === "materials.json") {
    await deleteLibraryPdf(key as LibraryPdfKey, id);
  }
  return NextResponse.json({ ok: true });
}
