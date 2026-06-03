import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dbList, dbSet } from "@/lib/db";
import { migrateModule, teacherClassValueByModule } from "@/lib/course-modules";
import { saveLibraryPdf, type LibraryPdfKey } from "@/lib/library-pdfs";
import { sendWhatsApp } from "@/lib/whatsapp";
import { sendEmail } from "@/lib/email";
import { notifyStudentsAboutLaunch } from "@/lib/student-launch-notifications";

type Row = Record<string, unknown>;
type WizSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;

function text(value: unknown) {
  return String(value || "").trim();
}

function lower(value: unknown) {
  return text(value).toLowerCase();
}

function canOperate(perfil: string) {
  const role = lower(perfil);
  return role.includes("admin") || role.includes("coord") || role.includes("dire") || role.includes("prof") || role.includes("comercial");
}

function canAdmin(perfil: string) {
  const role = lower(perfil);
  return role.includes("admin") || role.includes("coord") || role.includes("dire");
}

function normalizeList(value: unknown) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(/[,\n;]/).map((item) => item.trim()).filter(Boolean);
}

function normalize(value: unknown) {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function keywords(value: unknown) {
  return normalize(value).split(/[^a-z0-9]+/).filter((word) => word.length >= 3);
}

function firstName(value: unknown) {
  return text(value).split(/\s+/)[0] || "aluno";
}

function randomPassword() {
  return `Active${Math.floor(1000 + Math.random() * 9000)}`;
}

function portalUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://ativoeducacional.tech";
}

function studentPhone(row: Row) {
  return text(row.whatsapp || row.telefone || row.responsavel_telefone || row.phone);
}

function studentEmail(row: Row) {
  return text(row.email || row.responsavel_email);
}

function teacherPhone(row: Row) {
  return text(row.whatsapp || row.telefone || row.phone);
}

function teacherEmail(row: Row) {
  return text(row.email);
}

function userPhone(row: Row) {
  return text(row.whatsapp || row.telefone || row.celular || row.phone);
}

function userEmail(row: Row) {
  return text(row.email || row.usuario_email);
}

function credentialMessage(kind: "aluno" | "professor", nome: string, login: string, senha: string) {
  return `Ola, ${firstName(nome)}! Seu acesso do Active Educacional foi atualizado.\n\nPainel: ${portalUrl()}\nPerfil: ${kind}\nLogin: ${login}\nSenha: ${senha}\n\nAo entrar, guarde esses dados com seguranca.`;
}

function findByName(items: Row[], needle: unknown) {
  const wanted = normalize(needle);
  if (!wanted) return null;
  const wantedWords = keywords(wanted);
  let best: Row | null = null;
  let bestScore = 0;
  for (const item of items) {
    const id = normalize(item.id);
    const nome = normalize(item.nome || item.name || item.aluno || item.professor || item.usuario || item.login);
    const login = normalize(item.login || item.usuario);
    if (id === wanted || login === wanted || nome === wanted || nome.includes(wanted)) return item;
    const nameWords = keywords(nome);
    const score = wantedWords.filter((word) => nameWords.includes(word) || nome.includes(word)).length;
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return bestScore >= Math.min(2, wantedWords.length) ? best : null;
}

function filterRecipients(items: Row[], turma: unknown) {
  const target = normalize(turma || "Todas");
  if (!target || target === "todas" || target === "todos") return items;
  return items.filter((item) => {
    const itemTurma = normalize(item.turma || item.classe || item.class || item.className);
    return itemTurma === target || itemTurma.includes(target);
  });
}

function addMonths(dateStr: string, months: number) {
  const date = new Date(`${dateStr || new Date().toISOString().slice(0, 10)}T12:00:00`);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

function parseMoney(value: unknown) {
  const cleaned = text(value).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  return Number.parseFloat(cleaned) || 0;
}

function money(value: number) {
  return value.toFixed(2).replace(".", ",");
}

function findBestInText(items: Row[], prompt: unknown, fields: string[]) {
  const words = keywords(prompt);
  if (!words.length) return null;
  let best: Row | null = null;
  let bestScore = 0;
  for (const item of items) {
    const haystack = fields.map((field) => normalize(item[field])).join(" ");
    if (!haystack.trim()) continue;
    const score = words.filter((word) => haystack.includes(word)).length;
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return bestScore >= 1 ? best : null;
}

function libraryKey(tipo: unknown) {
  const t = lower(tipo || "livros");
  if (t.includes("video")) return "videos.json";
  if (t.includes("material") || t.includes("apostila") || t.includes("apoio")) return "materials.json";
  return "books.json";
}

async function savePdfBase64(data: Row, key: string, id: string) {
  const raw = text(data.pdf_base64 || data.arquivo_base64 || data.file_base64);
  if (!raw) return {};
  const clean = raw.includes(",") ? raw.split(",").pop() || "" : raw;
  const buffer = Buffer.from(clean, "base64");
  if (!buffer.length) throw new Error("PDF em base64 vazio.");
  if (key === "videos.json") return {};
  const filename = text(data.pdf_nome || data.nome_arquivo || data.filename || `${id}.pdf`);
  return saveLibraryPdf(key as LibraryPdfKey, id, buffer, filename, "application/pdf");
}

async function savePdfFile(file: File | null, key: string, id: string) {
  if (!(file instanceof File) || file.size === 0) return {};
  if (file.type && file.type !== "application/pdf") throw new Error("Envie apenas arquivo PDF.");
  if (key === "videos.json") return {};
  return saveLibraryPdf(
    key as LibraryPdfKey,
    id,
    Buffer.from(await file.arrayBuffer()),
    file.name || `${id}.pdf`,
    file.type || "application/pdf"
  );
}

async function audit(action: string, payload: Row, result: Row, actor: string, perfil: string) {
  const log = await dbList<Row>("wiz_action_audit.json");
  const entry = {
    id: crypto.randomUUID(),
    data: new Date().toISOString(),
    acao: action,
    usuario: actor,
    perfil,
    status: result.ok ? "concluido" : "erro",
    resultado: text(result.message),
    data_execucao: payload,
  };
  await dbSet("wiz_action_audit.json", [...log, entry]);
  return entry;
}

async function createWallPost(data: Row, actor: string) {
  const titulo = text(data.titulo || data.title || "Comunicado");
  const mensagem = text(data.mensagem || data.conteudo || data.texto);
  if (!titulo || !mensagem) return { ok: false, message: "Titulo e mensagem sao obrigatorios." };
  const post = {
    id: crypto.randomUUID(),
    titulo: titulo.slice(0, 100),
    mensagem,
    tipo_post: text(data.tipo_post || "Aviso Geral"),
    turma: text(data.turma || "Todas") || "Todas",
    turmas: normalizeList(data.turmas),
    publico: text(data.publico || "Alunos e responsaveis"),
    data: new Date().toLocaleDateString("pt-BR"),
    publicado_em: new Date().toISOString(),
    autor: actor,
    status: "Ativo",
    fixado: Boolean(data.fixado),
    requer_confirmacao: Boolean(data.requer_confirmacao),
    notification_status: {
      push: "pendente",
      whatsapp: data.enviar_whatsapp === false ? "nao_enviado" : "pendente",
      email: data.enviar_email === false ? "nao_enviado" : "pendente",
    },
  };
  const posts = await dbList<Row>("messages.json");
  await dbSet("messages.json", [...posts, post]);
  return { ok: true, message: `Comunicado criado: ${post.titulo}`, item: post };
}

function stripCommandNoise(value: string) {
  return value
    .replace(/^(enviar|mandar|avisar|comunicar|criar|gerar|melhorar)\s+(um\s+|uma\s+)?(comunicado|mensagem|aviso)?\s*/i, "")
    .replace(/\b(por|via)\s+(whatsapp|zap|email|e-mail)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function communicationBodyFromPrompt(prompt: unknown) {
  const raw = text(prompt);
  if (!raw) return "";
  const quoted = raw.match(/["“”']([^"“”']{4,})["“”']/);
  if (quoted?.[1]) return text(quoted[1]);

  const afterColon = raw.includes(":") ? raw.split(":").slice(1).join(":") : "";
  if (text(afterColon).length >= 4) return stripCommandNoise(afterColon);

  return stripCommandNoise(raw)
    .replace(/\bpara\s+todos\s+(os\s+)?alunos\b/gi, "")
    .replace(/\bpara\s+a\s+turma\s+[A-Za-zÀ-ÿ0-9 ]{2,50}/gi, "")
    .replace(/\bturma\s+[A-Za-zÀ-ÿ0-9 ]{2,50}/gi, "")
    .replace(/\bpara\s+(o\s+aluno|a\s+aluna|aluno|aluna)?\s*[A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)?/gi, "")
    .trim();
}

function polishedCommunicationMessage(raw: unknown) {
  const mensagem = text(raw);
  if (!mensagem) return "";
  const clean = stripCommandNoise(mensagem);
  const body = clean.endsWith(".") || clean.endsWith("!") || clean.endsWith("?") ? clean : `${clean}.`;
  return [
    "Comunicado Active Educacional",
    "",
    "Prezados(as),",
    "",
    body.charAt(0).toUpperCase() + body.slice(1),
    "",
    "Atenciosamente,",
    "Active Educacional",
  ].join("\n");
}

function wantsAllStudents(prompt: unknown) {
  const norm = normalize(prompt);
  return /\btodos?\s+(os\s+)?alunos\b/.test(norm) || /\balunos\s+de\s+todas\s+as\s+turmas\b/.test(norm);
}

function wantsClass(prompt: unknown) {
  return /\bturma\b/.test(normalize(prompt));
}

function extractClassTarget(prompt: string, classes: Row[], explicit: unknown) {
  if (text(explicit)) return findByName(classes, explicit);
  if (!wantsClass(prompt)) return null;
  const match = prompt.match(/\bturma\s+([A-Za-zÀ-ÿ0-9 ]{2,50}?)(?=,|\.|:|\s+comunicado|\s+mensagem|\s+aviso|\s+por\s+whatsapp|\s+por\s+email|\s+via\s+whatsapp|\s+via\s+email|$)/i);
  return findByName(classes, text(match?.[1])) || findBestInText(classes, prompt, ["nome", "name", "turma"]);
}

function extractStudentTarget(prompt: string, students: Row[], explicit: unknown) {
  if (text(explicit)) return findByName(students, explicit);
  if (wantsAllStudents(prompt) || wantsClass(prompt)) return null;
  const match = prompt.match(/\bpara\s+(?:o\s+aluno|a\s+aluna|aluno|aluna)?\s*([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)?)/i);
  return findByName(students, text(match?.[1])) || findBestInText(students, prompt, ["nome", "name", "aluno", "login"]);
}

async function sendBulkMessage(data: Row, actor: string, session: WizSession) {
  const prompt = text(data.prompt || data.mensagem || data.texto);
  const rawMessage = text(data.mensagem || data.texto) || communicationBodyFromPrompt(prompt);
  const mensagem = polishedCommunicationMessage(rawMessage);
  if (!mensagem) return { ok: false, message: "Mensagem e obrigatoria para envio em massa." };

  const publico = wantsAllStudents(prompt) ? "alunos" : lower(data.publico || data.destinatarios || "alunos");
  const assunto = text(data.assunto || data.titulo || "Mensagem Active Educacional");
  const [students, teachers, users, classes] = await Promise.all([
    dbList<Row>("students.json"),
    dbList<Row>("teachers.json"),
    dbList<Row>("users.json"),
    dbList<Row>("classes.json"),
  ]);
  const targetAluno = text(data.aluno || data.destinatario);
  const classTarget = extractClassTarget(prompt, classes, data.turma);
  const turmaDestino = wantsAllStudents(prompt) ? "Todas" : text(data.turma || classTarget?.nome || classTarget?.name);
  const studentTarget = extractStudentTarget(prompt, students, targetAluno);

  if (studentTarget && !turmaDestino && !wantsAllStudents(prompt)) {
    const phone = studentPhone(studentTarget);
    const email = studentEmail(studentTarget);
    const whatsapp = phone && data.enviar_whatsapp !== false ? await sendWhatsApp(phone, mensagem, session) : { ok: false, status: "sem telefone" };
    const emailResult = email && data.enviar_email !== false ? await sendEmail(email, assunto, mensagem, session) : { ok: false, status: "sem email" };
    return {
      ok: true,
      message: `Comunicado enviado para ${text(studentTarget.nome || studentTarget.name)}. WhatsApp: ${whatsapp.status}. E-mail: ${emailResult.status}.`,
      total: 1,
      whatsapp_enviados: whatsapp.ok ? 1 : 0,
      whatsapp_falhas: whatsapp.ok ? 0 : 1,
      emails_enviados: emailResult.ok ? 1 : 0,
      emails_falhas: emailResult.ok ? 0 : 1,
    };
  }

  const source = publico.includes("todos")
    ? [...students, ...teachers, ...users]
    : publico.includes("prof")
      ? teachers
      : publico.includes("usu")
        ? users
        : students;
  const recipients = filterRecipients(source, turmaDestino);
  const enviarWhatsApp = data.enviar_whatsapp !== false;
  const enviarEmail = data.enviar_email !== false;
  let whatsappOk = 0;
  let whatsappFalha = 0;
  let emailOk = 0;
  let emailFalha = 0;
  const seenWhats = new Set<string>();
  const seenEmail = new Set<string>();

  for (const item of recipients) {
    const phone = teacherPhone(item) || studentPhone(item) || userPhone(item);
    const email = teacherEmail(item) || studentEmail(item) || userEmail(item);
    if (enviarWhatsApp && phone && !seenWhats.has(phone)) {
      seenWhats.add(phone);
      const sent = await sendWhatsApp(phone, mensagem, session);
      if (sent.ok) whatsappOk += 1;
      else whatsappFalha += 1;
    }
    if (enviarEmail && email && !seenEmail.has(email)) {
      seenEmail.add(email);
      const sent = await sendEmail(email, assunto, mensagem, session);
      if (sent.ok) emailOk += 1;
      else emailFalha += 1;
    }
  }

  return {
    ok: true,
    message: `Envio em massa processado por ${actor}: ${recipients.length} destinatario(s), WhatsApp ${whatsappOk} enviado(s), ${whatsappFalha} falha(s), e-mail ${emailOk} enviado(s), ${emailFalha} falha(s).`,
    total: recipients.length,
    whatsapp_enviados: whatsappOk,
    whatsapp_falhas: whatsappFalha,
    emails_enviados: emailOk,
    emails_falhas: emailFalha,
  };
}

async function createHomework(data: Row, actor: string, session?: WizSession) {
  const titulo = text(data.titulo || "Tarefa criada pelo Wiz");
  const disciplina = text(data.disciplina || "Ingles");
  const turma = text(data.turma || "Todas") || "Todas";
  const quantidade = Math.max(1, Math.min(15, Number(data.quantidade_questoes || data.quantidade || 5) || 5));
  const foco = text(data.foco || data.conteudo || data.capitulo || "conteudo estudado");
  const questions = Array.from({ length: quantidade }).map((_, index) => ({
    id: crypto.randomUUID(),
    tipo: index % 3 === 0 ? "multipla_escolha" : index % 3 === 1 ? "verdadeiro_falso" : "aberta",
    enunciado: index % 3 === 0
      ? `Sobre ${foco}, escolha a alternativa correta. Questao ${index + 1}.`
      : index % 3 === 1
        ? `Verdadeiro ou falso: ${foco} pode ser aplicado em uma situacao real de comunicacao.`
        : `Explique com suas palavras: ${foco}.`,
    opcoes: index % 3 === 0 ? ["Alternativa correta", "Distrator comum", "Resposta incompleta", "Fora do contexto"] : [],
    correta_idx: index % 3 === 0 ? 0 : null,
    correta_texto: index % 3 === 1 ? "V" : "",
    pontos: index % 3 === 2 ? 3 : 2,
    feedback: "Revise antes de publicar para os alunos.",
  }));
  const item = {
    id: crypto.randomUUID(),
    tipo: "Licao de Casa",
    titulo,
    descricao: text(data.descricao || data.instrucoes || `Atividade objetiva sobre ${foco}.`),
    disciplina,
    turma,
    turmas: normalizeList(data.turmas),
    aluno: text(data.aluno),
    livro: text(data.livro),
    capitulo: text(data.capitulo),
    habilidade: foco,
    due_date: text(data.due_date || data.prazo),
    peso: Number(data.peso) || questions.reduce((sum, q) => sum + q.pontos, 0),
    questions,
    status: text(data.status || "Ativa"),
    autor: actor,
    created_at: new Date().toISOString(),
    notification_status: { push: "pendente", whatsapp: "pendente", email: "pendente" },
  };
  const [items, students] = await Promise.all([dbList<Row>("activities.json"), dbList<Row>("students.json")]);
  item.notification_status = await notifyStudentsAboutLaunch({
    students,
    item,
    kind: "licao",
    title: `Nova licao de casa: ${titulo}`,
    body: `Voce recebeu uma nova licao de ${disciplina}. Prazo: ${text(item.due_date) || "consulte no portal"}.`,
    session,
  });
  await dbSet("activities.json", [...items, item]);
  return { ok: true, message: `Tarefa criada: ${titulo}`, item };
}

async function createWork(data: Row, actor: string, session?: WizSession) {
  const item = {
    id: `d_${Date.now()}`,
    titulo: text(data.titulo || "Trabalho criado pelo Wiz"),
    descricao: text(data.descricao || data.instrucoes || "Trabalho avaliativo com criterios de entrega."),
    turma: text(data.turma || "Todas"),
    disciplina: text(data.disciplina || "Ingles"),
    prazo: text(data.prazo || data.due_date),
    pontos: Number(data.pontos || data.peso || 10),
    criterios: text(data.criterios || "Organizacao, conteudo, entrega e apresentacao."),
    autor: actor,
    status: text(data.status || "Publicado"),
    notification_status: { push: "pendente", whatsapp: "pendente", email: "pendente" },
  };
  const [items, students] = await Promise.all([dbList<Row>("challenges.json"), dbList<Row>("students.json")]);
  item.notification_status = await notifyStudentsAboutLaunch({
    students,
    item,
    kind: "desafio",
    title: `Novo desafio: ${text(item.titulo)}`,
    body: `Um novo desafio foi lancado para voce. Pontos: ${text(item.pontos)}.`,
    session,
  });
  await dbSet("challenges.json", [...items, item]);
  return { ok: true, message: `Trabalho/desafio criado: ${item.titulo}`, item };
}

async function createStudent(data: Row) {
  const nome = text(data.nome || data.aluno);
  if (!nome) return { ok: false, message: "Nome do aluno e obrigatorio." };
  const modulo = migrateModule(data.modulo || "Aula em Turma");
  const item = {
    id: crypto.randomUUID(),
    nome,
    turma: text(data.turma || "Sem Turma"),
    classe: text(data.turma || "Sem Turma"),
    livro: text(data.livro || "Livro 1"),
    book: text(data.livro || "Livro 1"),
    modulo,
    responsavel_nome: text(data.responsavel),
    responsavel_telefone: text(data.telefone || data.whatsapp),
    responsavel_email: text(data.email),
    telefone: text(data.telefone || data.whatsapp),
    email: text(data.email),
    valor_mensalidade: text(data.valor_mensalidade),
    valor_professor_aula: teacherClassValueByModule(modulo),
    status: "Ativo",
    created_at: new Date().toISOString(),
    created_by: "Assistente Wiz",
  };
  const students = await dbList<Row>("students.json");
  await dbSet("students.json", [...students, item]);
  return { ok: true, message: `Aluno cadastrado: ${nome}`, item };
}

async function createFinancial(data: Row) {
  const aluno = text(data.aluno || data.nome);
  if (!aluno) return { ok: false, message: "Aluno e obrigatorio para recebimento." };
  const total = parseMoney(data.valor_total || data.valor);
  if (total <= 0) return { ok: false, message: "Valor total e obrigatorio." };
  const parcelas = Math.max(1, Math.min(48, Number(data.parcelas || data.qtd_parcelas || 1) || 1));
  const valorParcela = total / parcelas;
  const vencimento = text(data.vencimento || new Date().toISOString().slice(0, 10));
  const items = await dbList<Row>("receivables.json");
  const created = Array.from({ length: parcelas }).map((_, index) => {
    const parcela = `${index + 1}/${parcelas}`;
    return {
      id: crypto.randomUUID(),
      aluno,
      aluno_login: text(data.aluno_login),
      telefone: text(data.telefone || data.whatsapp),
      whatsapp: text(data.telefone || data.whatsapp),
      email: text(data.email),
      data_lancamento: text(data.data_lancamento || new Date().toISOString().slice(0, 10)),
      descricao: `${text(data.categoria || "Mensalidade")} - ${text(data.descricao || "Lancamento Wiz")} - Parcela ${parcela}`,
      categoria: text(data.categoria || "Mensalidade"),
      tipo_lancamento_detalhe: text(data.categoria || "Mensalidade"),
      valor: money(valorParcela),
      valor_total: money(total),
      valor_parcela: money(valorParcela),
      vencimento: addMonths(vencimento, index),
      data_vencimento: addMonths(vencimento, index),
      parcela,
      parcela_numero: index + 1,
      parcela_total: parcelas,
      status: data.gerar_boleto === false ? "Pendente" : "Boleto gerado",
      boleto_status: data.gerar_boleto === false ? "" : "Gerado",
      boleto_codigo: `AE-${Date.now()}-${index + 1}`,
      created_at: new Date().toISOString(),
      created_by: "Assistente Wiz",
      notification_status: { push: "pendente", whatsapp: "pendente", email: "pendente" },
    };
  });
  await dbSet("receivables.json", [...items, ...created]);
  return { ok: true, message: `Recebimento criado: ${parcelas} parcela(s) para ${aluno}`, items: created };
}

async function resetStudentAccess(data: Row, actor: string, session: WizSession) {
  const students = await dbList<Row>("students.json");
  const student = findByName(students, data.aluno || data.nome || data.login || data.id);
  if (!student) return { ok: false, message: "Aluno nao encontrado para atualizar acesso." };

  const nome = text(student.nome || student.name || data.nome);
  const login = text(data.login) || text(student.login) || normalize(nome).replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");
  const senha = text(data.senha || data.password) || randomPassword();
  const updated = students.map((item) => item === student ? {
    ...item,
    login,
    usuario: login,
    senha,
    password: senha,
    access_updated_at: new Date().toISOString(),
    access_updated_by: actor,
  } : item);
  await dbSet("students.json", updated);

  const message = credentialMessage("aluno", nome, login, senha);
  const phone = text(data.telefone || data.whatsapp) || studentPhone(student);
  const email = text(data.email) || studentEmail(student);
  const whatsapp = phone ? await sendWhatsApp(phone, message, session) : { ok: false, status: "sem telefone" };
  const emailResult = email ? await sendEmail(email, "Acesso Active Educacional", message, session) : { ok: false, status: "sem email" };

  return {
    ok: true,
    message: `Acesso do aluno atualizado. WhatsApp: ${whatsapp.status}. E-mail: ${emailResult.status}.`,
    aluno: nome,
    login,
    senha,
    whatsapp_status: whatsapp.status,
    email_status: emailResult.status,
  };
}

async function addLibraryMaterial(data: Row, actor: string, file: File | null = null) {
  const titulo = text(data.titulo || data.title || data.nome || data.material);
  if (!titulo) return { ok: false, message: "Titulo do material e obrigatorio para cadastrar na biblioteca." };

  const key = libraryKey(data.tipo || data.categoria || data.secao);
  if (key === "videos.json" && !text(data.url)) {
    return { ok: false, message: "Para video, informe a URL do video." };
  }

  const id = text(data.id) || `wiz_bib_${Date.now()}`;
  let pdfInfo: Row = {};
  try {
    pdfInfo = file instanceof File ? await savePdfFile(file, key, id) : await savePdfBase64(data, key, id);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Erro ao salvar PDF." };
  }

  const item = {
    id,
    titulo,
    title: titulo,
    autor: text(data.autor || data.editora || "Professor Wiz"),
    nivel: text(data.nivel || data.livro || data.book || "Geral"),
    turma: text(data.turma || "Todas") || "Todas",
    tipo: key === "materials.json" ? text(data.tipo || "Apostila") : text(data.tipo || "Livro"),
    categoria: text(data.categoria || data.nivel || data.livro || "Geral"),
    descricao: text(data.descricao || data.observacao || "Material cadastrado pelo Professor Wiz."),
    url: text(pdfInfo.url || data.url || data.link),
    pdf_nome: text(pdfInfo.pdf_nome || data.pdf_nome || data.nome_arquivo),
    origem: "Professor Wiz",
    created_by: actor,
    created_at: new Date().toISOString(),
  };

  if (!item.url && key !== "videos.json") {
    return { ok: false, message: "Informe um link do PDF ou envie pdf_base64 para cadastrar o arquivo na biblioteca." };
  }

  const items = await dbList<Row>(key);
  const existingIdx = items.findIndex((row) => normalize(row.titulo || row.title) === normalize(titulo) && normalize(row.turma || "Todas") === normalize(item.turma));
  const next = existingIdx >= 0
    ? items.map((row, index) => index === existingIdx ? { ...row, ...item, id: text(row.id) || id, updated_at: new Date().toISOString() } : row)
    : [...items, item];
  await dbSet(key, next);

  const label = key === "materials.json" ? "material" : key === "videos.json" ? "video" : "livro";
  return { ok: true, message: `${label} cadastrado na biblioteca: ${titulo}`, item };
}

async function resetTeacherAccess(data: Row, actor: string, session: WizSession) {
  const teachers = await dbList<Row>("teachers.json");
  const teacher = findByName(teachers, data.professor || data.nome || data.login || data.id);
  if (!teacher) return { ok: false, message: "Professor nao encontrado para atualizar acesso." };

  const nome = text(teacher.nome || teacher.name || data.nome);
  const login = text(data.login) || text(teacher.login) || normalize(nome).replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");
  const senha = text(data.senha || data.password) || randomPassword();
  await dbSet("teachers.json", teachers.map((item) => item === teacher ? {
    ...item,
    login,
    usuario: login,
    senha,
    password: senha,
    access_updated_at: new Date().toISOString(),
    access_updated_by: actor,
  } : item));

  const users = await dbList<Row>("users.json");
  const existingUser = findByName(users, login) || findByName(users, nome);
  const userRecord = {
    ...(existingUser || {}),
    id: text(existingUser?.id) || text(teacher.id) || crypto.randomUUID(),
    nome,
    pessoa: nome,
    usuario: login,
    login,
    senha,
    password: senha,
    perfil: text(existingUser?.perfil || "professor"),
    professor_id: text(teacher.id),
    status: "Ativo",
    updated_at: new Date().toISOString(),
  };
  await dbSet("users.json", existingUser ? users.map((item) => item === existingUser ? userRecord : item) : [...users, userRecord]);

  const message = credentialMessage("professor", nome, login, senha);
  const phone = text(data.telefone || data.whatsapp) || teacherPhone(teacher);
  const email = text(data.email) || teacherEmail(teacher);
  const whatsapp = phone ? await sendWhatsApp(phone, message, session) : { ok: false, status: "sem telefone" };
  const emailResult = email ? await sendEmail(email, "Acesso Active Educacional", message, session) : { ok: false, status: "sem email" };

  return {
    ok: true,
    message: `Acesso do professor atualizado. WhatsApp: ${whatsapp.status}. E-mail: ${emailResult.status}.`,
    professor: nome,
    login,
    senha,
    whatsapp_status: whatsapp.status,
    email_status: emailResult.status,
  };
}

async function createAgenda(data: Row, actor: string) {
  const titulo = text(data.titulo || data.descricao || "Evento criado pelo Wiz");
  const item = {
    id: crypto.randomUUID(),
    titulo,
    descricao: text(data.descricao),
    data: text(data.data || new Date().toISOString().slice(0, 10)),
    horario: text(data.horario || data.hora),
    turma: text(data.turma),
    professor: text(data.professor),
    status: text(data.status || "Agendado"),
    created_at: new Date().toISOString(),
    created_by: actor,
  };
  const agenda = await dbList<Row>("agenda.json");
  await dbSet("agenda.json", [...agenda, item]);
  return { ok: true, message: `Agenda criada: ${titulo}`, item };
}

async function answerStudent(data: Row, actor: string, session: WizSession) {
  const aluno = text(data.aluno || data.nome || data.destinatario);
  const pergunta = text(data.pergunta || data.mensagem || data.texto);
  if (!aluno || !pergunta) return { ok: false, message: "Informe aluno e mensagem para responder." };

  const students = await dbList<Row>("students.json");
  const student = findByName(students, aluno);
  const livro = text(student?.livro || student?.book || data.livro || "livro cadastrado");
  const resposta = text(data.resposta) || `Ola, ${firstName(aluno)}! Revise o conteudo do ${livro} e pratique com exemplos curtos em ingles. Se a duvida continuar, envie uma frase de exemplo para o professor corrigir.`;
  const item = {
    id: crypto.randomUUID(),
    aluno,
    pergunta,
    resposta,
    livro_referencia: livro,
    origem: "Professor Wiz",
    professor: actor,
    status: "respondido",
    data: new Date().toISOString(),
  };
  const messages = await dbList<Row>("student_messages.json");
  await dbSet("student_messages.json", [...messages, item]);

  const phone = text(data.telefone || data.whatsapp) || (student ? studentPhone(student) : "");
  const whatsapp = phone ? await sendWhatsApp(phone, resposta, session) : { ok: false, status: "sem telefone" };
  return { ok: true, message: `Resposta registrada para ${aluno}. WhatsApp: ${whatsapp.status}.`, item, whatsapp_status: whatsapp.status };
}

async function logMessage(data: Row, actor: string) {
  const item = {
    id: crypto.randomUUID(),
    destinatario: text(data.destinatario || data.aluno || data.turma || "Todos"),
    assunto: text(data.assunto || "Mensagem Wiz"),
    mensagem: text(data.mensagem || data.texto),
    canal: text(data.canal || "WhatsApp e e-mail"),
    status: "preparado",
    origem: "Assistente Wiz",
    usuario: actor,
    data: new Date().toISOString(),
  };
  if (!item.mensagem) return { ok: false, message: "Mensagem e obrigatoria." };
  const logs = await dbList<Row>("email_log.json");
  await dbSet("email_log.json", [...logs, item]);
  return { ok: true, message: `Envio preparado para ${item.destinatario}`, item };
}

const STOP_PHRASES = [
  "parar", "pare", "chega", "cancelar", "cancela",
  "nao precisa", "eu resolvo", "eu cuido", "deixa eu",
  "pode parar", "tchau", "fui", "ok obrigado", "ok obrigada",
  "ok valeu", "valeu wiz", "obrigado wiz", "obrigada wiz",
  "pode deixar", "tudo certo", "ja entendi",
];

function isStopCommand(prompt: string): boolean {
  const norm = normalize(prompt).replace(/[!.?]+$/, "").trim();
  return STOP_PHRASES.some((w) => norm === w || norm.startsWith(w + " ") || norm.endsWith(" " + w));
}

const STOP_REPLIES = [
  "Certo, sem problema! Qualquer coisa é só chamar.",
  "Entendido! Fico por aqui se precisar.",
  "Ok, tudo bem! Se surgir qualquer dúvida, estou disponível.",
  "Claro! Pode continuar. Se precisar de mim, é só pedir.",
];

const FALLBACK_MESSAGES = [
  "Boa pergunta! Esse ponto aqui está fora do que consigo resolver sozinho. Vou encaminhar para o responsável dar uma olhada — ele entra em contato em breve. Para o operacional do dia a dia, pode chamar!",
  "Hmm, esse aqui vai precisar de atenção humana! Já anotei e vou repassar para o responsável. Para registros de aula, cadastros e comunicados, estou aqui.",
  "Entendido! Esse ponto foge um pouco do que consigo fazer diretamente, mas não se preocupa — vou encaminhar para o responsável resolver. Se precisar de mais alguma coisa enquanto isso, é só pedir!",
  "Anotado! Isso vai precisar da atenção do responsável. Já encaminhei para ele. Se quiser ajuda com algo operacional — aulas, alunos, financeiro — pode contar comigo.",
];

function randomOf(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

function humanFallback(): string {
  return randomOf(FALLBACK_MESSAGES);
}

function supportAnswer(prompt: string): string {
  const norm = normalize(prompt);
  if ((norm.includes("suporte") || norm.includes("ajuda") || norm.includes("como")) && norm.includes("pix")) {
    return [
      "Para gerar PIX real do Mercado Pago: abra Financeiro, localize o recebimento do aluno e clique em Gerar Pix MP.",
      "Depois de gerado, o botao Abrir Pix mostra o link/QR Code do Mercado Pago. Nao existe PIX interno ou fake: se o Mercado Pago recusar, o sistema mostra o erro.",
      "A baixa automatica usa o webhook do Mercado Pago em /api/financeiro/mercado-pago/webhook e registra a forma de pagamento como Pix Mercado Pago quando o pagamento for aprovado.",
      "Para evitar erro, mantenha no cadastro do aluno ou responsavel: nome, e-mail valido, CPF/CNPJ e WhatsApp.",
    ].join("\n");
  }
  if ((norm.includes("suporte") || norm.includes("ajuda") || norm.includes("como")) && (norm.includes("backup") || norm.includes("bkup"))) {
    return [
      "O Active faz backup automatico diario quando administrador/coordenador acessa o Financeiro.",
      "O backup automatico tambem pode ser chamado por /api/backup/auto ou /api/backup/auto?secret=CRON_SECRET.",
      "Os arquivos automaticos ficam em data/backups/automaticos, com retencao de 30 backups.",
      "Antes de limpeza de duplicados ou alteracao financeira sensivel, confirme um backup recente.",
    ].join("\n");
  }
  if ((norm.includes("suporte") || norm.includes("ajuda") || norm.includes("como")) && (norm.includes("relatorio") || norm.includes("relatorios"))) {
    return [
      "No Financeiro, use Relatorios prontos para ver resumo executivo, caixa mensal, inadimplencia, Mercado Pago, Pix/Boleto e exportar CSV.",
      "O botao Exportar ainda baixa uma planilha geral de recebimentos e despesas.",
      "Para conferir inadimplencia operacional, use a aba Inadimplencia e as filas de cobranca inteligente.",
    ].join("\n");
  }
  if ((norm.includes("suporte formal") || norm.includes("documentacao") || norm.includes("documentacao formal"))) {
    return "O suporte formal do Active esta documentado em docs/SUPORTE_FORMAL_ACTIVE.md. Ele cobre Mercado Pago, Pix, boleto, backup automatico, relatorios, limpeza de duplicados e procedimento seguro de deploy.";
  }
  if ((norm.includes("suporte") || norm.includes("ajuda") || norm.includes("como")) && norm.includes("boleto")) {
    return [
      "Para gerar boleto real do Mercado Pago: abra Financeiro, localize o recebimento do aluno e clique em Gerar boleto MP.",
      "O sistema usa os dados do cadastro do aluno/responsavel, incluindo nome, e-mail valido, CPF/CNPJ, WhatsApp e endereco quando disponivel.",
      "Boletos internos AE-* ou URLs que nao sao Mercado Pago nao contam como boleto MP valido. Se existir boleto antigo/fake, gere novamente pelo botao Gerar boleto MP.",
      "A baixa automatica usa o webhook do Mercado Pago em /api/financeiro/mercado-pago/webhook. Quando o pagamento for aprovado, o lancamento muda para Pago.",
      "Para anexar boleto em PDF manual: abra Financeiro > Importar boleto PDF, selecione o aluno, escolha o arquivo e salve.",
    ].join("\n");
  }
  if ((norm.includes("suporte") || norm.includes("ajuda") || norm.includes("como")) && norm.includes("financeiro")) {
    return [
      "No Financeiro voce pode criar recebimentos, gerar Boleto MP, gerar Pix MP, anexar boleto PDF manual, enviar cobranca, dar baixa e estornar baixa com auditoria de administrador.",
      "Boleto MP e Pix MP usam o mesmo Access Token e webhook do Mercado Pago configurados em Configuracoes.",
      "A baixa automatica acontece quando o Mercado Pago envia o evento Pagamentos/payments para o webhook do Active.",
      "Duplicados em aberto podem ser limpos com backup antes da remocao; lancamentos pagos devem ser preservados ou removidos somente com confirmacao.",
    ].join("\n");
  }
  return "";
}

function actionHumanLabel(action: string): string {
  const labels: Record<string, string> = {
    create_homework: "criar uma tarefa ou lição de casa",
    create_work: "lançar um trabalho ou desafio",
    create_student: "cadastrar um aluno",
    create_financial: "lançar um recebimento ou cobrança",
    create_agenda: "adicionar um evento na agenda",
    reset_student_access: "atualizar o acesso de um aluno",
    reset_teacher_access: "atualizar o acesso de um professor",
    answer_student: "responder a dúvida de um aluno",
    create_wall_post: "criar um comunicado",
    send_bulk_message: "enviar mensagem em massa",
    add_library_material: "cadastrar material na biblioteca",
    record_teacher_class: "registrar a aula de um professor",
  };
  return labels[action] || "executar essa ação";
}

function findInPrompt(items: Row[], prompt: string, fields: string[]): Row | null {
  const normPrompt = normalize(prompt);
  let best: Row | null = null;
  let bestLen = 0;
  for (const item of items) {
    for (const field of fields) {
      const name = normalize(item[field]);
      if (name && name.length >= 3 && normPrompt.includes(name) && name.length > bestLen) {
        best = item;
        bestLen = name.length;
      }
    }
  }
  return best;
}

function extractDate(prompt: string): string {
  const norm = lower(prompt);
  const today = new Date();
  const iso = prompt.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const br = prompt.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (br) {
    const y = br[3] ? (br[3].length === 2 ? `20${br[3]}` : br[3]) : today.getFullYear().toString();
    return `${y}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }
  if (norm.includes("ontem")) { const d = new Date(today); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); }
  const weekdays = [["domingo","dom"],["segunda","seg"],["terca","ter"],["quarta","qua"],["quinta","qui"],["sexta","sex"],["sabado","sab"]];
  for (let i = 0; i < weekdays.length; i++) {
    if (weekdays[i].some((d) => norm.includes(d))) {
      const d = new Date(today);
      const diff = (d.getDay() - i + 7) % 7;
      d.setDate(d.getDate() - (diff === 0 ? 7 : diff));
      return d.toISOString().slice(0, 10);
    }
  }
  return today.toISOString().slice(0, 10);
}

async function recordTeacherClass(prompt: string, actor: string): Promise<Row> {
  const [turmas, professores, sessions, payables] = await Promise.all([
    dbList<Row>("classes.json"),
    dbList<Row>("teachers.json"),
    dbList<Row>("class_sessions.json"),
    dbList<Row>("payables.json"),
  ]);

  const turmaFound = findInPrompt(turmas, prompt, ["nome", "name", "turma"]);
  if (!turmaFound) {
    const nomes = turmas.slice(0, 8).map((t) => text(t.nome || t.name)).filter(Boolean).join(", ");
    return { ok: false, message: `Nao consegui identificar a turma. Informe o nome exato, ex: 'turma Chicago'.\nTurmas cadastradas: ${nomes || "nenhuma"}` };
  }

  const profFound = findInPrompt(professores, prompt, ["nome", "name"]);
  const professorName = profFound
    ? text(profFound.nome || profFound.name)
    : text(turmaFound.professor);
  if (!professorName) {
    const nomes = professores.slice(0, 8).map((p) => text(p.nome || p.name)).filter(Boolean).join(", ");
    return { ok: false, message: `Nao consegui identificar o professor. Informe o nome, ex: 'professora Maria'.\nProfessores cadastrados: ${nomes || "nenhum"}` };
  }
  const teacher = profFound || professores.find((p) => normalize(text(p.nome || p.name)) === normalize(professorName)) || {};

  const dataAula = extractDate(prompt);

  const normP = normalize(prompt);
  const licaoMatch = normP.match(/li[cç][aã]o\s+([a-z0-9 ]+?)(?=\s+(?:ate|a |ao |,|$))/);
  const licaoInicio = licaoMatch ? licaoMatch[1].trim() : "";
  const fimMatch = normP.match(/(?:ate|parou\s+(?:em|na|no|na))\s+([a-z0-9 ]+?)(?=\s|$)/);
  const licaoFim = fimMatch ? fimMatch[1].trim() : licaoInicio;

  const materiaMatch = prompt.match(/(?:conte[uú]do|mat[eé]ria)[:\s]+([^,\n.]+)/i);
  const materia = materiaMatch ? materiaMatch[1].trim() : "Aula registrada pelo Assistente Wiz";
  const tarefaMatch = prompt.match(/(?:tarefa|dever|li[cç][aã]o de casa)[:\s]+([^,\n.]+)/i);
  const tarefa = tarefaMatch ? tarefaMatch[1].trim() : "Verificar com o professor";

  const turmaId = text(turmaFound.id || turmaFound.nome || turmaFound.name);
  const turmaName = text(turmaFound.nome || turmaFound.name);
  const modulo = migrateModule(turmaFound.modulo || turmaFound.tipo_aula || turmaFound.modalidade || turmaFound.nivel);
  const livro = text(turmaFound.livro || turmaFound.book);
  const valorAula = teacherClassValueByModule(modulo) ||
    parseMoney((teacher as Row).valor_aula || (teacher as Row).valor_hora || (teacher as Row).valor || turmaFound.valor_aula || "0");

  const aulaId = crypto.randomUUID();
  const now = new Date().toISOString();

  const aula: Row = {
    id: aulaId,
    turma_id: turmaId,
    turma: turmaName,
    professor: professorName,
    professor_telefone: text((teacher as Row).telefone || (teacher as Row).whatsapp || (teacher as Row).celular),
    professor_email: text((teacher as Row).email),
    modulo,
    livro,
    licao_inicio: licaoInicio,
    licao_fim: licaoFim,
    status: "fechada",
    data_aula: dataAula,
    materia,
    tarefa,
    presencas: [],
    observacoes: "Registrado pelo Assistente Wiz",
    valor_aula: valorAula,
    vip_consumed_students: [],
    aberta_por: actor,
    fechada_por: actor,
    inicio: now,
    fim: now,
    created_at: now,
    updated_at: now,
  };

  const payable: Row = {
    id: crypto.randomUUID(),
    aula_id: aulaId,
    tipo_origem: "aula_professor",
    categoria: "Professor",
    aluno: professorName,
    nome: professorName,
    professor: professorName,
    professor_telefone: text((teacher as Row).telefone || (teacher as Row).whatsapp || (teacher as Row).celular),
    professor_email: text((teacher as Row).email),
    turma: turmaName,
    modulo,
    livro,
    licao_inicio: licaoInicio,
    licao_fim: licaoFim,
    descricao: `Aula dada - ${turmaName} - ${livro || "Livro nao informado"} - ${dataAula}`,
    valor: valorAula,
    valor_unitario: valorAula,
    vencimento: dataAula,
    data_vencimento: dataAula,
    data_aula: dataAula,
    status: "Pendente",
    created_at: now,
  };

  const updatedTurmas = turmas.map((t) =>
    text(t.id || t.nome || t.name) === turmaId || text(t.nome || t.name) === turmaName
      ? { ...t, ultima_licao: licaoFim, ultima_aula: now, aula_aberta_id: "", aula_status: "Fechada" }
      : t
  );

  await Promise.all([
    dbSet("class_sessions.json", [...sessions, aula]),
    dbSet("payables.json", [...payables, payable]),
    dbSet("classes.json", updatedTurmas),
  ]);

  const valorFmt = valorAula > 0 ? `R$ ${money(valorAula)}` : "sem valor cadastrado";
  return {
    ok: true,
    message: `Aula registrada com sucesso!\nProfessor: ${professorName}\nTurma: ${turmaName}\nData: ${dataAula}${licaoFim ? `\nLicao: ate ${licaoFim}` : ""}\nFinanceiro gerado: ${valorFmt} (status: Pendente)`,
  };
}

function isClassRegistration(norm: string): boolean {
  const hasAula = norm.includes("aula") || norm.includes("aulas");
  if (!hasAula) return false;
  if (norm.includes("cadastr") || norm.includes("registr") || norm.includes("lanc")) return true;
  if (norm.includes("professor") || norm.includes("professora") || norm.match(/\bprof\b/)) return true;
  if (norm.includes("deu aula") || norm.includes("deram aula") || norm.includes("ministrou") || norm.includes("teve aula")) return true;
  return false;
}

function suggestFromPrompt(prompt: string) {
  const norm = lower(prompt);
  if (isClassRegistration(norm)) return "record_teacher_class";
  if (norm.includes("whatsapp") || norm.includes("email") || norm.includes("e-mail") || norm.includes("comunicado") || norm.includes("avisar") || norm.includes("enviar mensagem") || norm.includes("mandar mensagem")) return "send_bulk_message";
  if ((norm.includes("senha") || norm.includes("login") || norm.includes("acesso")) && norm.includes("prof")) return "reset_teacher_access";
  if (norm.includes("senha") || norm.includes("login") || norm.includes("acesso")) return "reset_student_access";
  if (norm.includes("responder") || norm.includes("duvida") || norm.includes("chat")) return "answer_student";
  if (norm.includes("comunic") || norm.includes("aviso") || norm.includes("mensagem")) return "create_wall_post";
  if (norm.includes("tarefa") || norm.includes("licao") || norm.includes("lição") || norm.includes("homework")) return "create_homework";
  if (norm.includes("trabalho") || norm.includes("desafio")) return "create_work";
  if ((norm.includes("biblioteca") || norm.includes("material") || norm.includes("pdf") || norm.includes("livro") || norm.includes("apostila")) && (norm.includes("adicionar") || norm.includes("cadastrar") || norm.includes("incluir") || norm.includes("publicar"))) return "add_library_material";
  if (norm.includes("aluno") && (norm.includes("cadastr") || norm.includes("criar"))) return "create_student";
  if (norm.includes("receb") || norm.includes("boleto") || norm.includes("mensalidade") || norm.includes("financeiro")) return "create_financial";
  if (norm.includes("agenda") || norm.includes("evento")) return "create_agenda";
  return "answer";
}

function bulkDataFromPrompt(prompt: string) {
  const norm = lower(prompt);
  const publico = norm.includes("prof") ? "professores" : norm.includes("usuario") || norm.includes("usuário") ? "usuarios" : norm.includes("aluno") ? "alunos" : norm.includes("todos") ? "todos" : "alunos";
  const msgMatch = prompt.match(/(?:mensagem|comunicado|texto|avisar|enviar|mandar)[:\s-]+(.+)$/i);
  const quoted = prompt.match(/["“”']([^"“”']{4,})["“”']/);
  const turmaMatch = prompt.match(/turma\s+([A-Za-zÀ-ÿ0-9 ]{3,40}?)(?=,|\.|\s+mensagem|\s+comunicado|\s+avisar|\s+enviar|\s+mandar|$)/i);
  const alunoMatch = prompt.match(/(?:aluno|para)\s+([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)?)/i);
  const mensagem = text(quoted?.[1] || msgMatch?.[1]) || prompt;
  return {
    publico,
    turma: norm.includes("todos") ? "Todas" : text(turmaMatch?.[1]),
    aluno: text(turmaMatch?.[1]) ? "" : text(alunoMatch?.[1]),
    assunto: "Mensagem do Professor Wiz",
    prompt,
    mensagem,
    enviar_whatsapp: true,
    enviar_email: true,
  };
}

function communicationDataFromPrompt(prompt: string) {
  const norm = lower(prompt);
  const publico = norm.includes("prof") ? "professores" : norm.includes("usuario") || norm.includes("usu") ? "usuarios" : "alunos";
  const turmaMatch = prompt.match(/turma\s+([A-Za-zÀ-ÿ0-9 ]{3,40}?)(?=,|\.|:|\s+mensagem|\s+comunicado|\s+avisar|\s+enviar|\s+mandar|$)/i);
  const alunoMatch = prompt.match(/(?:aluno|para)\s+([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)?)/i);
  const turma = text(turmaMatch?.[1]);
  return {
    publico,
    turma: wantsAllStudents(prompt) ? "Todas" : turma,
    aluno: turma || wantsAllStudents(prompt) ? "" : text(alunoMatch?.[1]),
    assunto: "Comunicado Active Educacional",
    prompt,
    mensagem: communicationBodyFromPrompt(prompt) || prompt,
    enviar_whatsapp: true,
    enviar_email: true,
  };
}

function extractPromptField(prompt: string, names: string[]) {
  const escaped = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const pattern = new RegExp(`(?:${escaped})\\s*[:=-]\\s*([^\\n,;]+)`, "i");
  return text(prompt.match(pattern)?.[1]);
}

function libraryDataFromPrompt(prompt: string): Row {
  const norm = lower(prompt);
  const url = text(prompt.match(/https?:\/\/\S+/i)?.[0]).replace(/[),.;]+$/g, "");
  const tipo = norm.includes("video")
    ? "videos"
    : norm.includes("apostila") || norm.includes("material")
      ? "materiais"
      : "livros";
  const tituloFromField = extractPromptField(prompt, ["titulo", "título", "nome"]);
  const tituloFromCadastrar = text(prompt.match(/(?:cadastrar|adicionar|incluir|publicar)\s+(?:material|livro|apostila|pdf)?\s*(?:na biblioteca)?\s*[:=-]?\s*([^,\n;]+)/i)?.[1]);
  const titulo = tituloFromField || tituloFromCadastrar || text(prompt.replace(/https?:\/\/\S+/gi, "").split(/[,;\n]/)[0]).replace(/^(cadastrar|adicionar|incluir|publicar)\s+/i, "");

  return {
    titulo: titulo || "Material cadastrado pelo Wiz",
    tipo,
    turma: extractPromptField(prompt, ["turma", "classe"]) || "Todas",
    nivel: extractPromptField(prompt, ["nivel", "nível", "livro"]),
    categoria: extractPromptField(prompt, ["categoria"]),
    descricao: extractPromptField(prompt, ["descricao", "descrição", "observacao", "observação"]),
    url,
  };
}

async function answer(prompt: string, actor: string, session: WizSession): Promise<Row> {
  if (!prompt.trim() || isStopCommand(prompt)) {
    return { ok: true, message: randomOf(STOP_REPLIES) };
  }
  const support = supportAnswer(prompt);
  if (support) return { ok: true, message: support };
  const action = suggestFromPrompt(prompt);
  if (action === "record_teacher_class") return recordTeacherClass(prompt, actor);
  if (action === "send_bulk_message") {
    if (!canAdmin(session.perfil) && !lower(session.perfil).includes("comercial")) return { ok: false, message: "Sem permissao para envio em massa. Fale com um administrador." };
    return sendBulkMessage(communicationDataFromPrompt(prompt), actor, session);
  }
  if (action === "add_library_material") {
    if (!canAdmin(session.perfil) && !lower(session.perfil).includes("prof")) return { ok: false, message: "Sem permissao para cadastrar materiais na biblioteca. Fale com um administrador." };
    return addLibraryMaterial(libraryDataFromPrompt(prompt), actor);
  }
  if (action === "answer") {
    return { ok: true, message: humanFallback() };
  }

  const actionLabels: Record<string, string> = {
    create_homework: "Me passa o nome da turma, o conteúdo e quantas questões quer — já crio a tarefa!",
    create_work: "Me informa o título, turma e prazo do trabalho que eu já lanço.",
    create_student: "Me passa o nome completo, turma e o livro do aluno que eu cadastro agora.",
    create_financial: "Me informa o nome do aluno, o valor e quantas parcelas para eu lançar.",
    create_agenda: "Me diz o título, data e horário do evento para eu agendar.",
    reset_student_access: "Me informa o nome do aluno e eu atualizo o login e senha.",
    reset_teacher_access: "Me informa o nome do professor e eu atualizo o acesso dele.",
    answer_student: "Me passa o nome do aluno e a dúvida dele que eu respondo!",
    create_wall_post: "Me diz o título e o texto do comunicado — para qual turma vai?",
    send_bulk_message: "Me informa a mensagem e para quem enviar (todos, turma ou aluno específico).",
    add_library_material: "Me passa o título e o link do material que eu cadastro na biblioteca.",
    record_teacher_class: "Me informa a professora, a turma e a lição para eu registrar a aula.",
  };

  return {
    ok: true,
    message: actionLabels[action] ?? `Parece que você quer ${actionHumanLabel(action)}. Me manda os dados completos e já executo!`,
    suggested_action: action,
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const [logs, alunos, turmas, professores] = await Promise.all([
    dbList<Row>("wiz_action_audit.json"),
    dbList<Row>("students.json"),
    dbList<Row>("classes.json"),
    dbList<Row>("teachers.json"),
  ]);
  return NextResponse.json({ logs, alunos, turmas, professores });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canOperate(session.perfil)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }
  let body: Row = {};
  let action = "answer";
  let data: Row = {};
  let attachedFile: File | null = null;
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    action = text(form.get("action") || "add_library_material");
    attachedFile = form.get("arquivo_pdf") instanceof File ? form.get("arquivo_pdf") as File : null;
    data = {};
    for (const [key, value] of form.entries()) {
      if (value instanceof File) continue;
      data[key] = value;
    }
    const prompt = text(data.prompt);
    if (prompt) data = { ...libraryDataFromPrompt(prompt), ...data };
    if (!text(data.titulo) && attachedFile) data.titulo = attachedFile.name.replace(/\.pdf$/i, "");
  } else {
    body = await req.json() as Row;
    action = text(body.action || "answer");
    data = (body.data && typeof body.data === "object" ? body.data : body) as Row;
  }
  const actor = session.pessoa || session.usuario;

  let result: Row;
  if (action === "answer") result = await answer(text(data.prompt || body.prompt), actor, session);
  else if (action === "create_wall_post") result = await createWallPost(data, actor);
  else if (action === "create_homework") result = await createHomework(data, actor, session);
  else if (action === "create_work") result = await createWork(data, actor, session);
  else if (action === "add_library_material") result = canAdmin(session.perfil) || lower(session.perfil).includes("prof") ? await addLibraryMaterial(data, actor, attachedFile) : { ok: false, message: "Perfil sem permissao para cadastrar materiais na biblioteca." };
  else if (action === "create_student") result = canAdmin(session.perfil) || lower(session.perfil).includes("comercial") ? await createStudent(data) : { ok: false, message: "Perfil sem permissao para cadastrar aluno." };
  else if (action === "create_financial") result = canAdmin(session.perfil) || lower(session.perfil).includes("comercial") ? await createFinancial(data) : { ok: false, message: "Perfil sem permissao para financeiro." };
  else if (action === "create_agenda") result = await createAgenda(data, actor);
  else if (action === "prepare_message") result = await logMessage(data, actor);
  else if (action === "send_bulk_message") result = canAdmin(session.perfil) || lower(session.perfil).includes("comercial") ? await sendBulkMessage(data, actor, session) : { ok: false, message: "Perfil sem permissao para envio em massa." };
  else if (action === "reset_student_access") result = canAdmin(session.perfil) || lower(session.perfil).includes("comercial") ? await resetStudentAccess(data, actor, session) : { ok: false, message: "Perfil sem permissao para alterar acesso de aluno." };
  else if (action === "reset_teacher_access") result = canAdmin(session.perfil) ? await resetTeacherAccess(data, actor, session) : { ok: false, message: "Perfil sem permissao para alterar acesso de professor." };
  else if (action === "answer_student") result = await answerStudent(data, actor, session);
  else if (action === "record_teacher_class") result = canAdmin(session.perfil) ? await recordTeacherClass(text(data.prompt || body.prompt), actor) : { ok: false, message: "Perfil sem permissao para registrar aulas." };
  else result = { ok: false, message: "Acao do Wiz nao reconhecida." };

  await audit(action, data, result, actor, session.perfil);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
