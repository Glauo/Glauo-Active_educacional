import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dbList, dbSet } from "@/lib/db";
import { migrateModule, isVipModule, VIP_DEFAULT_TOTAL, vipPlanTotal } from "@/lib/course-modules";
import { configuredTeacherClassValue } from "@/lib/course-module-values.server";

type Row = Record<string, unknown>;

function text(v: unknown) { return String(v || "").trim(); }
function num(v: unknown) { return Number(v) || 0; }

function canAdmin(perfil: string) {
  const r = perfil.toLowerCase();
  return r.includes("admin") || r.includes("coord") || r.includes("dire") || r.includes("gestor");
}

async function migrateStudent(s: Row): Promise<{ record: Row; changed: boolean; from: string; to: string }> {
  const oldModule = text(s.modulo || s.modalidade);
  const newModule = migrateModule(oldModule);
  const isVip = isVipModule(newModule);
  const vipTotal = isVip ? Math.max(num(s.vip_aulas_total) || vipPlanTotal(s.vip_tipo_plano || "Pacote 10 aulas"), 1) : 0;
  const vipRestantes = isVip ? Math.max(0, num(s.vip_aulas_restantes) || vipTotal) : 0;

  const record: Row = {
    ...s,
    modulo: newModule,
    modalidade: newModule,
    valor_professor_aula: await configuredTeacherClassValue(newModule),
    vip_tipo_plano: isVip ? text(s.vip_tipo_plano || "Pacote 10 aulas") : "",
    vip_aulas_total: isVip ? vipTotal : 0,
    vip_aulas_restantes: isVip ? vipRestantes : 0,
  };

  if (oldModule !== newModule) {
    record.modulo_legado = oldModule;
    record.migrado_em = new Date().toISOString();
  }

  return { record, changed: oldModule !== newModule, from: oldModule, to: newModule };
}

async function migrateClass(c: Row): Promise<{ record: Row; changed: boolean; from: string; to: string }> {
  const oldModule = text(c.modulo || c.tipo_aula || c.modalidade);
  const newModule = migrateModule(oldModule);
  const record: Row = {
    ...c,
    modulo: newModule,
    tipo_aula: newModule,
    modalidade: newModule.toLowerCase().includes("online") ? "Online" : "Presencial",
    valor_aula: await configuredTeacherClassValue(newModule) || num(c.valor_aula),
  };
  if (oldModule !== newModule) record.modulo_legado = oldModule;
  return { record, changed: oldModule !== newModule, from: oldModule, to: newModule };
}

export async function POST() {
  const session = await getSession();
  if (!session || !canAdmin(session.perfil)) {
    return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });
  }

  const [students, classes] = await Promise.all([
    dbList<Row>("students.json"),
    dbList<Row>("classes.json"),
  ]);

  const [studentResults, classResults] = await Promise.all([
    Promise.all(students.map(migrateStudent)),
    Promise.all(classes.map(migrateClass)),
  ]);
  await Promise.all([
    dbSet("students.json", studentResults.map((r) => r.record)),
    dbSet("classes.json", classResults.map((r) => r.record)),
  ]);

  const studentChanges = studentResults.filter((r) => r.changed);
  const classChanges = classResults.filter((r) => r.changed);

  return NextResponse.json({
    ok: true,
    total_alunos: students.length,
    alunos_migrados: studentChanges.length,
    total_turmas: classes.length,
    turmas_migradas: classChanges.length,
    detalhes_alunos: studentChanges.map((r) => ({ de: r.from, para: r.to })),
    detalhes_turmas: classChanges.map((r) => ({ de: r.from, para: r.to })),
    novos_modulos: ["Aula em Turma", "Aula Teens Presencial", "Aulas VIP Personalizadas", "Intensivo Online Ouro", "Reposicao de Aula"],
    vip_default: VIP_DEFAULT_TOTAL,
    executado_por: session.pessoa || session.usuario,
    executado_em: new Date().toISOString(),
  });
}

export async function GET() {
  const session = await getSession();
  if (!session || !canAdmin(session.perfil)) {
    return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });
  }
  const [students, classes] = await Promise.all([
    dbList<Row>("students.json"),
    dbList<Row>("classes.json"),
  ]);
  return NextResponse.json({
    alunos: students.map((s) => ({
      nome: text(s.nome || s.name),
      modulo_atual: text(s.modulo || s.modalidade),
      modulo_novo: migrateModule(s.modulo || s.modalidade),
    })),
    turmas: classes.map((c) => ({
      nome: text(c.nome || c.name),
      modulo_atual: text(c.modulo || c.tipo_aula || c.modalidade),
      modulo_novo: migrateModule(c.modulo || c.tipo_aula || c.modalidade),
    })),
  });
}
