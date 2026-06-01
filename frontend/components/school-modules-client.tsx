"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Homework, HomeworkQuestion, HomeworkSubmission, WallPost } from "@/lib/school-modules";
import { ModalPortal } from "@/components/modal-portal";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return String(value || "").trim();
}

function splitLines(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function rowName(row: Row) {
  return text(row.nome || row.name || row.titulo || row.title || row.login);
}

function rowClass(row: Row) {
  return text(row.turma || row.classe || row.class);
}

function uniqueClassNames(rows: Row[]) {
  return [...new Set(rows.map((row) => text(row.nome || row.name || row.turma || row.classe)).filter(Boolean))];
}

function toggleList(list: string[], value: string) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function refreshKeepingScroll(refresh: () => void) {
  const scrollY = window.scrollY;
  refresh();
  requestAnimationFrame(() => window.scrollTo(0, scrollY));
  window.setTimeout(() => window.scrollTo(0, scrollY), 150);
}

function closeIcon() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>;
}

const MURAL_TYPES = ["Aviso Geral", "Comunicado Importante", "Evento", "Informacao Pedagogica", "Conquista / Reconhecimento", "Urgente"];

function muralWizTemplate(tipo: string) {
  const templates: Record<string, { titulo: string; mensagem: string }> = {
    "Aviso Geral": {
      titulo: "Comunicado geral",
      mensagem: "Ola, familias e alunos!\n\nCompartilhamos este comunicado para manter todos informados sobre a rotina da escola.\n\nPedimos que leiam com atencao e, em caso de duvida, entrem em contato com a secretaria.\n\nAtenciosamente,\nEquipe Active Educacional",
    },
    "Comunicado Importante": {
      titulo: "Comunicado importante",
      mensagem: "Ola, familias e alunos!\n\nTemos uma informacao importante para compartilhar. Pedimos que leiam este comunicado com atencao e acompanhem as orientacoes descritas.\n\nA colaboracao de todos ajuda a manter nossa rotina organizada e segura.\n\nAtenciosamente,\nEquipe Active Educacional",
    },
    Evento: {
      titulo: "Convite para evento",
      mensagem: "Ola, familias e alunos!\n\nPreparamos um evento especial e contamos com a participacao de todos.\n\nEm breve compartilharemos os detalhes de horario, local e orientacoes. Sua presenca sera muito bem-vinda.\n\nAtenciosamente,\nEquipe Active Educacional",
    },
    "Informacao Pedagogica": {
      titulo: "Informacao pedagogica",
      mensagem: "Ola, familias e alunos!\n\nCompartilhamos uma orientacao pedagogica importante para apoiar o desenvolvimento dos estudantes.\n\nAcompanhar as atividades, revisoes e feedbacks faz parte do processo de evolucao e fortalece os resultados.\n\nAtenciosamente,\nEquipe pedagogica",
    },
    "Conquista / Reconhecimento": {
      titulo: "Reconhecimento especial",
      mensagem: "Ola, familias e alunos!\n\nTemos uma conquista especial para celebrar. Reconhecemos o esforco, a participacao e a evolucao dos nossos estudantes.\n\nParabens a todos os envolvidos. Seguimos juntos construindo grandes resultados.\n\nAtenciosamente,\nEquipe Active Educacional",
    },
    Urgente: {
      titulo: "Comunicado urgente",
      mensagem: "Ola, familias e alunos!\n\nEste comunicado exige atencao imediata.\n\nPedimos que leiam as orientacoes abaixo e acompanhem as atualizacoes pelo portal. Em caso de duvida, falem com a secretaria.\n\nAtenciosamente,\nEquipe Active Educacional",
    },
  };
  return templates[tipo] || templates["Aviso Geral"];
}

function toStringList(value: unknown) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : splitLines(text(value));
}

export function MuralCreateButton({ canPin, turmas = [] }: { canPin: boolean; turmas?: Row[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const turmaOptions = useMemo(() => uniqueClassNames(turmas), [turmas]);
  const [form, setForm] = useState({
    titulo: "",
    tipo_post: "Aviso Geral",
    mensagem: "",
    turma: "Todas",
    turmas: [] as string[],
    aluno: "",
    publicar_em: "",
    expira_em: "",
    anexos: "",
    capa_url: "",
    fixado: false,
    requer_confirmacao: false,
    enquete: "",
  });

  function update(field: keyof typeof form, value: string | boolean | string[]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErro("");
  }

  function aplicarWiz() {
    const template = muralWizTemplate(form.tipo_post);
    setForm((prev) => ({
      ...prev,
      titulo: prev.titulo.trim() ? prev.titulo : template.titulo,
      mensagem: template.mensagem,
      requer_confirmacao: prev.tipo_post === "Urgente" ? true : prev.requer_confirmacao,
      fixado: canPin && prev.tipo_post === "Urgente" ? true : prev.fixado,
    }));
    setErro("");
  }

  async function salvar() {
    if (!form.titulo.trim() || !form.mensagem.trim()) {
      setErro("Titulo e conteudo sao obrigatorios.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/mural", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        turmas: form.turmas,
        anexos: splitLines(form.anexos),
        enquete_opcoes: splitLines(form.enquete).slice(0, 4),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErro(text((data as { error?: string }).error) || "Erro ao publicar.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
        Novo comunicado
      </button>
      {open && (
        <div className="modal-overlay" onClick={(event) => event.currentTarget === event.target && setOpen(false)}>
          <div className="modal-box">
            <div className="modal-header">
              <div>
                <div className="modal-title">Publicar no mural</div>
                <div className="modal-subtitle">Feed institucional para alunos e responsaveis</div>
              </div>
              <button className="modal-close" onClick={() => setOpen(false)}>{closeIcon()}</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group form-group-span2"><label className="form-label">Titulo *</label><input className="form-input" maxLength={100} value={form.titulo} onChange={(e) => update("titulo", e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Tipo</label><select className="form-input" value={form.tipo_post} onChange={(e) => update("tipo_post", e.target.value)}>{MURAL_TYPES.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}</select></div>
                <div className="form-group">
                  <label className="form-label">Turma principal</label>
                  <select className="form-input" value={form.turma} onChange={(e) => update("turma", e.target.value)}>
                    <option value="Todas">Todas as turmas</option>
                    {turmaOptions.map((turma) => <option key={turma} value={turma}>{turma}</option>)}
                  </select>
                </div>
                <div className="form-group form-group-span2" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={aplicarWiz}>Wiz mensagem pronta</button>
                  <div className="form-help">Gera um texto base conforme o tipo escolhido. Voce pode revisar antes de publicar.</div>
                </div>
                <div className="form-group form-group-span2"><label className="form-label">Conteudo *</label><textarea className="form-input form-textarea" rows={5} value={form.mensagem} onChange={(e) => update("mensagem", e.target.value)} placeholder="Escreva o comunicado com clareza..." /></div>
                <div className="form-group">
                  <label className="form-label">Turmas adicionais</label>
                  <select
                    className="form-input form-textarea"
                    multiple
                    value={form.turmas}
                    onChange={(e) => update("turmas", Array.from(e.target.selectedOptions).map((option) => option.value))}
                    style={{ minHeight: 92 }}
                  >
                    {turmaOptions.map((turma) => <option key={turma} value={turma}>{turma}</option>)}
                  </select>
                  <div className="form-help">Use Ctrl para selecionar mais de uma turma.</div>
                </div>
                <div className="form-group"><label className="form-label">Aluno especifico</label><input className="form-input" value={form.aluno} onChange={(e) => update("aluno", e.target.value)} placeholder="Opcional" /></div>
                <div className="form-group"><label className="form-label">Publicar em</label><input className="form-input" type="datetime-local" value={form.publicar_em} onChange={(e) => update("publicar_em", e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Expira em</label><input className="form-input" type="datetime-local" value={form.expira_em} onChange={(e) => update("expira_em", e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Anexos / links</label><textarea className="form-input form-textarea" rows={3} value={form.anexos} onChange={(e) => update("anexos", e.target.value)} placeholder="Um link por linha" /></div>
                <div className="form-group"><label className="form-label">Imagem de capa</label><input className="form-input" value={form.capa_url} onChange={(e) => update("capa_url", e.target.value)} placeholder="URL da imagem" /></div>
                <div className="form-group"><label className="form-label">Enquete</label><textarea className="form-input form-textarea" rows={3} value={form.enquete} onChange={(e) => update("enquete", e.target.value)} placeholder="Ate 4 opcoes, uma por linha" /></div>
                <div className="form-group">
                  <label className="form-label">Regras</label>
                  <label className="attendance-item"><input type="checkbox" checked={form.requer_confirmacao} onChange={(e) => update("requer_confirmacao", e.target.checked)} /> Confirmacao de leitura</label>
                  {canPin && <label className="attendance-item" style={{ marginTop: 8 }}><input type="checkbox" checked={form.fixado} onChange={(e) => update("fixado", e.target.checked)} /> Fixar no topo</label>}
                </div>
              </div>
              {erro && <div className="form-error">{erro}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" disabled={saving} onClick={() => setOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" disabled={saving} onClick={salvar}>{saving ? "Publicando..." : "Publicar"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function MuralPostActions({ post, canPin, turmas = [] }: { post: WallPost; canPin: boolean; turmas?: Row[] }) {
  const router = useRouter();
  const turmaOptions = useMemo(() => uniqueClassNames(turmas), [turmas]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState({
    titulo: text(post.titulo),
    tipo_post: text(post.tipo_post || "Aviso Geral"),
    mensagem: text(post.mensagem),
    turma: text(post.turma || "Todas") || "Todas",
    turmas: toStringList(post.turmas),
    aluno: text(post.aluno),
    publicar_em: text(post.publicar_em),
    expira_em: text(post.expira_em),
    anexos: toStringList(post.anexos).join("\n"),
    capa_url: text(post.capa_url),
    fixado: Boolean(post.fixado),
    requer_confirmacao: Boolean(post.requer_confirmacao),
    enquete: toStringList(post.enquete_opcoes).join("\n"),
  });

  function update(field: keyof typeof form, value: string | boolean | string[]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErro("");
  }

  function aplicarWiz() {
    const template = muralWizTemplate(form.tipo_post);
    setForm((prev) => ({
      ...prev,
      titulo: prev.titulo.trim() ? prev.titulo : template.titulo,
      mensagem: template.mensagem,
      requer_confirmacao: prev.tipo_post === "Urgente" ? true : prev.requer_confirmacao,
      fixado: canPin && prev.tipo_post === "Urgente" ? true : prev.fixado,
    }));
    setErro("");
  }

  async function salvar() {
    if (!text(form.titulo) || !text(form.mensagem)) {
      setErro("Titulo e conteudo sao obrigatorios.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/mural", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        id: post.id,
        turmas: form.turmas,
        anexos: splitLines(form.anexos),
        enquete_opcoes: splitLines(form.enquete).slice(0, 4),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErro(text((data as { error?: string }).error) || "Erro ao editar comunicado.");
      return;
    }
    setOpen(false);
    refreshKeepingScroll(() => router.refresh());
  }

  async function excluir() {
    if (!confirm(`Excluir o comunicado "${text(post.titulo || "sem titulo")}"?`)) return;
    setSaving(true);
    const res = await fetch(`/api/mural?id=${encodeURIComponent(text(post.id))}`, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErro(text((data as { error?: string }).error) || "Erro ao excluir comunicado.");
      return;
    }
    refreshKeepingScroll(() => router.refresh());
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)} disabled={saving}>Editar</button>
        <button type="button" className="btn btn-danger btn-sm" onClick={excluir} disabled={saving}>Excluir</button>
      </div>
      {erro && !open && <div className="form-error" style={{ marginTop: 8 }}>{erro}</div>}
      {open && (
        <ModalPortal>
          <div className="modal-overlay" onClick={(event) => event.currentTarget === event.target && setOpen(false)}>
            <div className="modal-box">
              <div className="modal-header">
                <div>
                  <div className="modal-title">Editar comunicado</div>
                  <div className="modal-subtitle">Ajuste o conteudo, destino e regras do mural</div>
                </div>
                <button type="button" className="modal-close" onClick={() => setOpen(false)}>{closeIcon()}</button>
              </div>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group form-group-span2"><label className="form-label">Titulo *</label><input className="form-input" maxLength={100} value={form.titulo} onChange={(e) => update("titulo", e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Tipo</label><select className="form-input" value={form.tipo_post} onChange={(e) => update("tipo_post", e.target.value)}>{MURAL_TYPES.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}</select></div>
                  <div className="form-group">
                    <label className="form-label">Turma principal</label>
                    <select className="form-input" value={form.turma} onChange={(e) => update("turma", e.target.value)}>
                      <option value="Todas">Todas as turmas</option>
                      {turmaOptions.map((turma) => <option key={turma} value={turma}>{turma}</option>)}
                    </select>
                  </div>
                  <div className="form-group form-group-span2" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={aplicarWiz}>Wiz mensagem pronta</button>
                    <div className="form-help">Substitui o texto por um modelo pronto do tipo selecionado.</div>
                  </div>
                  <div className="form-group form-group-span2"><label className="form-label">Conteudo *</label><textarea className="form-input form-textarea" rows={5} value={form.mensagem} onChange={(e) => update("mensagem", e.target.value)} /></div>
                  <div className="form-group">
                    <label className="form-label">Turmas adicionais</label>
                    <select className="form-input form-textarea" multiple value={form.turmas} onChange={(e) => update("turmas", Array.from(e.target.selectedOptions).map((option) => option.value))} style={{ minHeight: 92 }}>
                      {turmaOptions.map((turma) => <option key={turma} value={turma}>{turma}</option>)}
                    </select>
                    <div className="form-help">Use Ctrl para selecionar mais de uma turma.</div>
                  </div>
                  <div className="form-group"><label className="form-label">Aluno especifico</label><input className="form-input" value={form.aluno} onChange={(e) => update("aluno", e.target.value)} placeholder="Opcional" /></div>
                  <div className="form-group"><label className="form-label">Publicar em</label><input className="form-input" type="datetime-local" value={form.publicar_em} onChange={(e) => update("publicar_em", e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Expira em</label><input className="form-input" type="datetime-local" value={form.expira_em} onChange={(e) => update("expira_em", e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Anexos / links</label><textarea className="form-input form-textarea" rows={3} value={form.anexos} onChange={(e) => update("anexos", e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Imagem de capa</label><input className="form-input" value={form.capa_url} onChange={(e) => update("capa_url", e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Enquete</label><textarea className="form-input form-textarea" rows={3} value={form.enquete} onChange={(e) => update("enquete", e.target.value)} placeholder="Ate 4 opcoes, uma por linha" /></div>
                  <div className="form-group">
                    <label className="form-label">Regras</label>
                    <label className="attendance-item"><input type="checkbox" checked={form.requer_confirmacao} onChange={(e) => update("requer_confirmacao", e.target.checked)} /> Confirmacao de leitura</label>
                    {canPin && <label className="attendance-item" style={{ marginTop: 8 }}><input type="checkbox" checked={form.fixado} onChange={(e) => update("fixado", e.target.checked)} /> Fixar no topo</label>}
                  </div>
                </div>
                {erro && <div className="form-error">{erro}</div>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-danger btn-sm" disabled={saving} onClick={excluir} style={{ marginRight: "auto" }}>Excluir comunicado</button>
                <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setOpen(false)}>Cancelar</button>
                <button type="button" className="btn btn-primary" disabled={saving} onClick={salvar}>{saving ? "Salvando..." : "Salvar alteracoes"}</button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}

export function MuralConfirmButton({ post, compact = false }: { post: WallPost; compact?: boolean }) {
  const router = useRouter();
  const [opcao, setOpcao] = useState("");
  const [saving, setSaving] = useState(false);
  const opcoes = Array.isArray(post.enquete_opcoes) ? post.enquete_opcoes : [];

  async function confirmar() {
    setSaving(true);
    await fetch("/api/mural/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: post.id, opcao }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {opcoes.length > 0 && (
        <select className="form-input" style={{ width: compact ? 160 : 240, height: 36 }} value={opcao} onChange={(e) => setOpcao(e.target.value)}>
          <option value="">Votar na enquete</option>
          {opcoes.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      )}
      <button className="btn btn-secondary btn-sm" onClick={confirmar} disabled={saving || (opcoes.length > 0 && !opcao && !post.requer_confirmacao)}>
        {saving ? "Registrando..." : post.requer_confirmacao ? "Li e entendi" : "Registrar"}
      </button>
    </div>
  );
}

export function HomeworkCreateButton({ turmas, alunos }: { turmas: Row[]; alunos: Row[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState({
    titulo: "",
    disciplina: "",
    turma: "Todas",
    turmas: [] as string[],
    aluno: "",
    due_date: "",
    livro: "",
    capitulo: "",
    aula_referencia: "",
    habilidade: "",
    descricao: "",
    peso: "10",
    allow_resubmission: false,
    quantidade: "5",
    dificuldade: "Medio",
    foco: "",
  });
  const [questions, setQuestions] = useState<HomeworkQuestion[]>([{
    id: crypto.randomUUID(),
    tipo: "aberta",
    enunciado: "",
    pontos: 10,
  }]);

  function update(field: keyof typeof form, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErro("");
  }

  function toggleTurma(turma: string) {
    setForm((prev) => ({ ...prev, turmas: toggleList(prev.turmas, turma) }));
    setErro("");
  }

  function updateQuestion(index: number, patch: Partial<HomeworkQuestion>) {
    setQuestions((prev) => prev.map((question, i) => i === index ? { ...question, ...patch } : question));
  }

  async function gerarWiz() {
    setSaving(true);
    const res = await fetch("/api/licoes/wiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setErro(text(data.error) || "Erro ao gerar com Prof Wiz.");
      return;
    }
    setForm((prev) => ({ ...prev, titulo: text(data.titulo) || prev.titulo, descricao: text(data.descricao) || prev.descricao }));
    setQuestions(Array.isArray(data.questions) ? data.questions : questions);
  }

  async function salvar(status: "Ativa" | "Rascunho") {
    if (!form.titulo.trim()) {
      setErro("Titulo da licao e obrigatorio.");
      return;
    }
    setSaving(true);
    const turmasMarcadas = form.turmas.filter((turma) => turma !== form.turma);
    const usarMarcadas = form.turma === "Todas" && turmasMarcadas.length > 0;
    const payload = {
      ...form,
      turma: usarMarcadas ? turmasMarcadas[0] : form.turma,
      turmas: usarMarcadas ? turmasMarcadas.slice(1) : turmasMarcadas,
      status,
      peso: Number(form.peso) || 10,
      questions: questions.map((question) => ({
        ...question,
        enunciado: text(question.enunciado) || "Questao sem enunciado",
        opcoes: Array.isArray(question.opcoes) ? question.opcoes : [],
        pontos: Number(question.pontos) || 1,
      })),
    };
    const res = await fetch("/api/licoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErro(text(data.error) || "Erro ao salvar licao.");
      return;
    }
    setOpen(false);
    refreshKeepingScroll(() => router.refresh());
  }

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
        Nova licao
      </button>
      {open && (
        <ModalPortal>
        <div className="modal-overlay" onClick={(event) => event.currentTarget === event.target && setOpen(false)}>
          <div className="modal-box" style={{ maxWidth: 980 }}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Nova licao de casa</div>
                <div className="modal-subtitle">Crie manualmente ou gere uma base revisavel com Prof Wiz</div>
              </div>
              <button type="button" className="modal-close" onClick={() => setOpen(false)}>{closeIcon()}</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group form-group-span2"><label className="form-label">Titulo *</label><input className="form-input" value={form.titulo} onChange={(e) => update("titulo", e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Disciplina</label><input className="form-input" value={form.disciplina} onChange={(e) => update("disciplina", e.target.value)} placeholder="Ingles, Matematica..." /></div>
                <div className="form-group"><label className="form-label">Turma principal</label><select className="form-input" value={form.turma} onChange={(e) => update("turma", e.target.value)}><option>Todas</option>{uniqueClassNames(turmas).map((turma) => <option key={turma}>{turma}</option>)}</select></div>
                <div className="form-group"><label className="form-label">Aluno especifico</label><select className="form-input" value={form.aluno} onChange={(e) => update("aluno", e.target.value)}><option value="">Turma(s) selecionada(s)</option>{alunos.map((a, i) => <option key={text(a.id || a.login || i)} value={text(a.login || a.usuario || rowName(a))}>{rowName(a)}{rowClass(a) ? ` - ${rowClass(a)}` : ""}</option>)}</select></div>
                <div className="form-group form-group-span2">
                  <label className="form-label">Turmas adicionais</label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                    {uniqueClassNames(turmas).map((turma) => (
                      <label className="attendance-item" key={turma}>
                        <input type="checkbox" checked={form.turmas.includes(turma)} onChange={() => toggleTurma(turma)} />
                        {turma}
                      </label>
                    ))}
                  </div>
                  <div className="form-help">Marque outras turmas quando a mesma licao deve ser publicada para mais de uma turma.</div>
                </div>
                <div className="form-group"><label className="form-label">Prazo</label><input className="form-input" type="datetime-local" value={form.due_date} onChange={(e) => update("due_date", e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Livro / apostila</label><input className="form-input" value={form.livro} onChange={(e) => update("livro", e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Capitulo / unidade</label><input className="form-input" value={form.capitulo} onChange={(e) => update("capitulo", e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Aula de referencia</label><input className="form-input" value={form.aula_referencia} onChange={(e) => update("aula_referencia", e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Habilidade / topico</label><input className="form-input" value={form.habilidade} onChange={(e) => update("habilidade", e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Peso</label><input className="form-input" type="number" value={form.peso} onChange={(e) => update("peso", e.target.value)} /></div>
                <div className="form-group form-group-span2"><label className="form-label">Instrucoes</label><textarea className="form-input form-textarea" rows={4} value={form.descricao} onChange={(e) => update("descricao", e.target.value)} /></div>
              </div>

              <div className="card" style={{ marginTop: 16 }}>
                <div className="card-header">
                  <div>
                    <div className="section-eyebrow">Prof Wiz</div>
                    <h3 className="section-title">Geracao assistida</h3>
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={gerarWiz} disabled={saving}>Gerar com Prof Wiz</button>
                </div>
                <div className="card-body">
                  <div className="form-grid">
                    <div className="form-group"><label className="form-label">Questoes</label><input className="form-input" type="number" value={form.quantidade} onChange={(e) => update("quantidade", e.target.value)} /></div>
                    <div className="form-group"><label className="form-label">Dificuldade</label><select className="form-input" value={form.dificuldade} onChange={(e) => update("dificuldade", e.target.value)}><option>Facil</option><option>Medio</option><option>Dificil</option><option>Adaptativo</option></select></div>
                    <div className="form-group form-group-span2"><label className="form-label">Foco especifico</label><input className="form-input" value={form.foco} onChange={(e) => update("foco", e.target.value)} /></div>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
                {questions.map((question, index) => (
                  <div className="card" key={question.id}>
                    <div className="card-body">
                      <div className="form-grid">
                        <div className="form-group"><label className="form-label">Tipo</label><select className="form-input" value={question.tipo} onChange={(e) => updateQuestion(index, { tipo: e.target.value as HomeworkQuestion["tipo"] })}><option value="aberta">Dissertativa</option><option value="multipla_escolha">Multipla escolha</option><option value="verdadeiro_falso">Verdadeiro/Falso</option><option value="upload">Upload</option></select></div>
                        <div className="form-group"><label className="form-label">Pontos</label><input className="form-input" type="number" value={question.pontos} onChange={(e) => updateQuestion(index, { pontos: Number(e.target.value) })} /></div>
                        <div className="form-group form-group-span2"><label className="form-label">Enunciado</label><textarea className="form-input form-textarea" rows={3} value={question.enunciado} onChange={(e) => updateQuestion(index, { enunciado: e.target.value })} /></div>
                        {question.tipo === "multipla_escolha" && <div className="form-group form-group-span2"><label className="form-label">Alternativas</label><textarea className="form-input form-textarea" rows={3} value={(question.opcoes || []).join("\n")} onChange={(e) => updateQuestion(index, { opcoes: splitLines(e.target.value) })} /><div className="form-help">A Wiz IA avalia a resposta automaticamente, sem marcar alternativa correta aqui.</div></div>}
                        {question.tipo === "verdadeiro_falso" && <div className="form-group form-group-span2"><div className="form-help">A Wiz IA avalia se a resposta verdadeiro/falso faz sentido pelo enunciado, sem resposta cadastrada no sistema.</div></div>}
                      </div>
                    </div>
                  </div>
                ))}
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setQuestions((prev) => [...prev, { id: crypto.randomUUID(), tipo: "aberta", enunciado: "", pontos: 1 }])}>Adicionar questao</button>
              </div>
              <label className="attendance-item" style={{ marginTop: 16 }}><input type="checkbox" checked={form.allow_resubmission} onChange={(e) => update("allow_resubmission", e.target.checked)} /> Permitir reenvio</label>
              {erro && <div className="form-error">{erro}</div>}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => salvar("Rascunho")}>Salvar rascunho</button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={() => salvar("Ativa")}>{saving ? "Salvando..." : "Salvar e publicar"}</button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </>
  );
}

export function HomeworkSubmitForm({ homework, submission }: { homework: Homework; submission?: HomeworkSubmission }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>((submission?.answers as Record<string, string>) || {});
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const questions = homework.questions || [];
  const done = text(submission?.status);

  function update(id: string, value: string) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    setFeedback("");
  }

  async function enviar() {
    setSaving(true);
    const res = await fetch("/api/licoes/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activity_id: homework.id, answers }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setFeedback(text(data.error) || "Erro ao enviar.");
      return;
    }
    setFeedback("Licao enviada com sucesso.");
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {text(homework.material_url) && (
        <a className="btn btn-secondary btn-sm" href={text(homework.material_url)} target="_blank" rel="noreferrer">
          Abrir PDF da licao {text(homework.material_page_start) && `(paginas ${text(homework.material_page_start)} a ${text(homework.material_page_end)})`}
        </a>
      )}
      {questions.map((question, index) => (
        <div key={question.id} className="card">
          <div className="card-body">
            <div className="section-eyebrow">Questao {index + 1} de {questions.length} | {question.pontos} pts</div>
            <h3 className="section-title" style={{ fontSize: "1rem", marginBottom: 10 }}>{question.enunciado}</h3>
            {question.tipo === "multipla_escolha" ? (
              <div style={{ display: "grid", gap: 8 }}>
                {(question.opcoes || []).map((opcao, optionIndex) => (
                  <label className="attendance-item" key={`${question.id}_${optionIndex}`}>
                    <input type="radio" name={question.id} checked={answers[question.id] === String(optionIndex)} onChange={() => update(question.id, String(optionIndex))} disabled={done === "Corrigido"} />
                    {String.fromCharCode(65 + optionIndex)}) {opcao}
                  </label>
                ))}
              </div>
            ) : question.tipo === "verdadeiro_falso" ? (
              <div style={{ display: "flex", gap: 8 }}><button className={`btn ${answers[question.id] === "V" ? "btn-primary" : "btn-secondary"}`} onClick={() => update(question.id, "V")} disabled={done === "Corrigido"}>Verdadeiro</button><button className={`btn ${answers[question.id] === "F" ? "btn-primary" : "btn-secondary"}`} onClick={() => update(question.id, "F")} disabled={done === "Corrigido"}>Falso</button></div>
            ) : (
              <textarea className="form-input form-textarea" rows={4} value={answers[question.id] || ""} onChange={(e) => update(question.id, e.target.value)} disabled={done === "Corrigido"} placeholder={question.tipo === "upload" ? "Cole aqui o link do arquivo enviado ou descreva o anexo." : "Digite sua resposta..."} />
            )}
          </div>
        </div>
      ))}
      {submission?.status === "Corrigido" && <div className="form-success">Corrigida: nota {Number(submission.score || 0).toFixed(1)}. {text(submission.feedback)}</div>}
      {feedback && <div className={feedback.includes("sucesso") ? "form-success" : "form-error"}>{feedback}</div>}
      <button className="btn btn-primary" onClick={enviar} disabled={saving || (submission && !homework.allow_resubmission && submission.status !== "Rascunho")}>{saving ? "Enviando..." : submission ? "Reenviar licao" : "Enviar licao"}</button>
    </div>
  );
}

export function HomeworkReviewForm({ submission, homework }: { submission: HomeworkSubmission; homework?: Homework }) {
  const router = useRouter();
  const maxScore = useMemo(() => (homework?.questions || []).reduce((sum, question) => sum + (Number(question.pontos) || 0), 0) || 10, [homework]);
  const [score, setScore] = useState(String(submission.score ?? 0));
  const [feedback, setFeedback] = useState(text(submission.feedback));
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  async function salvar() {
    setSaving(true);
    const res = await fetch("/api/licoes/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submission_id: submission.id, score: Number(score), feedback }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setMsg(text(data.error) || "Erro ao corrigir.");
      return;
    }
    setMsg("Correcao salva e nota lancada.");
    router.refresh();
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "120px minmax(220px, 1fr) auto", gap: 8, alignItems: "end" }}>
      <div className="form-group"><label className="form-label">Nota / {maxScore}</label><input className="form-input" type="number" min={0} max={maxScore} value={score} onChange={(e) => setScore(e.target.value)} /></div>
      <div className="form-group"><label className="form-label">Feedback</label><input className="form-input" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Comentario para o aluno" /></div>
      <button className="btn btn-primary" onClick={salvar} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</button>
      {msg && <div className={msg.includes("salva") ? "form-success" : "form-error"} style={{ gridColumn: "1 / -1" }}>{msg}</div>}
    </div>
  );
}
