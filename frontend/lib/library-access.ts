import type { SessionUser } from "./auth";
import { studentMatchesTarget } from "./school-modules";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return String(value || "").trim();
}

function normalized(value: unknown) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(",", ".");
}

export function libraryLevel(value: unknown): string | null {
  const raw = normalized(value);
  const match = raw.match(/(?:livro|book|nivel)?\s*([1-6](?:\.2)?)(?:\b|$)/);
  const level = match?.[1];
  return level && ["1", "1.2", "2", "3", "3.2", "4", "5", "6"].includes(level) ? level : null;
}

export function studentLibraryLevel(student?: Row | null, classes: Row[] = []) {
  const direct = libraryLevel(student?.livro || student?.book || student?.nivel || student?.nivel_livro);
  if (direct) return direct;

  const className = normalized(student?.turma || student?.classe);
  if (!className) return null;
  const schoolClass = classes.find((item) => normalized(item.nome || item.name || item.turma) === className);
  return libraryLevel(schoolClass?.livro || schoolClass?.book || schoolClass?.nivel || schoolClass?.nivel_livro);
}

export function libraryItemLevel(item: Row) {
  return libraryLevel(item.livro || item.book || item.nivel || item.nivel_livro || item.categoria || item.titulo || item.title);
}

export function studentCanAccessLibraryItem(item: Row, session: SessionUser, student?: Row | null, classes: Row[] = []) {
  const status = normalized(item.status || "ativo");
  if (status.includes("rascunho") || status.includes("arquiv") || status.includes("inativ") || status.includes("cancel")) return false;
  if (!studentMatchesTarget(item, session, student)) return false;

  const itemLevel = libraryItemLevel(item);
  if (!itemLevel) return true;
  return studentLibraryLevel(student, classes) === itemLevel;
}
