import { NextRequest, NextResponse } from "next/server";
import { dbList, dbSet } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isAdminOrCoordinator } from "@/lib/roles";
import {
  applyGeneratedStudentCredentials,
  notifyStudentCredentials,
  studentCredentialMessage,
  studentCredentialPhone,
  type StudentCredentialRow,
} from "@/lib/student-credentials";
import { manualWhatsAppUrl } from "@/lib/manual-whatsapp";

type Aluno = StudentCredentialRow & {
  id?: string;
  nome?: string;
  name?: string;
  login?: string;
  senha?: string;
  turma?: string;
  classe?: string;
};

function text(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const row = value as Record<string, unknown>;
    return String(row.nome || row.name || row.celular || row.telefone || row.whatsapp || row.email || "").trim();
  }
  return String(value || "").trim();
}

function phoneFromStudent(aluno: Aluno) {
  return studentCredentialPhone(aluno);
}

function whatsappUrl(phone: unknown, message: string) {
  return manualWhatsAppUrl(phone, message);
}

function sameStudent(aluno: Aluno, id: string) {
  const ref = text(id).toLowerCase();
  return [aluno.id, aluno.nome, aluno.name].some((value) => text(value).toLowerCase() === ref);
}

export async function GET() {
  const session = await getSession();
  if (!session || !isAdminOrCoordinator(session)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const alunos = await dbList<Aluno>("students.json");
  const lista = alunos.map((a) => ({
    id: a.id,
    nome: a.nome || a.name,
    turma: a.turma || a.classe,
    login: a.login || null,
    senha: a.senha || null,
    telefone: phoneFromStudent(a),
    temAcesso: Boolean(a.login && a.senha),
  }));
  return NextResponse.json(lista);
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || !isAdminOrCoordinator(session)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { id, login, senha } = await req.json() as { id: string; login?: string; senha?: string };
  if (!id) return NextResponse.json({ error: "id obrigatorio." }, { status: 400 });

  const alunos = await dbList<Aluno>("students.json");
  const idx = alunos.findIndex((a) => sameStudent(a, id));
  if (idx === -1) {
    return NextResponse.json({ error: "Aluno nao encontrado." }, { status: 404 });
  }

  const generated = applyGeneratedStudentCredentials({
    ...alunos[idx],
    login: login || alunos[idx].login,
    senha: senha || alunos[idx].senha,
  });
  const loginFinal = text(generated.login).toLowerCase();
  const senhaFinal = text(generated.senha);

  if (loginFinal.length < 3) {
    return NextResponse.json({ error: "Data de nascimento invalida para gerar o login." }, { status: 400 });
  }
  if (senhaFinal.length < 5) {
    return NextResponse.json({ error: "CPF invalido para gerar a senha." }, { status: 400 });
  }

  alunos[idx] = { ...generated, login: loginFinal, usuario: loginFinal, senha: senhaFinal };
  await dbSet("students.json", alunos);

  const notification = await notifyStudentCredentials(alunos[idx], session);
  const message = studentCredentialMessage(alunos[idx], loginFinal, senhaFinal);
  return NextResponse.json({
    ok: true,
    login: loginFinal,
    telefone: notification.telefone,
    whatsapp_status: notification.whatsapp,
    whatsapp_enviado: notification.whatsapp_enviado,
    email_status: notification.email,
    email_enviado: notification.email_enviado,
    whatsapp_url: text((notification as { whatsapp_url?: string }).whatsapp_url) || whatsappUrl(notification.telefone, message),
    whatsapp_message: message,
  });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || !isAdminOrCoordinator(session)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });

  const alunos = await dbList<Aluno>("students.json");
  const idx = alunos.findIndex((a) => sameStudent(a, id));
  if (idx === -1) return NextResponse.json({ error: "Aluno nao encontrado." }, { status: 404 });

  delete alunos[idx].login;
  delete alunos[idx].usuario;
  delete alunos[idx].senha;
  await dbSet("students.json", alunos);

  return NextResponse.json({ ok: true });
}

