import { NextRequest, NextResponse } from "next/server";
import { dbList, dbSet, dbUpdate } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isAdminOrCoordinator } from "@/lib/roles";
import { getSchoolClasses } from "@/lib/school-data";
import { migrateModule, teacherClassValueByModule } from "@/lib/course-modules";

const KEY = "classes.json";

function text(value: unknown) {
  return String(value || "").trim();
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
      if (currentClass === oldName || currentClass === newName) {
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
    const turmas = await dbList<Record<string, unknown>>(KEY);
    const nome = text(classData.nome);
    if (!nome) return NextResponse.json({ error: "Nome da turma e obrigatorio." }, { status: 400 });
    const exists = turmas.some((t) => text(t.nome).toLowerCase() === nome.toLowerCase());
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

    const turmas = await dbList<Record<string, unknown>>(KEY);
    const idx = turmas.findIndex((t) => t.id === id || t.nome === id);
    if (idx === -1) return NextResponse.json({ error: "Turma nao encontrada." }, { status: 404 });

    const oldNome = text(turmas[idx].nome);
    const modulo = migrateModule(updates.modulo || updates.tipo_aula || updates.modalidade || turmas[idx].modulo);
    turmas[idx] = { ...turmas[idx], ...updates, modulo, tipo_aula: modulo, valor_aula: updates.valor_aula || turmas[idx].valor_aula || teacherClassValueByModule(modulo), updated_at: new Date().toISOString() };

    const newNome = text(turmas[idx].nome);
    await dbSet(KEY, turmas);
    if (Array.isArray(aluno_ids)) {
      await syncClassStudents(oldNome, newNome, aluno_ids);
    } else if (oldNome && newNome && oldNome !== newNome) {
      const alunos = await dbList<Record<string, unknown>>("students.json");
      let changed = false;
      for (const aluno of alunos) {
        if (text(aluno.turma) === oldNome || text(aluno.classe) === oldNome) {
          aluno.turma = newNome;
          aluno.classe = newNome;
          changed = true;
        }
      }
      if (changed) await dbSet("students.json", alunos);
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
  const turmas = await dbList<Record<string, unknown>>(KEY);
  const target = turmas.find((t) => t.id === id || t.nome === id);
  const targetName = text(target?.nome);
  const filtered = turmas.filter((t) => t.id !== id && t.nome !== id);

  const writes: Promise<boolean>[] = [dbSet(KEY, filtered)];
  if (targetName) {
    const alunos = await dbList<Record<string, unknown>>("students.json");
    let changed = false;
    for (const aluno of alunos) {
      if (text(aluno.turma) === targetName || text(aluno.classe) === targetName) {
        aluno.turma = "Sem Turma";
        if (aluno.classe) aluno.classe = "Sem Turma";
        changed = true;
      }
    }
    if (changed) writes.push(dbSet("students.json", alunos));
  }

  await Promise.all(writes);
  return NextResponse.json({ ok: true });
}
