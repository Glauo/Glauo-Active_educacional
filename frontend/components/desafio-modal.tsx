"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { HomeworkQuestion } from "@/lib/school-modules";
import { ModalPortal } from "@/components/modal-portal";

type DesafioData = {
  id?: string;
  titulo?: string;
  title?: string;
  turma?: string;
  turmas?: string[] | string;
  aluno?: string;
  alunos?: string[] | string;
  descricao?: string;
  pontos?: number | string;
  tipo?: string;
  opcoes?: string[] | string;
  livro?: string;
  licao?: string;
  status?: string;
  questions?: Row[];
  [k: string]: unknown;
};

type Form = {
  titulo: string;
  turmas: string[];
  alunos: string[];
  descricao: string;
  livro: string;
  licao: string;
  status: string;
};

type Row = Record<string, unknown>;
type QuestionType = HomeworkQuestion["tipo"];

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: "aberta", label: "Pergunta direta" },
  { value: "multipla_escolha", label: "Multipla escolha" },
  { value: "verdadeiro_falso", label: "Verdadeiro/Falso" },
  { value: "upload", label: "Arquivo ou link" },
];

function text(value: unknown) {
  return String(value || "").trim();
}

function splitTargets(value: unknown) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(/[,\n;]/).map((item) => item.trim()).filter(Boolean);
}

function uniqueTargets(values: string[]) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function splitLines(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function rowName(row: Row) {
  return text(row.nome || row.name || row.nome_completo || row.aluno || row.aluno_nome || row.login || row.usuario);
}

function rowClass(row: Row) {
  return text(row.turma || row.classe || row.class);
}

function studentValue(row: Row) {
  return text(row.login || row.usuario || rowName(row));
}

function classNames(rows: Row[]) {
  return [...new Set(rows.map((row) => text(row.nome || row.name || row.turma || row.classe)).filter(Boolean))];
}

function toggleTarget(targets: string[], value: string) {
  return targets.includes(value) ? targets.filter((item) => item !== value) : [...targets, value];
}

function refreshKeepingScroll(refresh: () => void) {
  const scrollY = window.scrollY;
  refresh();
  requestAnimationFrame(() => window.scrollTo(0, scrollY));
  window.setTimeout(() => window.scrollTo(0, scrollY), 150);
}

function questionType(value: unknown): QuestionType {
  const raw = text(value).toLowerCase();
  if (raw.includes("multipla") || raw.includes("multipla_escolha") || raw.includes("assinal")) return "multipla_escolha";
  if (raw.includes("verdadeiro") || raw.includes("falso")) return "verdadeiro_falso";
  if (raw.includes("upload") || raw.includes("arquivo") || raw.includes("link")) return "upload";
  return "aberta";
}

function newQuestion(tipo: QuestionType = "aberta", pontos = 10): HomeworkQuestion {
  return {
    id: crypto.randomUUID(),
    tipo,
    enunciado: "",
    opcoes: tipo === "multipla_escolha" ? ["", ""] : [],
    pontos,
  };
}

function normalizeQuestion(question: Partial<HomeworkQuestion>, index: number): HomeworkQuestion {
  const tipo = questionType(question.tipo);
  return {
    id: text(question.id) || `desafio_q_${index + 1}_${crypto.randomUUID()}`,
    tipo,
    enunciado: text(question.enunciado),
    opcoes: tipo === "multipla_escolha" ? splitTargets(question.opcoes) : [],
    pontos: Number(question.pontos) || 1,
    feedback: text(question.feedback),
  };
}

function legacyQuestions(d?: DesafioData) {
  if (Array.isArray(d?.questions) && d.questions.length > 0) {
    return d.questions.map((question, index) => normalizeQuestion(question as Partial<HomeworkQuestion>, index));
  }

  if (text(d?.descricao) || splitTargets(d?.opcoes).length > 0) {
    const tipo = questionType(d?.tipo);
    return [{
      ...newQuestion(tipo, Number(d?.pontos) || 10),
      enunciado: text(d?.descricao) || "Questao do desafio",
      opcoes: tipo === "multipla_escolha" ? splitTargets(d?.opcoes) : [],
    }];
  }

  return [newQuestion()];
}

function selectedClasses(d?: DesafioData) {
  const primary = text(d?.turma);
  return uniqueTargets([
    ...(!primary || ["todas", "todos"].includes(primary.toLowerCase()) ? [] : [primary]),
    ...splitTargets(d?.turmas),
  ]);
}

function selectedStudents(d?: DesafioData) {
  return uniqueTargets([text(d?.aluno), ...splitTargets(d?.alunos)]);
}

function fromDesafio(d?: DesafioData): Form {
  return {
    titulo: text(d?.titulo || d?.title),
    turmas: selectedClasses(d),
    alunos: selectedStudents(d),
    descricao: Array.isArray(d?.questions) && d.questions.length > 0 ? text(d?.descricao) : "",
    livro: text(d?.livro),
    licao: text(d?.licao),
    status: text(d?.status) || "Publicado",
  };
}

function questionLabel(tipo: QuestionType) {
  return QUESTION_TYPES.find((item) => item.value === tipo)?.label || "Pergunta direta";
}

function DesafioModal({
  desafio,
  turmas = [],
  alunos = [],
  onClose,
  onSaved,
}: {
  desafio?: DesafioData;
  turmas?: Row[];
  alunos?: Row[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(desafio?.id);
  const [form, setForm] = useState<Form>(fromDesafio(desafio));
  const [questions, setQuestions] = useState<HomeworkQuestion[]>(legacyQuestions(desafio));
  const [studentSearch, setStudentSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const nomesTurmas = classNames(turmas);
  const students = useMemo(() => alunos
    .map((aluno, index) => ({
      id: text(aluno.id || aluno.login || aluno.usuario || index),
      value: studentValue(aluno),
      name: rowName(aluno),
      turma: rowClass(aluno),
    }))
    .filter((aluno) => aluno.value && aluno.name)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [alunos]);
  const visibleStudents = useMemo(() => {
    const query = studentSearch.toLowerCase().trim();
    if (!query) return students;
    return students.filter((aluno) => `${aluno.name} ${aluno.turma} ${aluno.value}`.toLowerCase().includes(query));
  }, [studentSearch, students]);
  const pointsTotal = questions.reduce((sum, question) => sum + (Number(question.pontos) || 0), 0);

  function update(field: keyof Form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErro("");
  }

  function toggleTurma(turma: string) {
    setForm((prev) => ({ ...prev, turmas: toggleTarget(prev.turmas, turma) }));
    setErro("");
  }

  function toggleAluno(aluno: string) {
    setForm((prev) => ({ ...prev, alunos: toggleTarget(prev.alunos, aluno) }));
    setErro("");
  }

  function updateQuestion(index: number, patch: Partial<HomeworkQuestion>) {
    setQuestions((prev) => prev.map((question, position) => position === index ? { ...question, ...patch } : question));
    setErro("");
  }

  function updateQuestionType(index: number, tipo: QuestionType) {
    setQuestions((prev) => prev.map((question, position) => position === index ? {
      ...question,
      tipo,
      opcoes: tipo === "multipla_escolha" && !(question.opcoes || []).length ? ["", ""] : question.opcoes,
    } : question));
    setErro("");
  }

  function addQuestion(tipo: QuestionType = "aberta") {
    setQuestions((prev) => [...prev, newQuestion(tipo, prev.length === 0 ? 10 : 1)]);
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => prev.length === 1 ? prev : prev.filter((_, position) => position !== index));
  }

  function gerarComWiz() {
    const livro = form.livro || "livro da turma";
    const licao = form.licao || "licao atual";
    setForm((prev) => ({
      ...prev,
      titulo: prev.titulo || `Desafio Wiz - ${livro} - ${licao}`,
      descricao: prev.descricao || `Responda com base no ${livro}, ${licao}.`,
    }));
    setQuestions((prev) => prev.some((question) => text(question.enunciado)) ? prev : [
      {
        ...newQuestion("aberta", 5),
        enunciado: `Explique o ponto principal estudado em ${licao}.`,
      },
      {
        ...newQuestion("multipla_escolha", 5),
        enunciado: `Escolha a alternativa correta sobre ${livro}.`,
        opcoes: ["Alternativa A", "Alternativa B", "Alternativa C", "Alternativa D"],
      },
    ]);
  }

  async function excluir() {
    if (!confirm(`Excluir o desafio "${text(desafio?.titulo || desafio?.title)}"? Esta acao nao pode ser desfeita.`)) return;
    setSaving(true);
    await fetch(`/api/desafios?id=${desafio!.id}`, { method: "DELETE" });
    setSaving(false);
    onSaved();
  }

  async function salvar() {
    if (!form.titulo.trim()) {
      setErro("O titulo e obrigatorio.");
      return;
    }
    if (!form.licao.trim()) {
      setErro("Informe a licao, unidade ou referencia do livro.");
      return;
    }
    if (questions.some((question) => !text(question.enunciado))) {
      setErro("Preencha o enunciado de todas as questoes.");
      return;
    }
    if (questions.some((question) => Number(question.pontos) <= 0)) {
      setErro("Cada questao precisa ter pontos maiores que zero.");
      return;
    }
    if (questions.some((question) => question.tipo === "multipla_escolha" && splitTargets(question.opcoes).length < 2)) {
      setErro("Questoes de multipla escolha precisam de ao menos duas alternativas.");
      return;
    }

    setSaving(true);
    const targetStudents = uniqueTargets(form.alunos);
    const targetClasses = targetStudents.length > 0 ? [] : uniqueTargets(form.turmas);
    const normalizedQuestions = questions.map((question, index) => normalizeQuestion({
      ...question,
      opcoes: question.tipo === "multipla_escolha" ? splitTargets(question.opcoes) : [],
    }, index));
    const firstQuestion = normalizedQuestions[0];
    const payload = {
      ...(isEdit ? { id: desafio!.id } : {}),
      ...form,
      turma: targetClasses[0] || "Todas",
      turmas: targetClasses.slice(1),
      aluno: targetStudents.length === 1 ? targetStudents[0] : "",
      alunos: targetStudents.length > 1 ? targetStudents : [],
      tipo: normalizedQuestions.every((question) => question.tipo === firstQuestion.tipo) ? questionLabel(firstQuestion.tipo) : "Misto",
      opcoes: firstQuestion.opcoes || [],
      pontos: normalizedQuestions.reduce((sum, question) => sum + (Number(question.pontos) || 0), 0),
      questions: normalizedQuestions,
    };
    const res = await fetch("/api/desafios", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErro(text((data as { error?: string }).error) || "Erro ao salvar.");
      return;
    }
    onSaved();
  }

  return (
    <ModalPortal>
    <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 1040 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{isEdit ? "Editar desafio" : "Novo desafio"}</div>
            <div className="modal-subtitle">Destinatarios e questoes usam os cadastros do sistema</div>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
          </button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-group form-group-span2">
              <label className="form-label">Titulo do desafio *</label>
              <input className="form-input" placeholder="Ex: Revise a licao e responda" value={form.titulo} onChange={(event) => update("titulo", event.target.value)} autoFocus />
            </div>
            <div className="form-group"><label className="form-label">Livro</label><input className="form-input" placeholder="Definido pela turma/aluno" value={form.livro} onChange={(event) => update("livro", event.target.value)} /><div className="form-help">O sistema confere o livro do destinatario antes de publicar.</div></div>
            <div className="form-group"><label className="form-label">Licao / referencia *</label><input className="form-input" placeholder="Ex: Unidade 4 - pagina 36" value={form.licao} onChange={(event) => update("licao", event.target.value)} /></div>
            <div className="form-group form-group-span2"><label className="form-label">Instrucoes gerais</label><textarea className="form-input form-textarea" rows={3} placeholder="Explique o objetivo e o que o aluno deve entregar." value={form.descricao} onChange={(event) => update("descricao", event.target.value)} /></div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-header">
              <div>
                <div className="section-eyebrow">Envio</div>
                <h3 className="section-title">Turmas e alunos</h3>
              </div>
              <span className="badge badge-info">{form.alunos.length ? `${form.alunos.length} aluno(s)` : form.turmas.length ? `${form.turmas.length} turma(s)` : "Selecione destinatarios"}</span>
            </div>
            <div className="card-body">
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Turmas cadastradas</label>
                  <div style={{ display: "grid", gap: 8, maxHeight: 220, overflow: "auto" }}>
                    {nomesTurmas.length ? nomesTurmas.map((turma) => (
                      <label className="attendance-item" key={turma}>
                        <input type="checkbox" checked={form.turmas.includes(turma)} onChange={() => toggleTurma(turma)} disabled={form.alunos.length > 0} />
                        {turma}
                      </label>
                    )) : <div className="form-help">Nenhuma turma cadastrada disponivel.</div>}
                  </div>
                  <div className="form-help">Selecione turmas do mesmo livro. Para niveis diferentes, crie desafios separados.</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Alunos cadastrados</label>
                  <input className="form-input" value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="Buscar aluno ou turma" />
                  <div style={{ display: "grid", gap: 8, maxHeight: 220, overflow: "auto", marginTop: 8 }}>
                    {visibleStudents.length ? visibleStudents.map((aluno) => (
                      <label className="attendance-item" key={aluno.id || aluno.value}>
                        <input type="checkbox" checked={form.alunos.includes(aluno.value)} onChange={() => toggleAluno(aluno.value)} />
                        <span>{aluno.name}{aluno.turma ? ` - ${aluno.turma}` : ""}</span>
                      </label>
                    )) : <div className="form-help">Nenhum aluno encontrado.</div>}
                  </div>
                  <div className="form-help">Ao marcar alunos, o envio fica restrito aos alunos selecionados.</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-header">
              <div>
                <div className="section-eyebrow">Questoes</div>
                <h3 className="section-title">Janela do desafio</h3>
              </div>
              <span className="badge badge-gold">{questions.length} questao(oes) | {pointsTotal} pts</span>
            </div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {questions.map((question, index) => (
                <div className="card" key={question.id}>
                  <div className="card-body">
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label">Formato da questao</label>
                        <select className="form-input" value={question.tipo} onChange={(event) => updateQuestionType(index, event.target.value as QuestionType)}>
                          {QUESTION_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Pontos</label>
                        <input className="form-input" type="number" min="0.1" step="0.1" value={question.pontos} onChange={(event) => updateQuestion(index, { pontos: Number(event.target.value) })} />
                      </div>
                      <div className="form-group form-group-span2">
                        <label className="form-label">Questao {index + 1}</label>
                        <textarea className="form-input form-textarea" rows={3} value={question.enunciado} onChange={(event) => updateQuestion(index, { enunciado: event.target.value })} placeholder="Digite o enunciado que aparecera para o aluno." />
                      </div>
                      {question.tipo === "multipla_escolha" && (
                        <div className="form-group form-group-span2">
                          <label className="form-label">Alternativas</label>
                          <textarea className="form-input form-textarea" rows={4} value={(question.opcoes || []).join("\n")} onChange={(event) => updateQuestion(index, { opcoes: splitLines(event.target.value) })} placeholder="Uma alternativa por linha" />
                        </div>
                      )}
                      {question.tipo === "verdadeiro_falso" && <div className="form-group form-group-span2"><div className="form-help">O aluno vera as opcoes Verdadeiro e Falso.</div></div>}
                      {question.tipo === "upload" && <div className="form-group form-group-span2"><div className="form-help">Use esse formato quando a entrega for um arquivo, link ou evidencia descrita pelo aluno.</div></div>}
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => removeQuestion(index)} disabled={questions.length === 1}>Remover questao</button>
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => addQuestion("aberta")}>Adicionar pergunta</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => addQuestion("multipla_escolha")}>Adicionar multipla escolha</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => addQuestion("verdadeiro_falso")}>Adicionar V/F</button>
              </div>
            </div>
          </div>

          <div className="form-grid" style={{ marginTop: 16 }}>
            <div className="form-group"><label className="form-label">Status</label><select className="form-input" value={form.status} onChange={(event) => update("status", event.target.value)}><option>Publicado</option><option>Rascunho</option><option>Arquivado</option></select></div>
          </div>
          {erro && <div className="form-error">{erro}</div>}
        </div>
        <div className="modal-footer">
          {isEdit && <button type="button" className="btn btn-danger btn-sm" onClick={excluir} disabled={saving} style={{ marginRight: "auto" }}>Excluir</button>}
          <button type="button" className="btn btn-secondary" onClick={gerarComWiz} disabled={saving}>Wiz criar base</button>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={salvar} disabled={saving}>{saving ? "Salvando..." : isEdit ? "Salvar alteracoes" : "Publicar desafio"}</button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}

export function NovoDesafioBtn({ turmas, alunos }: { turmas: Row[]; alunos: Row[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
        Novo desafio
      </button>
      {open && <DesafioModal turmas={turmas} alunos={alunos} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); refreshKeepingScroll(() => router.refresh()); }} />}
    </>
  );
}

export function EditarDesafioBtn({ desafio, turmas, alunos }: { desafio: DesafioData; turmas?: Row[]; alunos?: Row[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: "0.75rem" }} onClick={() => setOpen(true)}>Editar</button>
      {open && <DesafioModal desafio={desafio} turmas={turmas} alunos={alunos} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); refreshKeepingScroll(() => router.refresh()); }} />}
    </>
  );
}
