"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BOOK_LEVELS, COURSE_MODULES, isVipModule, migrateModule } from "@/lib/course-modules";
import { ModalPortal } from "@/components/modal-portal";

type TurmaData = {
  id?: string;
  nome?: string;
  name?: string;
  modulo?: string;
  tipo_aula?: string;
  modalidade?: string;
  professor?: string;
  livro?: string;
  book?: string;
  ultima_licao?: string;
  ultima_aula?: string;
  valor_aula?: string | number;
  horario?: string;
  dias?: string;
  dias_semana?: string[] | string;
  hora_inicio?: string;
  hora_fim?: string;
  link_zoom?: string;
  link?: string;
  sala?: string;
  status?: string;
  situacao?: string;
  plano_vip?: string;
  total_aulas_vip?: string | number;
  aulas_realizadas_vip?: string | number;
  observacoes?: string;
  [k: string]: unknown;
};

type ProfessorOption = {
  id?: string;
  nome?: string;
  name?: string;
  usuario?: string;
  login?: string;
  [k: string]: unknown;
};

type AlunoOption = {
  id?: string;
  _id?: string;
  uuid?: string;
  matricula?: string;
  nome?: string;
  name?: string;
  turma?: string;
  classe?: string;
  status?: string;
  situacao?: string;
  [k: string]: unknown;
};

type Form = {
  nome: string;
  modulo: string;
  professor: string;
  livro: string;
  ultima_licao: string;
  dias_semana: string[];
  hora_inicio: string;
  hora_fim: string;
  link_zoom: string;
  sala: string;
  valor_aula: string;
  plano_vip: string;
  total_aulas_vip: string;
  aulas_realizadas_vip: string;
  status: string;
  observacoes: string;
};

const MODULOS = [...COURSE_MODULES];

const DIAS = ["Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado", "Domingo"];
const LIVROS = [...BOOK_LEVELS];

function splitDias(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  const raw = String(value || "");
  return DIAS.filter((dia) => raw.toLowerCase().includes(dia.toLowerCase().slice(0, 3)));
}

function formatDias(dias: string[], inicio: string, fim: string) {
  if (!dias.length) return "Sem dias definidos";
  const diasTxt = dias.join(", ");
  const horario = inicio && fim ? ` - ${inicio} às ${fim}` : "";
  return `${diasTxt}${horario}`;
}

function alunoKey(aluno: AlunoOption) {
  return String(aluno.id || aluno._id || aluno.uuid || aluno.matricula || aluno.nome || aluno.name || "").trim();
}

function alunoName(aluno: AlunoOption) {
  return String(aluno.nome || aluno.name || "Aluno sem nome").trim();
}

function alunoClass(aluno: AlunoOption) {
  return String(aluno.turma || aluno.classe || "Sem Turma").trim();
}

function fromTurma(t?: TurmaData): Form {
  const horaInicio = String(t?.hora_inicio || "").slice(0, 5);
  const horaFim = String(t?.hora_fim || "").slice(0, 5);
  return {
    nome: String(t?.nome || t?.name || ""),
    modulo: migrateModule(t?.modulo || t?.tipo_aula || t?.modalidade || "Aula em Turma"),
    professor: String(t?.professor || "Sem Professor"),
    livro: String(t?.livro || t?.book || ""),
    ultima_licao: String(t?.ultima_licao || t?.ultima_aula || ""),
    dias_semana: splitDias(t?.dias_semana || t?.dias),
    hora_inicio: horaInicio || "19:00",
    hora_fim: horaFim || "20:00",
    link_zoom: String(t?.link_zoom || t?.link || ""),
    sala: String(t?.sala || ""),
    valor_aula: String(t?.valor_aula || ""),
    plano_vip: String(t?.plano_vip || ""),
    total_aulas_vip: String(t?.total_aulas_vip || ""),
    aulas_realizadas_vip: String(t?.aulas_realizadas_vip || "0"),
    status: String(t?.status || t?.situacao || "Ativa"),
    observacoes: String(t?.observacoes || ""),
  };
}

function TurmaModal({ turma, onClose, onSaved }: { turma?: TurmaData; onClose: () => void; onSaved: () => void }) {
  const isEdit = Boolean(turma);
  const turmaIdentifier = String(turma?.id || turma?.nome || turma?.name || "").trim();
  const [form, setForm] = useState<Form>(fromTurma(turma));
  const [professores, setProfessores] = useState<ProfessorOption[]>([]);
  const [alunos, setAlunos] = useState<AlunoOption[]>([]);
  const [selectedAlunoIds, setSelectedAlunoIds] = useState<string[]>([]);
  const [alunoSearch, setAlunoSearch] = useState("");
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  // VIP lesson package (avulsa) only for the pure "Vip" module.
  // Intensivo Vip + all online turmas are paid monthly — no lesson balance.
  const isVip = isVipModule(form.modulo);
  const professorOptions = useMemo(() => {
    const nomes = professores.map((p) => String(p.nome || p.name || p.usuario || p.login || "").trim()).filter(Boolean);
    return Array.from(new Set(["Sem Professor", ...nomes, form.professor].filter(Boolean)));
  }, [professores, form.professor]);

  useEffect(() => {
    Promise.all([
      fetch("/api/professores").then((res) => res.json()),
      fetch("/api/alunos").then((res) => res.json()),
    ])
      .then(([professoresData, alunosData]) => {
        setProfessores(Array.isArray(professoresData?.professores) ? professoresData.professores : []);
        const nextAlunos = Array.isArray(alunosData?.alunos) ? alunosData.alunos as AlunoOption[] : [];
        setAlunos(nextAlunos);
        const turmaNome = String(turma?.nome || turma?.name || "").trim().toLowerCase();
        setSelectedAlunoIds(nextAlunos
          .filter((aluno) => turmaNome && alunoClass(aluno).toLowerCase() === turmaNome)
          .map(alunoKey)
          .filter(Boolean));
        setMembersLoaded(true);
      })
      .catch(() => {
        setProfessores([]);
        setAlunos([]);
        setMembersLoaded(false);
      });
  }, [turma?.id, turma?.nome, turma?.name]);

  const filteredAlunos = useMemo(() => {
    const query = alunoSearch.trim().toLowerCase();
    return alunos
      .filter((aluno) => {
        const status = String(aluno.status || aluno.situacao || "Ativo").toLowerCase();
        return !status.includes("exclu") && !status.includes("inativ");
      })
      .filter((aluno) => !query || `${alunoName(aluno)} ${alunoClass(aluno)} ${aluno.matricula || ""}`.toLowerCase().includes(query))
      .sort((a, b) => alunoName(a).localeCompare(alunoName(b), "pt-BR"));
  }, [alunos, alunoSearch]);

  function update<K extends keyof Form>(field: K, value: Form[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErro("");
  }

  function toggleDia(dia: string) {
    update("dias_semana", form.dias_semana.includes(dia) ? form.dias_semana.filter((d) => d !== dia) : [...form.dias_semana, dia]);
  }

  function toggleAluno(id: string) {
    setSelectedAlunoIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setErro("");
  }

  async function excluir() {
    if (!confirm(`Excluir a turma "${form.nome}"? Os alunos vinculados voltarao para Sem Turma.`)) return;
    setSaving(true);
    setErro("");
    try {
      const res = await fetch(`/api/turmas?id=${encodeURIComponent(turmaIdentifier)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErro(String(data.error || "Nao foi possivel excluir a turma."));
        return;
      }
      onSaved();
    } catch {
      setErro("Erro de conexao ao excluir a turma.");
    } finally {
      setSaving(false);
    }
  }

  async function salvar() {
    if (!form.nome.trim()) {
      setErro("O nome da turma e obrigatorio.");
      return;
    }
    if (form.dias_semana.length && form.hora_inicio && form.hora_fim && form.hora_fim <= form.hora_inicio) {
      setErro("O horario final precisa ser maior que o inicial.");
      return;
    }
    setSaving(true);
    setErro("");
    const payload = {
      ...(isEdit ? { id: turmaIdentifier } : {}),
      ...form,
      professor: form.professor || "Sem Professor",
      dias: formatDias(form.dias_semana, form.hora_inicio, form.hora_fim),
      horario: `${form.hora_inicio} - ${form.hora_fim}`,
      tipo_aula: form.modulo,
      modalidade: form.modulo.toLowerCase().includes("online") ? "Online" : "Presencial",
      nivel: form.livro,
      ...(membersLoaded ? { aluno_ids: selectedAlunoIds } : {}),
    };
    try {
      const res = await fetch("/api/turmas", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErro((d as { error?: string }).error || "Erro ao salvar.");
        return;
      }
      onSaved();
    } catch {
      setErro("Erro de conexao ao salvar a turma.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalPortal>
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box turma-modal-box" style={{ maxWidth: 900 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{isEdit ? `Editar turma: ${form.nome}` : "Criar nova turma"}</div>
            <div className="modal-subtitle">{isEdit ? "Dados, agenda e alunos vinculados." : "Cadastro de dados, agenda e alunos."}</div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
          </button>
        </div>

        <div className="modal-body">
          <div className="form-grid">
            <div className="form-group form-group-span2">
              <label className="form-label">Nome da turma *</label>
              <input className="form-input" placeholder="Ex: Teens Completo - Seg/Qua 19h" value={form.nome} onChange={(e) => update("nome", e.target.value)} autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Modulo da aula *</label>
              <select className="form-input" value={form.modulo} onChange={(e) => update("modulo", e.target.value)}>
                {MODULOS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Professor</label>
              <select className="form-input" value={form.professor || "Sem Professor"} onChange={(e) => update("professor", e.target.value)}>
                {professorOptions.map((p) => <option key={p}>{p}</option>)}
              </select>
              <div className="form-help">Puxa automaticamente os professores cadastrados.</div>
            </div>
            <div className="form-group">
              <label className="form-label">Livro / Nivel</label>
              <input className="form-input" list="livros-turma" value={form.livro} onChange={(e) => update("livro", e.target.value)} />
              <datalist id="livros-turma">{LIVROS.map((l) => <option key={l} value={l} />)}</datalist>
            </div>
            <div className="form-group">
              <label className="form-label">Licao atual</label>
              <input className="form-input" placeholder="Ex: Unit 3 / pagina 24" value={form.ultima_licao} onChange={(e) => update("ultima_licao", e.target.value)} />
            </div>
            <div className="form-group form-group-span2">
              <label className="form-label">Dias das aulas</label>
              <div className="attendance-grid">
                {DIAS.map((dia) => (
                  <label className="attendance-item" key={dia}><input type="checkbox" checked={form.dias_semana.includes(dia)} onChange={() => toggleDia(dia)} /> {dia}</label>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Horario inicial</label>
              <input className="form-input" type="time" value={form.hora_inicio} onChange={(e) => update("hora_inicio", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Horario final</label>
              <input className="form-input" type="time" value={form.hora_fim} onChange={(e) => update("hora_fim", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Link da aula online / Zoom</label>
              <input className="form-input" placeholder="https://..." value={form.link_zoom} onChange={(e) => update("link_zoom", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Sala</label>
              <input className="form-input" placeholder="Sala presencial" value={form.sala} onChange={(e) => update("sala", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Valor da aula / professor</label>
              <input className="form-input" inputMode="decimal" placeholder="Ex: 50,00" value={form.valor_aula} onChange={(e) => update("valor_aula", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-input" value={form.status} onChange={(e) => update("status", e.target.value)}>
                <option>Ativa</option>
                <option>Em atencao</option>
                <option>Inativa</option>
                <option>Concluida</option>
              </select>
            </div>
            {isVip && (
              <>
                <div className="form-group">
                  <label className="form-label">Tipo do plano VIP</label>
                  <select className="form-input" value={form.plano_vip} onChange={(e) => update("plano_vip", e.target.value)}>
                    <option value="">Selecione</option>
                    <option>Avulsa (sem pacote)</option>
                    <option>Pacote 5 aulas</option>
                    <option>Pacote 10 aulas</option>
                    <option>Pacote 15 aulas</option>
                    <option>Pacote 20 aulas</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Total de aulas VIP</label>
                  <input className="form-input" type="number" min="0" value={form.total_aulas_vip} onChange={(e) => update("total_aulas_vip", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Aulas realizadas VIP</label>
                  <input className="form-input" type="number" min="0" value={form.aulas_realizadas_vip} onChange={(e) => update("aulas_realizadas_vip", e.target.value)} />
                </div>
              </>
            )}
            <div className="form-group form-group-span2">
              <label className="form-label">Observacoes da turma</label>
              <textarea className="form-input form-textarea" rows={3} value={form.observacoes} onChange={(e) => update("observacoes", e.target.value)} />
            </div>
            <div className="form-group form-group-span2">
              <label className="form-label">Alunos da turma ({selectedAlunoIds.length})</label>
              <input className="form-input" value={alunoSearch} onChange={(e) => setAlunoSearch(e.target.value)} placeholder="Buscar aluno por nome, matricula ou turma atual" />
              <div style={{ maxHeight: 230, overflowY: "auto", display: "grid", gap: 6, marginTop: 8, border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
                {!membersLoaded && <div className="form-help">Carregando alunos...</div>}
                {membersLoaded && filteredAlunos.length === 0 && <div className="form-help">Nenhum aluno encontrado.</div>}
                {filteredAlunos.map((aluno) => {
                  const id = alunoKey(aluno);
                  const checked = selectedAlunoIds.includes(id);
                  return (
                    <label className="attendance-item" key={id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleAluno(id)} />
                      <span style={{ flex: 1 }}><strong>{alunoName(aluno)}</strong><small style={{ display: "block", color: "var(--text-secondary)" }}>Turma atual: {alunoClass(aluno)}</small></span>
                    </label>
                  );
                })}
              </div>
              <div className="form-help">Ao salvar, os selecionados entram nesta turma; os removidos ficam como Sem Turma.</div>
            </div>
          </div>
          {erro && <div className="form-error">{erro}</div>}
        </div>

        <div className="modal-footer turma-modal-footer">
          {isEdit && <button className="btn btn-danger" onClick={excluir} disabled={saving} style={{ marginRight: "auto" }}>Excluir turma</button>}
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={saving}>{saving ? "Salvando..." : isEdit ? "Salvar turma" : "Criar turma"}</button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}

export function NovaTurmaBtn() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
        Nova turma
      </button>
      {open && <TurmaModal onClose={() => setOpen(false)} onSaved={() => { setOpen(false); router.refresh(); }} />}
    </>
  );
}

export function EditarTurmaBtn({ turma }: { turma: TurmaData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-secondary" style={{ width: "100%" }} onClick={() => setOpen(true)}>Editar turma e alunos</button>
      {open && <TurmaModal turma={turma} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); router.refresh(); }} />}
    </>
  );
}
