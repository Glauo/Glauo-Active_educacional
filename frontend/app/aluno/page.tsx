import { dbList, dbListWithoutKeys } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { StudentPortalClient } from "@/components/student-portal-client";
import { isHomeworkActivity, normalizeList, studentMatchesTarget, text, type Homework, type HomeworkSubmission, type WallPost } from "@/lib/school-modules";
import { hasWorkbookStudentTarget, releasedWorkbookLessons, studentWorkbookBook, workbookLibraryBooks } from "@/lib/workbook-lessons";
import { reconcileMercadoPagoPendingReceivables } from "@/lib/mercadopago-sync";
import { studentCanAccessLibraryItem } from "@/lib/library-access";
import { getSchoolClasses } from "@/lib/school-data";

type Aluno = { id?: string; nome?: string; name?: string; login?: string; turma?: string; classe?: string; livro?: string; book?: string; status?: string; [k: string]: unknown };
type Desafio = { id?: string; titulo?: string; title?: string; turma?: string; pontos?: number | string; status?: string; [k: string]: unknown };
type Conclusao = { desafio_id?: string; aluno?: string; pontos?: number | string; data?: string; [k: string]: unknown };
type Nota = { aluno?: string; aluno_login?: string; titulo?: string; desafio?: string; nota?: number | string; status?: string; data?: string; [k: string]: unknown };
type Recebimento = { id?: string; aluno?: string; nome?: string; aluno_login?: string; aluno_id?: string; descricao?: string; valor?: number | string; valor_parcela?: number | string; vencimento?: string; data_vencimento?: string; status?: string; [k: string]: unknown };
type BibliotecaItem = { id?: string; titulo?: string; title?: string; turma?: string; turmas?: string[]; aluno?: string; alunos?: string[]; nivel?: string; nivel_livro?: string; categoria?: string; tipo?: string; livro?: string; url?: string; file_path?: string; status?: string; [k: string]: unknown };

const HEAVY_KEYS = ["boleto_pdf_b64", "file_b64", "pdf_b64", "base64", "arquivo_b64", "foto_b64", "imagem_b64", "documento_b64", "anexo_b64"];

function lower(value: unknown) {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function sameStudentInvoice(row: Recebimento, aluno: Aluno | undefined, session: { usuario: string; pessoa: string }) {
  const possible = [
    row.aluno_login,
    row.aluno_id,
    row.aluno,
    row.nome,
  ].map(lower).filter(Boolean);
  const studentKeys = [
    session.usuario,
    session.pessoa,
    aluno?.id,
    aluno?.login,
    aluno?.nome,
    aluno?.name,
  ].map(lower).filter(Boolean);
  return possible.some((item) => studentKeys.includes(item));
}

function dueDateValue(value: unknown) {
  const raw = text(value);
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1])).getTime();
  const date = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
  return Number.isNaN(date.getTime()) ? Number.MAX_SAFE_INTEGER : date.getTime();
}

function matchesAgenda(row: Record<string, unknown>, aluno: Aluno | undefined, turma: string, session: { usuario: string; pessoa: string }) {
  const status = lower(row.status || row.situacao);
  if (status.includes("cancel") || status.includes("inativ") || status.includes("arquiv")) return false;

  const studentKeys = [
    session.usuario,
    session.pessoa,
    aluno?.id,
    aluno?.nome,
    aluno?.name,
    aluno?.login,
  ].map(lower).filter(Boolean);

  const targetStudent = text(row.aluno || row.aluno_nome || row.aluno_login || row.aluno_id || row.target_aluno);
  const targetStudents = normalizeList(row.alunos || row.alunos_especificos || row.target_alunos);
  if (targetStudent || targetStudents.length > 0) {
    return [targetStudent, ...targetStudents].map(lower).some((target) => studentKeys.includes(target));
  }

  const targetClasses = [
    text(row.turma || row.classe || row.target_turma),
    ...normalizeList(row.turmas || row.target_turmas || row.target_turmas_envio),
  ].map(lower).filter(Boolean);

  if (targetClasses.length === 0) return false;
  if (targetClasses.some((item) => ["todas", "todos", "escola toda", "todas as turmas"].includes(item))) return false;
  return targetClasses.includes(lower(turma));
}

function visibleChallenge(row: Desafio, session: NonNullable<Awaited<ReturnType<typeof getSession>>>, aluno?: Aluno) {
  const status = lower(row.status || "publicado");
  if (status.includes("rascunho") || status.includes("arquiv") || status.includes("inativ") || status.includes("cancel")) return false;
  return studentMatchesTarget(row, session, aluno);
}

function normalizedTitle(value: unknown) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export default async function AlunoHomePage() {
  const session = await getSession();
  if (!session) redirect("/aluno/login");
  if (!lower(session.perfil).includes("aluno")) redirect("/");

  await reconcileMercadoPagoPendingReceivables({ limit: 1, minIntervalMs: 120_000, lockMs: 60_000 });

  const [alunos, desafios, conclusoes, notas, frequencias, recebimentos, mensagens, atividades, entregas, agenda, livros, materiais, videos, turmas] = await Promise.all([
    dbListWithoutKeys<Aluno>("students.json", HEAVY_KEYS),
    dbList<Desafio>("challenges.json"),
    dbList<Conclusao>("challenge_completions.json"),
    dbList<Nota>("grades.json"),
    dbList<Record<string, unknown>>("attendance.json"),
    dbListWithoutKeys<Recebimento>("receivables.json", HEAVY_KEYS),
    dbList<WallPost>("messages.json"),
    dbList<Homework>("activities.json"),
    dbList<HomeworkSubmission>("activity_submissions.json"),
    dbList<Record<string, unknown>>("agenda.json"),
    dbListWithoutKeys<BibliotecaItem>("books.json", HEAVY_KEYS),
    dbListWithoutKeys<BibliotecaItem>("materials.json", HEAVY_KEYS),
    dbList<BibliotecaItem>("videos.json"),
    getSchoolClasses(),
  ]);

  const meuPerfil = alunos.find((a) => lower(a.login) === lower(session.usuario) || lower(a.nome || a.name) === lower(session.pessoa));
  const minhaTurma = text(meuPerfil?.turma || meuPerfil?.classe || session.unit);
  const sessionLite = { usuario: session.usuario, pessoa: session.pessoa || session.usuario, unit: session.unit };

  const muralPosts = mensagens
    .filter((post) => studentMatchesTarget(post, session, meuPerfil))
    .sort((a, b) => {
      if (Boolean(a.fixado) !== Boolean(b.fixado)) return Boolean(a.fixado) ? -1 : 1;
      return text(b.publicado_em || b.data).localeCompare(text(a.publicado_em || a.data));
    });

  const minhasEntregas = entregas.filter((entrega) => lower(entrega.aluno_login) === lower(session.usuario) || lower(entrega.aluno) === lower(session.pessoa));
  const licoesCadastradas = atividades
    .filter(isHomeworkActivity)
    .filter((atividade) => studentMatchesTarget(atividade, session, meuPerfil))
    .filter((atividade) => !lower(atividade.status).includes("rascunho"));
  const workbookBook = studentWorkbookBook(meuPerfil, session.unit);
  const licoesWorkbookCadastradas = licoesCadastradas
    .filter((atividade) => lower(atividade.origem).includes("workbook"))
    .filter((atividade) => !workbookBook || lower(atividade.livro).includes(`livro ${workbookBook}`));
  const licoesNaoWorkbook = licoesCadastradas.filter((atividade) => !lower(atividade.origem).includes("workbook"));
  const licoesWorkbookIndividuais = licoesWorkbookCadastradas.filter(hasWorkbookStudentTarget);
  const workbookBase = licoesWorkbookIndividuais.length > 0
    ? licoesWorkbookIndividuais
    : licoesWorkbookCadastradas;
  const workbookLicoes = releasedWorkbookLessons(workbookBase, minhasEntregas);
  const licoes = [...licoesNaoWorkbook, ...workbookLicoes];

  const minhasNotas = notas.filter((n) => lower(n.aluno) === lower(session.pessoa) || lower(n.aluno_login) === lower(session.usuario));
  const minhasFaturas = recebimentos
    .filter((r) => sameStudentInvoice(r, meuPerfil, sessionLite))
    .sort((a, b) => dueDateValue(a.vencimento || a.data_vencimento) - dueDateValue(b.vencimento || b.data_vencimento));
  const meusDesafios = desafios.filter((d) => visibleChallenge(d, session, meuPerfil));
  const minhasConclusoes = conclusoes.filter((c) => lower(c.aluno) === lower(session.usuario) || lower(c.aluno) === lower(session.pessoa));
  const minhasFaltas = frequencias.filter((f) => (lower(f.aluno) === lower(session.pessoa) || lower(f.aluno_id) === lower(meuPerfil?.id || session.usuario)) && Boolean(f.falta)).length;
  const minhaAgenda = agenda
    .filter((item) => matchesAgenda(item, meuPerfil, minhaTurma, sessionLite))
    .sort((a, b) => text(a.data || a.date).localeCompare(text(b.data || b.date)));
  const workbooks = workbookLibraryBooks();
  const workbookByTitle = new Map(workbooks.map((book) => [normalizedTitle(book.titulo), book]));
  const livrosComFallback = livros.map((livro) => {
    const workbook = workbookByTitle.get(normalizedTitle(livro.titulo || livro.title));
    const url = text(livro.url || livro.file_path);
    return workbook && url.startsWith("/uploads/livros/")
      ? { ...livro, url: workbook.url, file_path: workbook.url, pdf_nome: livro.pdf_nome || workbook.pdf_nome }
      : livro;
  });
  const livrosComWorkbooks = [
    ...livrosComFallback,
    ...workbooks.filter((book) => !livrosComFallback.some((livro) =>
      text(livro.id) === book.id ||
      text(livro.url) === book.url ||
      normalizedTitle(livro.titulo || livro.title) === normalizedTitle(book.titulo)
    )),
  ];
  const minhaBiblioteca = {
    livros: livrosComWorkbooks.filter((item) => studentCanAccessLibraryItem(item, session, meuPerfil, turmas)),
    materiais: materiais.filter((item) => studentCanAccessLibraryItem(item, session, meuPerfil, turmas)),
    videos: videos.filter((item) => studentCanAccessLibraryItem(item, session, meuPerfil, turmas)),
  };

  return (
    <StudentPortalClient
      session={sessionLite}
      perfil={meuPerfil || null}
      muralPosts={muralPosts}
      licoes={licoes}
      entregas={minhasEntregas}
      notas={minhasNotas}
      faturas={minhasFaturas}
      desafios={meusDesafios}
      conclusoes={minhasConclusoes}
      agenda={minhaAgenda}
      faltas={minhasFaltas}
      biblioteca={minhaBiblioteca}
    />
  );
}
