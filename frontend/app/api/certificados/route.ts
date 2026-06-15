import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dbList, dbSet } from "@/lib/db";
import { isAdminOrCoordinator } from "@/lib/roles";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return String(value || "").trim();
}

function certificateCode() {
  return `MW-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const alunoId = text(searchParams.get("aluno_id"));
  const aluno = text(searchParams.get("aluno"));
  const tipo = text(searchParams.get("tipo"));
  const certificados = await dbList<Row>("certificates.json");

  if (session.perfil === "Aluno") {
    const filtrados = certificados.filter((item) =>
      text(item.aluno_login) === text(session.usuario) || text(item.aluno) === text(session.pessoa)
    );
    return NextResponse.json({ certificados: filtrados });
  }

  if (!isAdminOrCoordinator(session)) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const filtrados = certificados.filter((item) => {
    if (tipo && text(item.tipo_certificado) !== tipo) return false;
    if (alunoId && text(item.aluno_id) === alunoId) return true;
    if (aluno && text(item.aluno).toLowerCase() === aluno.toLowerCase()) return true;
    return !alunoId && !aluno;
  });
  return NextResponse.json({ certificados: filtrados });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !isAdminOrCoordinator(session)) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const body = await req.json() as Row;
  const aluno = text(body.aluno);
  const alunoId = text(body.aluno_id);
  const tipoCertificado = text(body.tipo_certificado || "conclusao");
  const modulo = text(body.modulo);
  const curso = text(body.curso || "Curso de Ingles - Mister Wiz");
  const dataConclusao = text(body.data_conclusao || new Date().toISOString().slice(0, 10));

  if (!aluno) return NextResponse.json({ error: "Aluno obrigatorio." }, { status: 400 });
  if (!curso) return NextResponse.json({ error: "Curso obrigatorio." }, { status: 400 });
  if (!dataConclusao) return NextResponse.json({ error: "Data de conclusao obrigatoria." }, { status: 400 });

  const certificados = await dbList<Row>("certificates.json");
  const id = text(body.id) || crypto.randomUUID();
  const existingIndex = certificados.findIndex((item) => text(item.id) === id);
  const now = new Date().toISOString();
  const certificado: Row = {
    ...(existingIndex >= 0 ? certificados[existingIndex] : {}),
    ...body,
    id,
    aluno,
    aluno_id: alunoId,
    aluno_login: text(body.aluno_login),
    turma: text(body.turma),
    modulo,
    curso,
    carga_horaria: text(body.carga_horaria || "120 horas"),
    data_conclusao: dataConclusao,
    data_emissao: text(body.data_emissao || new Date().toISOString().slice(0, 10)),
    certificado_codigo: text(body.certificado_codigo || certificateCode()),
    instrutor: text(body.instrutor || "Equipe Pedagogica Mister Wiz"),
    status: "Emitido",
    emitido_por: session.pessoa || session.usuario,
    updated_at: now,
    created_at: text(existingIndex >= 0 ? certificados[existingIndex].created_at : now) || now,
    marca: "Mister Wiz",
    tipo_certificado: tipoCertificado,
    origem: tipoCertificado === "modulo" ? "certificado_modulo_curso_ingles" : "certificado_conclusao_curso_ingles",
  };

  const next = existingIndex >= 0
    ? certificados.map((item, index) => index === existingIndex ? certificado : item)
    : [...certificados, certificado];
  await dbSet("certificates.json", next);

  return NextResponse.json({ certificado }, { status: existingIndex >= 0 ? 200 : 201 });
}
