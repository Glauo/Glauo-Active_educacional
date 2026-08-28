import { NextRequest, NextResponse } from "next/server";
import { dbList, dbListWithoutKeys, dbSet } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isAdminOrCoordinator } from "@/lib/roles";
import { isVipModule, isVipUnlimitedPlan, migrateModule, VIP_DEFAULT_TOTAL, VIP_UNLIMITED, vipPlanTotal } from "@/lib/course-modules";
import { configuredTeacherClassValue } from "@/lib/course-module-values.server";
import { applyGeneratedStudentCredentials } from "@/lib/student-credentials";
import { ensureStudentMonthlyBilling } from "@/lib/monthly-billing";

const KEY = "students.json";
const HEAVY_KEYS = ["file_b64", "pdf_b64", "base64", "arquivo_b64", "foto_b64", "imagem_b64", "documento_b64", "anexo_b64"];

function text(value: unknown) {
  return String(value || "").trim();
}

function digits(value: unknown) {
  return text(value).replace(/\D/g, "");
}

function numberOrDefault(value: unknown, fallback: number) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nextMatricula(alunos: Record<string, unknown>[]) {
  let max = 0;
  for (const aluno of alunos) {
    const n = Number(digits(aluno.matricula));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1).padStart(4, "0");
}

async function normalizeAluno(body: Record<string, unknown>) {
  const modulo = migrateModule(body.modulo || body.modalidade);
  const vip = isVipModule(modulo);
  const tipoPlanosRaw = text(body.vip_tipo_plano || "Pacote 10 aulas");
  const isUnlimited = vip && isVipUnlimitedPlan(tipoPlanosRaw);

  let vipTotal: number;
  let vipRestantes: number;
  let vipDadas: number;

  if (!vip) {
    vipTotal = 0; vipRestantes = 0; vipDadas = 0;
  } else if (isUnlimited) {
    vipTotal = VIP_UNLIMITED;
    vipRestantes = VIP_UNLIMITED;
    vipDadas = Math.max(0, numberOrDefault(body.vip_aulas_dadas ?? body.aulas_dadas_vip, 0));
  } else {
    const vipTotalDefault = vipPlanTotal(tipoPlanosRaw) || VIP_DEFAULT_TOTAL;
    vipTotal = Math.max(0, numberOrDefault(body.vip_aulas_total, vipTotalDefault));
    vipRestantes = Math.max(0, Math.min(vipTotal || vipTotalDefault, numberOrDefault(body.vip_aulas_restantes, vipTotal || vipTotalDefault)));
    vipDadas = Math.max(0, (vipTotal || vipTotalDefault) - vipRestantes);
  }
  const responsavel =
    body.responsavel && typeof body.responsavel === "object" && !Array.isArray(body.responsavel)
      ? body.responsavel as Record<string, unknown>
      : {};
  const responsavelNome = text(body.responsavel_nome || responsavel.nome || body.responsavel);
  const login = text(body.login || body.usuario).toLowerCase();
  const normalized = {
    ...body,
    nome: text(body.nome || body.name),
    data_nascimento: text(body.data_nascimento || body.nascimento),
    nascimento: text(body.data_nascimento || body.nascimento),
    cpf: text(body.cpf),
    turma: text(body.turma || body.classe),
    classe: text(body.turma || body.classe),
    livro: text(body.livro || body.book),
    book: text(body.livro || body.book),
    modulo,
    matricula: text(body.matricula),
    usuario: login,
    login,
    senha: text(body.senha),
    rg: text(body.rg),
    genero: text(body.genero || body.sexo),
    idade: text(body.idade),
    cidade_natal: text(body.cidade_natal),
    pais: text(body.pais || "Brasil"),
    cep: text(body.cep),
    rua: text(body.rua),
    numero: text(body.numero),
    complemento: text(body.complemento),
    cidade: text(body.cidade),
    bairro: text(body.bairro),
    valor_professor_aula: await configuredTeacherClassValue(modulo),
    vip_tipo_plano: vip ? tipoPlanosRaw : "",
    vip_aulas_total: vipTotal,
    vip_aulas_restantes: vipRestantes,
    vip_aulas_dadas: vipDadas,
    aulas_dadas_vip: vipDadas,
    responsavel: {
      nome: responsavelNome,
      cpf: text(body.responsavel_cpf || responsavel.cpf),
      celular: text(body.responsavel_telefone || responsavel.celular || responsavel.telefone || body.telefone),
      telefone: text(body.responsavel_telefone || responsavel.telefone || responsavel.celular || body.telefone),
      email: text(body.responsavel_email || responsavel.email),
    },
    responsavel_nome: responsavelNome,
    responsavel_cpf: text(body.responsavel_cpf || responsavel.cpf),
    responsavel_telefone: text(body.responsavel_telefone || responsavel.telefone || responsavel.celular || body.telefone),
    responsavel_email: text(body.responsavel_email || responsavel.email),
  };
  return applyGeneratedStudentCredentials(normalized);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const alunos = await dbListWithoutKeys(KEY, HEAVY_KEYS) as Record<string, unknown>[];
  return NextResponse.json({ alunos: alunos.map((aluno) => ({ ...aluno, modulo: migrateModule(aluno.modulo || aluno.modalidade) })) });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!isAdminOrCoordinator(session)) return NextResponse.json({ error: "Apenas coordenadores e administradores podem cadastrar alunos." }, { status: 403 });

  try {
    const body = await req.json();
    const alunos = await dbList<Record<string, unknown>>(KEY);
    const normalized = await normalizeAluno(body);
    if (!text(normalized.nome)) return NextResponse.json({ error: "Nome do aluno e obrigatorio." }, { status: 400 });
    if (!text(normalized.matricula)) normalized.matricula = nextMatricula(alunos);

    const novo = {
      ...normalized,
      id: body.id || crypto.randomUUID(),
      created_at: new Date().toISOString()
    };

    alunos.push(novo);
    await dbSet(KEY, alunos);
    await ensureStudentMonthlyBilling(novo, session);
    return NextResponse.json({ ok: true, aluno: novo, notification_status: { whatsapp: "nao_enviado", email: "nao_enviado" } }, { status: 201 });
  } catch (err) {
    console.error("[alunos POST]", err);
    return NextResponse.json({ error: "Erro ao salvar aluno." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!isAdminOrCoordinator(session)) return NextResponse.json({ error: "Apenas coordenadores e administradores podem editar alunos." }, { status: 403 });

  try {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) return NextResponse.json({ error: "ID obrigatório." }, { status: 400 });

    const alunos = await dbList<Record<string, unknown>>(KEY);
    const idx = alunos.findIndex((a) => a.id === id || a.nome === id);
    if (idx === -1) return NextResponse.json({ error: "Aluno não encontrado." }, { status: 404 });

    alunos[idx] = { ...alunos[idx], ...await normalizeAluno(updates), updated_at: new Date().toISOString() };
    await dbSet(KEY, alunos);
    await ensureStudentMonthlyBilling(alunos[idx], session);
    return NextResponse.json({ ok: true, aluno: alunos[idx], notification_status: { whatsapp: "nao_enviado", email: "nao_enviado" } });
  } catch (err) {
    console.error("[alunos PUT]", err);
    return NextResponse.json({ error: "Erro ao atualizar aluno." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!isAdminOrCoordinator(session)) return NextResponse.json({ error: "Apenas coordenadores e administradores podem excluir alunos." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório." }, { status: 400 });

  const alunos = await dbList<Record<string, unknown>>(KEY);
  const filtered = alunos.filter((a) => a.id !== id && a.nome !== id);
  await dbSet(KEY, filtered);
  return NextResponse.json({ ok: true });
}
