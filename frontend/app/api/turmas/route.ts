import { NextRequest, NextResponse } from "next/server";
import { dbSet, dbUpdate } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isAdminOrCoordinator } from "@/lib/roles";
import { getSchoolClasses } from "@/lib/school-data";
import { migrateModule, teacherClassValueByModule } from "@/lib/course-modules";

const KEY = "classes.json";

function text(value: unknown) {
  return String(value || "").trim();
}

function normalized(value: unknown) {
  return text(value).toLocaleLowerCase("pt-BR");
}

function className(turma: Record<string, unknown>) {
  return text(turma.nome || turma.name);
}

function sameClass(turma: Record<string, unknown>, identifier: unknown) {
  const target = text(identifier);
  return Boolean(target) && (
    text(turma.id) === target ||
    normalized(className(turma)) === normalized(target)
  );
}

function studentKey(student: Record<string, unknown>) {
  return text(student.id || student._id || student.uuid || student.matricula || student.nome || student.name);
}

async function syncClassStudents(oldName: string, newName: string, selectedIds: unknown) {
  if (!Array.isArray(selectedIds)) return;
  const selected = new Set(selectedIds.map(text).filter(Boolean));
  await dbUpdate<Record<string, unknown>[]>("students.json", (current) => {
    const students = Array.isArray(current) ? current : [];
    return students.map((student) => {
      const key = studentKey(student);
      const currentClass = text(student.turma || student.classe);
      if (selected.has(key)) {
        return { ...student, turma: newName, classe: newName, updated_at: new Date().toISOString() };
      }
      if (normalized(currentClass) === normalized(oldName) || normalized(currentClass) === normalized(newName)) {
        return { ...student, turma: "Sem Turma", classe: "Sem Turma", updated_at: new Date().toISOString() };
      }
      return student;
    });
  }, []);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });

  const turmas = await getSchoolClasses();
  return NextResponse.json({ turmas: turmas.map((turma) => ({ ...turma, modulo: migrateModule(turma.modulo || turma.tipo_aula || turma.modalidade) })) });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  if (!isAdminOrCoordinator(session)) return NextResponse.json({ error: "Apenas coordenadores e administradores podem criar turmas." }, { status: 403 });

  try {
    const body = await req.json();
    const { aluno_ids, ...classData } = body;
    const turmas = await getSchoolClasses() as Record<string, unknown>[];
    const nome = text(classData.nome);
    if (!nome) return NextResponse.json({ error: "Nome da turma e obrigatorio." }, { status: 400 });
    const exists = turmas.some((t) => normalized(className(t)) === normalized(nome));
    if (exists) return NextResponse.json({ error: "Turma ja existe." }, { status: 409 });

    const modulo = migrateModule(classData.modulo || classData.tipo_aula || classData.modalidade);
    const nova = { ...classData, nome, modulo, tipo_aula: modulo, valor_aula: classData.valor_aula || teacherClassValueByModule(modulo), id: classData.id || crypto.randomUUID(), created_at: new Date().toISOString() };
    turmas.push(nova);
    await dbSet(KEY, turmas);
    await syncClassStudents("", nome, aluno_ids);
    return NextResponse.json({ ok: true, turma: nova }, { status: 201 });
  } catch (err) {
    console.error("[turmas POST]", err);
    return NextResponse.json({ error: "Erro ao salvar turma." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  if (!isAdminOrCoordinator(session)) return NextResponse.json({ error: "Apenas coordenadores e administradores podem editar turmas." }, { status: 403 });

  try {
    const { id, aluno_ids, ...updates } = await req.json();
    if (!id) return NextResponse.json({ error: "ID obrigatorio." }, { status: 400 });

    const turmas = await getSchoolClasses() as Record<string, unknown>[];
    const idx = turmas.findIndex((t) => sameClass(t, id));
    if (idx === -1) return NextResponse.json({ error: "Turma nao encontrada. Atualize a pagina e tente novamente." }, { status: 404 });

    const oldNome = className(turmas[idx]);
    const requestedNome = text(updates.nome || updates.name || oldNome);
    if (!requestedNome) return NextResponse.json({ error: "Nome da turma e obrigatorio." }, { status: 400 });
    const duplicate = turmas.some((turma, index) => index !== idx && normalized(className(turma)) === normalized(requestedNome));
    if (duplicate) return NextResponse.json({ error: "Ja existe uma turma com este nome." }, { status: 409 });
    const modulo = migrateModule(updates.modulo || updates.tipo_aula || updates.modalidade || turmas[idx].modulo);
    turmas[idx] = { ...turmas[idx], ...updates, id: text(turmas[idx].id) || crypto.randomUUID(), nome: requestedNome, modulo, tipo_aula: modulo, valor_aula: updates.valor_aula || turmas[idx].valor_aula || teacherClassValueByModule(modulo), updated_at: new Date().toISOString() };

    const newNome = text(turmas[idx].nome);
    await dbSet(KEY, turmas);
    if (Array.isArray(aluno_ids)) {
      await syncClassStudents(oldNome, newNome, aluno_ids);
    } else if (oldNome && newNome && oldNome !== newNome) {
      await dbUpdate<Record<string, unknown>[]>("students.json", (current) =>
        (Array.isArray(current) ? current : []).map((aluno) =>
          normalized(aluno.turma || aluno.classe) === normalized(oldNome)
            ? { ...aluno, turma: newNome, classe: newNome, updated_at: new Date().toISOString() }
            : aluno
        ), []);
    }
    return NextResponse.json({ ok: true, turma: turmas[idx] });
  } catch (err) {
    console.error("[turmas PUT]", err);
    return NextResponse.json({ error: "Erro ao atualizar turma." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  if (!isAdminOrCoordinator(session)) return NextResponse.json({ error: "Apenas coordenadores e administradores podem excluir turmas." }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
  const turmas = await getSchoolClasses() as Record<string, unknown>[];
  const target = turmas.find((t) => sameClass(t, id));
  if (!target) return NextResponse.json({ error: "Turma nao encontrada. Atualize a pagina e tente novamente." }, { status: 404 });
  const targetName = target ? className(target) : "";
  const filtered = turmas.filter((t) => !sameClass(t, id));

  await dbSet(KEY, filtered);
  if (targetName) await syncClassStudents(targetName, "", []);
  return NextResponse.json({ ok: true });
}
