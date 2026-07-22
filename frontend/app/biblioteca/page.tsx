import { AppShell } from "@/components/app-shell";
import { dbList } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BibliotecaClient } from "@/components/biblioteca-client";
import { workbookLibraryBooks } from "@/lib/workbook-lessons";

type Livro = { id?: string; titulo?: string; title?: string; autor?: string; author?: string; nivel?: string; nivel_livro?: string; turma?: string; categoria?: string; tipo?: string; url?: string; file_path?: string; status?: string; [k: string]: unknown };
type Video = { id?: string; titulo?: string; title?: string; turma?: string; url?: string; descricao?: string; [k: string]: unknown };

function normalizedTitle(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export default async function BibliotecaPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [livros, videos, materiais] = await Promise.all([
    dbList<Livro>("books.json"),
    dbList<Video>("videos.json"),
    dbList<Record<string, unknown>>("materials.json")
  ]);

  const workbooks = workbookLibraryBooks();
  const workbookByTitle = new Map(workbooks.map((book) => [normalizedTitle(book.titulo), book]));
  const livrosComFallback = livros.map((livro) => {
    const workbook = workbookByTitle.get(normalizedTitle(livro.titulo || livro.title));
    const url = String(livro.url || livro.file_path || "");
    return workbook && url.startsWith("/uploads/livros/")
      ? { ...livro, url: workbook.url, file_path: workbook.url, pdf_nome: livro.pdf_nome || workbook.pdf_nome }
      : livro;
  });
  const livrosComWorkbooks = [
    ...livrosComFallback,
    ...workbooks.filter((book) => !livrosComFallback.some((livro) =>
      String(livro.id) === book.id ||
      String(livro.url) === book.url ||
      normalizedTitle(livro.titulo || livro.title) === normalizedTitle(book.titulo)
    )),
  ];
  const categorias = [...new Set(livrosComWorkbooks.map((l) => String(l.categoria || l.tipo || l.nivel || "Geral")))];

  return (
    <AppShell breadcrumb="Material" userName={session.pessoa || session.usuario} userRole={session.perfil}>
      <div className="page-header">
        <div className="page-title-block">
          <div className="page-eyebrow"><span className="page-eyebrow-dot" />Recursos Pedagógicos</div>
          <h1 className="page-title">Material</h1>
          <p className="page-description">Livros didáticos, vídeos e materiais de apoio organizados por turma e nível.</p>
        </div>
      </div>

      <div className="metric-grid metric-grid-3">
        <div className="metric-card metric-card-blue">
          <div className="metric-icon metric-icon-blue">
            <svg viewBox="0 0 20 20" fill="currentColor"><path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" /></svg>
          </div>
          <div className="metric-label">Livros cadastrados</div>
          <div className="metric-value">{livrosComWorkbooks.length}</div>
          <div className="metric-note">{categorias.length} categorias diferentes</div>
        </div>
        <div className="metric-card metric-card-green">
          <div className="metric-icon metric-icon-green">
            <svg viewBox="0 0 20 20" fill="currentColor"><path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" /></svg>
          </div>
          <div className="metric-label">Vídeos</div>
          <div className="metric-value">{videos.length}</div>
          <div className="metric-note">Aulas e conteúdos em vídeo</div>
        </div>
        <div className="metric-card metric-card-gold">
          <div className="metric-icon metric-icon-gold">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" /></svg>
          </div>
          <div className="metric-label">Materiais</div>
          <div className="metric-value">{materiais.length}</div>
          <div className="metric-note">Apostilas e arquivos de apoio</div>
        </div>
      </div>

      <BibliotecaClient livros={livrosComWorkbooks} videos={videos} materiais={materiais} />
    </AppShell>
  );
}
