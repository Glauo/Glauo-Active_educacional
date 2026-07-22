import { dbList } from "./db";
import { libraryLevel } from "./library-access";
import { getSchoolClasses, type ClassRow } from "./school-data";
import { normalizeList, text } from "./school-modules";

type Row = Record<string, unknown>;

export type BookContentTarget = {
  livro: string;
  turma: string;
  turmas: string[];
  aluno: string;
  alunos: string[];
  referencia: string;
};

function normalized(value: unknown) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isAllClasses(value: unknown) {
  return ["", "todas", "todos", "escola toda", "todas as turmas"].includes(normalized(value));
}

function className(row: Row) {
  return text(row.nome || row.name || row.turma || row.classe);
}

function studentName(row: Row) {
  return text(row.login || row.usuario || row.nome || row.name);
}

function bookFromStudent(student: Row, classes: ClassRow[]) {
  const direct = libraryLevel(student.livro || student.book || student.nivel || student.nivel_livro);
  if (direct) return direct;
  const turma = normalized(student.turma || student.classe);
  const schoolClass = classes.find((item) => normalized(className(item)) === turma);
  return libraryLevel(schoolClass?.livro || schoolClass?.book || schoolClass?.nivel);
}

function contentReference(data: Row, classes: ClassRow[]) {
  const explicit = text(data.capitulo || data.licao || data.aula_referencia || data.habilidade || data.foco || data.conteudo);
  if (explicit) return explicit;
  const currentLesson = classes.map((item) => text(item.ultima_licao || item.licao_atual)).filter(Boolean);
  return [...new Set(currentLesson)].length === 1 ? currentLesson[0] : "";
}

export async function resolveBookContentTarget(data: Row): Promise<BookContentTarget> {
  const [allClasses, students] = await Promise.all([getSchoolClasses(), dbList<Row>("students.json")]);
  const requestedStudents = [...new Set([text(data.aluno), ...normalizeList(data.alunos)].filter(Boolean))];
  const requestedClasses = [...new Set([text(data.turma), ...normalizeList(data.turmas)].filter((item) => !isAllClasses(item)))];

  let selectedClasses: ClassRow[] = [];
  let selectedStudents: Row[] = [];
  if (requestedStudents.length > 0) {
    selectedStudents = requestedStudents.map((target) => students.find((student) => {
      const targetValue = normalized(target);
      return [student.login, student.usuario, student.nome, student.name].some((value) => normalized(value) === targetValue);
    })).filter((student): student is Row => Boolean(student));
    if (selectedStudents.length !== requestedStudents.length) throw new Error("Um ou mais alunos selecionados nao foram encontrados.");
  } else {
    if (requestedClasses.length === 0) throw new Error("Selecione uma turma ou aluno. Conteudo por livro nao pode ser publicado para todas as turmas.");
    selectedClasses = requestedClasses.map((target) => allClasses.find((schoolClass) => normalized(className(schoolClass)) === normalized(target))).filter((item): item is ClassRow => Boolean(item));
    if (selectedClasses.length !== requestedClasses.length) throw new Error("Uma ou mais turmas selecionadas nao foram encontradas.");
  }

  const levels = [...new Set(
    (selectedStudents.length > 0
      ? selectedStudents.map((student) => bookFromStudent(student, allClasses))
      : selectedClasses.map((schoolClass) => libraryLevel(schoolClass.livro || schoolClass.book || schoolClass.nivel))
    ).filter((level): level is string => Boolean(level))
  )];
  if (levels.length === 0) throw new Error("Cadastre o livro da turma ou do aluno antes de criar atividades com Prof Wiz.");
  if (levels.length !== 1) throw new Error("Selecione apenas alunos ou turmas do mesmo livro. Para niveis diferentes, crie uma atividade separada.");

  const requestedBook = libraryLevel(data.livro || data.book || data.nivel);
  if (requestedBook && requestedBook !== levels[0]) {
    throw new Error(`O conteudo informado e do Livro ${requestedBook}, mas o destinatario selecionado esta no Livro ${levels[0]}.`);
  }

  const reference = contentReference(data, selectedClasses);
  if (!reference) throw new Error("Informe a unidade, capitulo, licao ou topico estudado no livro antes de gerar a atividade.");

  const classTargets = selectedClasses.map(className);
  const studentTargets = selectedStudents.map(studentName);
  return {
    livro: `Livro ${levels[0]}`,
    turma: classTargets[0] || "",
    turmas: classTargets.slice(1),
    aluno: studentTargets.length === 1 ? studentTargets[0] : "",
    alunos: studentTargets.length > 1 ? studentTargets : [],
    referencia: reference,
  };
}
