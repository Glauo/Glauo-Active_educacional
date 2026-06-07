import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dbList, dbSet } from "@/lib/db";
import { isAdmin } from "@/lib/roles";
import { sendWhatsApp } from "@/lib/whatsapp";
import { sendEmail } from "@/lib/email";
import { studentCredentialEmail, studentCredentialPhone } from "@/lib/student-credentials";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return String(value || "").trim();
}

function lower(value: unknown) {
  return text(value).toLowerCase();
}

function digits(value: unknown) {
  return text(value).replace(/\D/g, "");
}

function normalizeStatus(value: unknown, fallback = "Ativo") {
  const raw = lower(value || fallback);
  return raw.includes("inativ") || raw.includes("cancel") || raw.includes("arquiv") ? "Inativo" : "Ativo";
}

function isActiveRow(row: Row, fallback = true) {
  if (row.is_active === false) return false;
  if (text(row.deleted_at)) return false;
  const status = normalizeStatus(row.status || row.situacao, fallback ? "Ativo" : "Inativo");
  return status === "Ativo";
}

function generatedTempPassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lowerChars = "abcdefghijkmnopqrstuvwxyz";
  const numbers = "23456789";
  const specials = "@#$%!";
  const all = `${upper}${lowerChars}${numbers}${specials}`;
  const picks = [
    upper[Math.floor(Math.random() * upper.length)],
    lowerChars[Math.floor(Math.random() * lowerChars.length)],
    numbers[Math.floor(Math.random() * numbers.length)],
    specials[Math.floor(Math.random() * specials.length)],
  ];
  while (picks.length < 10) {
    picks.push(all[Math.floor(Math.random() * all.length)]);
  }
  return picks.sort(() => Math.random() - 0.5).join("");
}

async function audit(entry: Row) {
  const log = await dbList<Row>("users_audit.json");
  await dbSet("users_audit.json", [
    ...log,
    { id: crypto.randomUUID(), data: new Date().toISOString(), ...entry },
  ]);
}

function professorUser(users: Row[], professor: Row) {
  const id = text(professor.id || professor.nome);
  const nome = text(professor.nome || professor.name);
  const login = lower(professor.usuario || professor.login);
  return users.find((user) =>
    text(user.professor_id) === id ||
    lower(user.usuario) === login ||
    text(user.pessoa) === nome
  ) || null;
}

function listPayload(users: Row[], teachers: Row[], students: Row[]) {
  const internal = users
    .filter((user) => !text(user.professor_id))
    .map((user) => ({
      source: "internal",
      id: text(user.id || user.usuario || user.pessoa || user.nome),
      nome: text(user.pessoa || user.nome || user.usuario),
      usuario: text(user.usuario),
      perfil: text(user.perfil || "Usuario"),
      email: text(user.email),
      telefone: text(user.celular || user.telefone || user.whatsapp),
      cpf: text(user.cpf),
      status: isActiveRow(user) ? "Ativo" : "Inativo",
      is_active: isActiveRow(user),
      tem_acesso: Boolean(text(user.usuario) && text(user.senha)),
      created_at: text(user.created_at),
      last_login_at: text(user.last_login_at),
      deleted_at: text(user.deleted_at),
    }));

  const teachersPayload = teachers.map((teacher) => {
    const linked = professorUser(users, teacher);
    const nome = text(teacher.nome || teacher.name);
    return {
      source: "teacher",
      id: text(teacher.id || nome),
      nome,
      usuario: text(linked?.usuario || teacher.usuario || teacher.login),
      perfil: text(linked?.perfil || "Professor"),
      email: text(teacher.email || linked?.email),
      telefone: text(teacher.celular || teacher.telefone || teacher.whatsapp || linked?.celular || linked?.telefone),
      cpf: text(teacher.cpf),
      status: isActiveRow(teacher) ? "Ativo" : "Inativo",
      is_active: isActiveRow(teacher),
      tem_acesso: Boolean(text(linked?.usuario || teacher.usuario || teacher.login) && text(linked?.senha || teacher.senha)),
      created_at: text(teacher.created_at || linked?.created_at),
      last_login_at: text(linked?.last_login_at),
      deleted_at: text(teacher.deleted_at || linked?.deleted_at),
    };
  });

  const studentsPayload = students.map((student) => ({
    source: "student",
    id: text(student.id || student.nome),
    nome: text(student.nome || student.name),
    usuario: text(student.login || student.usuario),
    perfil: "Aluno",
    email: text(student.responsavel_email || student.email),
    telefone: text(student.responsavel_telefone || student.telefone || student.celular || student.whatsapp),
    cpf: text(student.cpf),
    status: isActiveRow(student) ? "Ativo" : "Inativo",
    is_active: isActiveRow(student),
    tem_acesso: Boolean(text(student.login || student.usuario) && text(student.senha)),
    created_at: text(student.created_at),
    last_login_at: text(student.last_login_at),
    deleted_at: text(student.deleted_at),
  }));

  return [...internal, ...teachersPayload, ...studentsPayload]
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function activeAdminCount(users: Row[]) {
  return users.filter((user) => lower(user.perfil).includes("admin") && isActiveRow(user)).length;
}

async function notifyPasswordReset(payload: { nome: string; login: string; senha: string; email?: string; telefone?: string }, session: NonNullable<Awaited<ReturnType<typeof getSession>>>) {
  const message = [
    `Ola, ${payload.nome || "usuario"}!`,
    "Sua senha de acesso ao Active Educacional foi redefinida.",
    "",
    `Login: ${payload.login}`,
    `Senha temporaria: ${payload.senha}`,
    "",
    "Portal: https://ativoeducacional.tech/login",
  ].join("\n");

  const [whatsapp, mail] = await Promise.all([
    payload.telefone ? sendWhatsApp(payload.telefone, message, session) : Promise.resolve({ ok: false, status: "sem telefone" }),
    payload.email ? sendEmail(payload.email, "Redefinicao de senha - Active Educacional", message, session) : Promise.resolve({ ok: false, status: "sem email" }),
  ]);

  return {
    whatsapp: whatsapp.ok ? "enviado_wapi" : whatsapp.status,
    email: mail.ok ? "enviado_smtp" : mail.status,
  };
}

export async function GET() {
  const session = await getSession();
  if (!session || !isAdmin(session)) {
    return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });
  }

  const [users, teachers, students] = await Promise.all([
    dbList<Row>("users.json"),
    dbList<Row>("teachers.json"),
    dbList<Row>("students.json"),
  ]);

  return NextResponse.json({
    usuarios: listPayload(users, teachers, students),
  });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || !isAdmin(session)) {
    return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });
  }
  const adminSession = session;

  const body = await req.json().catch(() => ({})) as Row;
  const source = text(body.source);
  const id = text(body.id);
  if (!source || !id) {
    return NextResponse.json({ error: "Fonte e id sao obrigatorios." }, { status: 400 });
  }

  const actor = text(adminSession.pessoa || adminSession.usuario);

  if (source === "internal") {
    const users = await dbList<Row>("users.json");
    const idx = users.findIndex((user) => text(user.id || user.usuario) === id);
    if (idx === -1) return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 404 });
    const nextPerfil = text(body.perfil || users[idx].perfil);
    const nextUsuario = lower(body.usuario || users[idx].usuario);
    if (!nextUsuario) return NextResponse.json({ error: "Login obrigatorio." }, { status: 400 });
    const conflict = users.find((user, index) => index !== idx && lower(user.usuario) === nextUsuario && !text(user.deleted_at));
    if (conflict) return NextResponse.json({ error: "Este login ja esta em uso." }, { status: 409 });

    const current = users[idx];
    if (lower(current.perfil).includes("admin") && !lower(nextPerfil).includes("admin") && activeAdminCount(users) <= 1) {
      return NextResponse.json({ error: "Nao e permitido remover o ultimo administrador do sistema." }, { status: 409 });
    }

    users[idx] = {
      ...current,
      pessoa: text(body.nome || current.pessoa || current.nome),
      nome: text(body.nome || current.nome || current.pessoa),
      usuario: nextUsuario,
      perfil: nextPerfil || current.perfil,
      email: text(body.email || current.email),
      telefone: text(body.telefone || current.telefone),
      celular: text(body.telefone || current.celular || current.telefone),
      whatsapp: text(body.telefone || current.whatsapp || current.telefone),
      cpf: digits(body.cpf || current.cpf),
      is_active: body.is_active === false ? false : true,
      status: body.is_active === false ? "Inativo" : "Ativo",
      deleted_at: body.is_active === false ? text(current.deleted_at) || new Date().toISOString() : "",
      deleted_by: body.is_active === false ? actor : "",
      updated_at: new Date().toISOString(),
      updated_by: actor,
    };
    await dbSet("users.json", users);
    await audit({ acao: "editar_usuario_interno", usuario_alvo: nextUsuario, actor });
    return NextResponse.json({ ok: true });
  }

  if (source === "teacher") {
    const [teachers, users] = await Promise.all([dbList<Row>("teachers.json"), dbList<Row>("users.json")]);
    const idx = teachers.findIndex((teacher) => text(teacher.id || teacher.nome) === id);
    if (idx === -1) return NextResponse.json({ error: "Professor nao encontrado." }, { status: 404 });
    const current = teachers[idx];
    const nextLogin = lower(body.usuario || current.usuario || current.login);
    if (nextLogin) {
      const conflict = users.find((user) =>
        lower(user.usuario) === nextLogin &&
        text(user.professor_id) !== text(current.id || current.nome) &&
        !text(user.deleted_at)
      );
      if (conflict) return NextResponse.json({ error: "Este login ja esta em uso." }, { status: 409 });
    }
    teachers[idx] = {
      ...current,
      nome: text(body.nome || current.nome || current.name),
      email: text(body.email || current.email),
      telefone: text(body.telefone || current.telefone),
      celular: text(body.telefone || current.celular || current.telefone),
      whatsapp: text(body.telefone || current.whatsapp || current.telefone),
      cpf: digits(body.cpf || current.cpf),
      usuario: nextLogin || text(current.usuario),
      login: nextLogin || text(current.login),
      status: body.is_active === false ? "Inativo" : "Ativo",
      is_active: body.is_active === false ? false : true,
      deleted_at: body.is_active === false ? text(current.deleted_at) || new Date().toISOString() : "",
      deleted_by: body.is_active === false ? actor : "",
      updated_at: new Date().toISOString(),
      updated_by: actor,
    };

    const userIdx = users.findIndex((user) =>
      text(user.professor_id) === text(current.id || current.nome) ||
      text(user.pessoa) === text(current.nome)
    );
    if (userIdx >= 0) {
      users[userIdx] = {
        ...users[userIdx],
        pessoa: text(teachers[idx].nome),
        usuario: nextLogin || text(users[userIdx].usuario),
        email: text(teachers[idx].email),
        celular: text(teachers[idx].celular || teachers[idx].telefone),
        telefone: text(teachers[idx].telefone),
        cpf: digits(teachers[idx].cpf),
        is_active: teachers[idx].is_active,
        status: teachers[idx].status,
        deleted_at: teachers[idx].deleted_at,
        deleted_by: teachers[idx].deleted_by,
        updated_at: new Date().toISOString(),
        updated_by: actor,
      };
    }

    await Promise.all([dbSet("teachers.json", teachers), dbSet("users.json", users)]);
    await audit({ acao: "editar_professor", usuario_alvo: nextLogin || text(current.nome), actor });
    return NextResponse.json({ ok: true });
  }

  if (source === "student") {
    const students = await dbList<Row>("students.json");
    const idx = students.findIndex((student) => text(student.id || student.nome) === id);
    if (idx === -1) return NextResponse.json({ error: "Aluno nao encontrado." }, { status: 404 });
    const current = students[idx];
    const nextLogin = lower(body.usuario || current.login || current.usuario);
    if (nextLogin) {
      const conflict = students.find((student, index) => index !== idx && lower(student.login || student.usuario) === nextLogin);
      if (conflict) return NextResponse.json({ error: "Este login ja esta em uso." }, { status: 409 });
    }
    students[idx] = {
      ...current,
      nome: text(body.nome || current.nome || current.name),
      email: text(body.email || current.email),
      responsavel_email: text(body.email || current.responsavel_email),
      telefone: text(body.telefone || current.telefone),
      celular: text(body.telefone || current.celular || current.telefone),
      whatsapp: text(body.telefone || current.whatsapp || current.telefone),
      responsavel_telefone: text(body.telefone || current.responsavel_telefone || current.telefone),
      cpf: digits(body.cpf || current.cpf),
      login: nextLogin || text(current.login),
      usuario: nextLogin || text(current.usuario),
      status: body.is_active === false ? "Inativo" : "Ativo",
      is_active: body.is_active === false ? false : true,
      deleted_at: body.is_active === false ? text(current.deleted_at) || new Date().toISOString() : "",
      deleted_by: body.is_active === false ? actor : "",
      updated_at: new Date().toISOString(),
      updated_by: actor,
    };
    await dbSet("students.json", students);
    await audit({ acao: "editar_aluno", usuario_alvo: nextLogin || text(current.nome), actor });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Fonte de usuario invalida." }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !isAdmin(session)) {
    return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });
  }
  const adminSession = session;

  const body = await req.json().catch(() => ({})) as Row;
  const action = text(body.action);
  const source = text(body.source);
  const id = text(body.id);
  if (action !== "reset_password" || !source || !id) {
    return NextResponse.json({ error: "Acao invalida." }, { status: 400 });
  }

  const tempPassword = generatedTempPassword();
  const actor = text(adminSession.pessoa || adminSession.usuario);

  if (source === "internal") {
    const users = await dbList<Row>("users.json");
    const idx = users.findIndex((user) => text(user.id || user.usuario) === id);
    if (idx === -1) return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 404 });
    const current = users[idx];
    users[idx] = {
      ...current,
      senha: tempPassword,
      must_change_password: true,
      password_reset_at: new Date().toISOString(),
      password_reset_by: actor,
    };
    await dbSet("users.json", users);
    const notify = await notifyPasswordReset({
      nome: text(users[idx].pessoa || users[idx].nome || users[idx].usuario),
      login: text(users[idx].usuario),
      senha: tempPassword,
      email: text(users[idx].email),
      telefone: text(users[idx].celular || users[idx].telefone || users[idx].whatsapp),
    }, adminSession);
    await audit({ acao: "resetar_senha_usuario_interno", usuario_alvo: text(users[idx].usuario), actor });
    return NextResponse.json({ ok: true, senha_temporaria: tempPassword, notify });
  }

  if (source === "teacher") {
    const [teachers, users] = await Promise.all([dbList<Row>("teachers.json"), dbList<Row>("users.json")]);
    const idx = teachers.findIndex((teacher) => text(teacher.id || teacher.nome) === id);
    if (idx === -1) return NextResponse.json({ error: "Professor nao encontrado." }, { status: 404 });
    teachers[idx] = {
      ...teachers[idx],
      senha: tempPassword,
      password_reset_at: new Date().toISOString(),
      password_reset_by: actor,
    };
    const userIdx = users.findIndex((user) =>
      text(user.professor_id) === text(teachers[idx].id || teachers[idx].nome) ||
      text(user.pessoa) === text(teachers[idx].nome)
    );
    if (userIdx >= 0) {
      users[userIdx] = {
        ...users[userIdx],
        senha: tempPassword,
        must_change_password: true,
        password_reset_at: new Date().toISOString(),
        password_reset_by: actor,
      };
    } else if (text(teachers[idx].usuario || teachers[idx].login)) {
      users.push({
        id: crypto.randomUUID(),
        professor_id: text(teachers[idx].id || teachers[idx].nome),
        pessoa: text(teachers[idx].nome),
        usuario: lower(teachers[idx].usuario || teachers[idx].login),
        senha: tempPassword,
        perfil: "Professor",
        must_change_password: true,
        created_at: new Date().toISOString(),
      });
    }
    await Promise.all([dbSet("teachers.json", teachers), dbSet("users.json", users)]);
    const notify = await notifyPasswordReset({
      nome: text(teachers[idx].nome),
      login: text(teachers[idx].usuario || teachers[idx].login),
      senha: tempPassword,
      email: text(teachers[idx].email),
      telefone: text(teachers[idx].celular || teachers[idx].telefone || teachers[idx].whatsapp),
    }, adminSession);
    await audit({ acao: "resetar_senha_professor", usuario_alvo: text(teachers[idx].usuario || teachers[idx].login || teachers[idx].nome), actor });
    return NextResponse.json({ ok: true, senha_temporaria: tempPassword, notify });
  }

  if (source === "student") {
    const students = await dbList<Row>("students.json");
    const idx = students.findIndex((student) => text(student.id || student.nome) === id);
    if (idx === -1) return NextResponse.json({ error: "Aluno nao encontrado." }, { status: 404 });
    students[idx] = {
      ...students[idx],
      senha: tempPassword,
      must_change_password: true,
      password_reset_at: new Date().toISOString(),
      password_reset_by: actor,
    };
    await dbSet("students.json", students);
    const notify = await notifyPasswordReset({
      nome: text(students[idx].nome || students[idx].name || students[idx].login),
      login: text(students[idx].login || students[idx].usuario),
      senha: tempPassword,
      email: studentCredentialEmail(students[idx]),
      telefone: studentCredentialPhone(students[idx]),
    }, adminSession);
    await audit({ acao: "resetar_senha_aluno", usuario_alvo: text(students[idx].login || students[idx].usuario || students[idx].nome), actor });
    return NextResponse.json({ ok: true, senha_temporaria: tempPassword, notify });
  }

  return NextResponse.json({ error: "Fonte de usuario invalida." }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || !isAdmin(session)) {
    return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });
  }
  const adminSession = session;

  const { searchParams } = new URL(req.url);
  const source = text(searchParams.get("source"));
  const id = text(searchParams.get("id"));
  if (!source || !id) {
    return NextResponse.json({ error: "Fonte e id sao obrigatorios." }, { status: 400 });
  }

  const actor = text(adminSession.pessoa || adminSession.usuario);

  if (source === "internal") {
    const users = await dbList<Row>("users.json");
    const idx = users.findIndex((user) => text(user.id || user.usuario) === id);
    if (idx === -1) return NextResponse.json({ error: "Usuario nao encontrado." }, { status: 404 });
    const current = users[idx];
    if (lower(current.perfil).includes("admin") && activeAdminCount(users) <= 1) {
      return NextResponse.json({ error: "Nao e permitido excluir o ultimo administrador do sistema." }, { status: 409 });
    }
    users[idx] = {
      ...current,
      is_active: false,
      status: "Inativo",
      deleted_at: new Date().toISOString(),
      deleted_by: actor,
    };
    await dbSet("users.json", users);
    await audit({ acao: "inativar_usuario_interno", usuario_alvo: text(current.usuario), actor });
    return NextResponse.json({ ok: true });
  }

  if (source === "teacher") {
    const [teachers, users] = await Promise.all([dbList<Row>("teachers.json"), dbList<Row>("users.json")]);
    const idx = teachers.findIndex((item) => text(item.id || item.nome) === id);
    if (idx === -1) return NextResponse.json({ error: "Professor nao encontrado." }, { status: 404 });
    const teacher = teachers[idx];
    teachers[idx] = {
      ...teacher,
      is_active: false,
      status: "Inativo",
      deleted_at: new Date().toISOString(),
      deleted_by: actor,
    };
    const updatedUsers = users.map((user) => {
      if (
        text(user.professor_id) === text(teacher.id || teacher.nome) ||
        lower(user.usuario) === lower(teacher.usuario || teacher.login)
      ) {
        return {
          ...user,
          is_active: false,
          status: "Inativo",
          deleted_at: new Date().toISOString(),
          deleted_by: actor,
        };
      }
      return user;
    });
    await Promise.all([dbSet("teachers.json", teachers), dbSet("users.json", updatedUsers)]);
    await audit({ acao: "inativar_professor", usuario_alvo: text(teacher.nome || id), actor });
    return NextResponse.json({ ok: true });
  }

  if (source === "student") {
    const students = await dbList<Row>("students.json");
    const idx = students.findIndex((item) => text(item.id || item.nome) === id);
    if (idx === -1) return NextResponse.json({ error: "Aluno nao encontrado." }, { status: 404 });
    const student = students[idx];
    students[idx] = {
      ...student,
      is_active: false,
      status: "Inativo",
      deleted_at: new Date().toISOString(),
      deleted_by: actor,
    };
    await dbSet("students.json", students);
    await audit({ acao: "inativar_aluno", usuario_alvo: text(student.nome || id), actor });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Fonte de usuario invalida." }, { status: 400 });
}
