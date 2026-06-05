import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dbList, dbSet } from "@/lib/db";
import { isAdmin } from "@/lib/roles";
import { sendWhatsApp } from "@/lib/whatsapp";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return String(value || "").trim();
}

function phoneFromTeacher(professor: Row) {
  return text(professor.whatsapp || professor.telefone || professor.celular || professor.phone);
}

function credentialMessage(nome: string, usuario: string, senha: string) {
  return [
    `Ola, ${nome || "professor"}!`,
    "Seu acesso ao painel Active Educacional foi atualizado.",
    "",
    `Login: ${usuario}`,
    `Senha: ${senha}`,
    "",
    "Portal: https://ativoeducacional.tech/login",
  ].join("\n");
}

export async function GET() {
  const session = await getSession();
  if (!session || !isAdmin(session)) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const [users, professores] = await Promise.all([dbList<Row>("users.json"), dbList<Row>("teachers.json")]);
  const lista = professores.map((p) => {
    const nome = text(p.nome || p.name);
    const user = users.find((u) => text(u.pessoa) === nome || text(u.professor_id) === text(p.id));
    return {
      id: text(p.id || nome),
      nome,
      perfil: text(user?.perfil || "Professor"),
      usuario: text(user?.usuario),
      temAcesso: Boolean(user?.usuario && user?.senha)
    };
  });
  return NextResponse.json(lista);
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || !isAdmin(session)) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const { id, nome, usuario, senha, perfil } = await req.json() as { id: string; nome: string; usuario: string; senha: string; perfil?: string };
  if (!id || !usuario || !senha) return NextResponse.json({ error: "ID, usuario e senha sao obrigatorios." }, { status: 400 });
  if (String(senha).length < 4) return NextResponse.json({ error: "Senha deve ter pelo menos 4 caracteres." }, { status: 400 });
  const login = text(usuario).toLowerCase();
  const [users, professores] = await Promise.all([dbList<Row>("users.json"), dbList<Row>("teachers.json")]);
  const conflito = users.find((u) => text(u.usuario) === login && text(u.professor_id) !== id && text(u.pessoa) !== nome);
  if (conflito) return NextResponse.json({ error: "Este usuario ja esta em uso." }, { status: 409 });
  const idx = users.findIndex((u) => text(u.professor_id) === id || text(u.pessoa) === nome);
  const registro = { ...(idx >= 0 ? users[idx] : {}), professor_id: id, pessoa: nome, usuario: login, senha: String(senha), perfil: perfil || "Professor" };
  const next = idx >= 0 ? users.map((u, i) => i === idx ? registro : u) : [...users, registro];
  await dbSet("users.json", next);
  const professor = professores.find((p) => text(p.id) === id || text(p.nome || p.name) === nome);
  const telefone = professor ? phoneFromTeacher(professor) : "";
  const message = credentialMessage(nome, login, String(senha));
  const whatsapp = telefone ? await sendWhatsApp(telefone, message, session) : { ok: false, status: "sem telefone" };
  return NextResponse.json({ ok: true, usuario: login, telefone, whatsapp_status: whatsapp.status, whatsapp_enviado: whatsapp.ok });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || !isAdmin(session)) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
  const users = await dbList<Row>("users.json");
  await dbSet("users.json", users.filter((u) => text(u.professor_id) !== id));
  return NextResponse.json({ ok: true });
}
