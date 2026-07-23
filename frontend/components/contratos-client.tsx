"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Row = Record<string, unknown>;
type ContractAction = "inscricao" | "desistencia" | "cancelamento";
type ModalState = { action: ContractAction; contrato?: Row } | null;

function text(value: unknown) { return String(value || "").trim(); }
function studentId(student: Row | undefined) { return text(student?.id || student?.aluno_id || student?.student_id || student?.login || student?.usuario || student?.cpf); }
function money(value: unknown) {
  const parsed = Number.parseFloat(text(value).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}
function brl(value: unknown) { return money(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function date(value: unknown) {
  const raw = text(value);
  if (!raw) return "-";
  const parsed = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleDateString("pt-BR");
}
function isOpen(contract: Row) {
  const status = text(contract.status).toLowerCase();
  return status === "ativo" || status === "inscrito" || status === "desistencia solicitada";
}
function html(value: unknown) { return text(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char); }
function cancellationPreview(contract: Row) {
  const start = new Date(`${text(contract.data_inicio || contract.inscrito_em).slice(0, 10)}T12:00:00`);
  const now = new Date();
  let elapsed = Number.isNaN(start.getTime()) ? 0 : (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth();
  if (!Number.isNaN(start.getTime()) && now.getDate() < start.getDate()) elapsed -= 1;
  const total = Math.max(1, Number(contract.parcelas_totais) || 24);
  const remaining = Math.max(0, total - Math.max(0, elapsed));
  return { remaining, fee: money(contract.valor_mensal) * remaining * 0.1 };
}

function printContract(contract: Row) {
  const preview = cancellationPreview(contract);
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Contrato - ${html(contract.aluno)}</title><style>body{font-family:Arial,sans-serif;color:#172033;margin:44px;line-height:1.6}h1{font-size:24px;margin-bottom:4px}h2{font-size:16px;margin-top:28px}table{width:100%;border-collapse:collapse;margin:14px 0}td{border:1px solid #d8dee8;padding:9px}td:first-child{width:35%;font-weight:bold;background:#f6f8fb}.sign{margin-top:76px;display:grid;grid-template-columns:1fr 1fr;gap:48px}.line{border-top:1px solid #172033;padding-top:7px;text-align:center}</style></head><body><h1>Contrato de Prestacao de Servicos Educacionais</h1><p>Active Educacional</p><table><tr><td>Aluno</td><td>${html(contract.aluno)}</td></tr><tr><td>Curso</td><td>${html(contract.curso)}</td></tr><tr><td>Inicio</td><td>${html(date(contract.data_inicio))}</td></tr><tr><td>Prazo contratual</td><td>${html(text(contract.parcelas_totais || 24))} meses</td></tr><tr><td>Valor mensal</td><td>${html(brl(contract.valor_mensal))}</td></tr><tr><td>Valor contratual</td><td>${html(brl(contract.valor_total))}</td></tr><tr><td>Status</td><td>${html(contract.status)}</td></tr></table><h2>Cancelamento</h2><p>Em caso de cancelamento, aplica-se taxa de 10% sobre o valor das parcelas restantes do prazo contratual de 24 meses. Na data de emissão deste documento, a estimativa é de ${html(brl(preview.fee))} para ${preview.remaining} parcela(s) restante(s). O valor final é calculado na confirmação do cancelamento.</p><div class="sign"><div class="line">Responsável pelo aluno</div><div class="line">Active Educacional</div></div><script>window.onload=()=>window.print()</script></body></html>`);
  win.document.close();
}

export function ContratosClient({ alunos, contratos, isAdmin }: { alunos: Row[]; contratos: Row[]; isAdmin: boolean }) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>(null);
  const [filter, setFilter] = useState("Todos");
  const [busy, setBusy] = useState(false);
  const [batching, setBatching] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ aluno_id: "", curso: "Curso de inglês", data_inicio: new Date().toISOString().slice(0, 10), valor_mensal: "", observacoes: "", motivo: "", vencimento: "" });

  const shown = useMemo(() => contratos.filter((contract) => filter === "Todos" || text(contract.status) === filter), [contratos, filter]);
  const activeCount = contratos.filter(isOpen).length;

  function open(action: ContractAction, contrato?: Row) {
    setError("");
    setModal({ action, contrato });
    if (action === "inscricao") setForm({ aluno_id: "", curso: "Curso de inglês", data_inicio: new Date().toISOString().slice(0, 10), valor_mensal: "", observacoes: "", motivo: "", vencimento: "" });
    else setForm((current) => ({ ...current, motivo: "", vencimento: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) }));
  }

  function selectedStudent() { return alunos.find((student) => studentId(student) === form.aluno_id); }

  async function addActiveStudents() {
    if (batching || !confirm("Adicionar contratos para todos os alunos ativos que ainda não possuem contrato? Nenhuma cobrança ou mensagem será enviada.")) return;
    setBatching(true);
    try {
      const res = await fetch("/api/contratos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "inscricao_lote" }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { alert(String(data.error || "Não foi possível incluir os alunos ativos.")); return; }
      router.refresh();
      alert(`${Number(data.criados || 0)} contrato(s) criado(s). ${Number(data.valores_pendentes || 0)} contrato(s) ficaram com valor mensal pendente.`);
    } catch { alert("Erro de comunicação ao incluir contratos."); }
    finally { setBatching(false); }
  }

  async function save() {
    if (!modal || busy) return;
    const student = selectedStudent();
    const payload: Row = modal.action === "inscricao" ? {
      action: "inscricao", aluno_id: studentId(student), aluno: text(student?.nome || student?.name), aluno_login: text(student?.login || student?.usuario), curso: form.curso, data_inicio: form.data_inicio, valor_mensal: form.valor_mensal, observacoes: form.observacoes,
    } : {
      action: modal.action, contrato_id: text(modal.contrato?.id), motivo: form.motivo, vencimento: form.vencimento,
    };
    if (modal.action === "cancelamento" && !confirm("Confirmar o cancelamento? O sistema irá lançar uma taxa de 10% sobre as parcelas restantes do contrato.")) return;

    setBusy(true); setError("");
    try {
      const res = await fetch("/api/contratos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { setError(String(data.error || "Não foi possível salvar o contrato.")); return; }
      setModal(null); router.refresh();
      if (modal.action === "cancelamento") alert(`Cancelamento registrado. Taxa lançada: ${brl(data.calculo?.fee)}.`);
    } catch { setError("Erro de comunicação ao salvar o contrato."); }
    finally { setBusy(false); }
  }

  const current = modal?.contrato;
  const preview = current ? cancellationPreview(current) : null;

  return <>
    <div className="page-header">
      <div className="page-title-block"><div className="page-eyebrow"><span className="page-eyebrow-dot" />Gestão escolar</div><h1 className="page-title">Contratos</h1><p className="page-description">Inscrições, desistências e cancelamentos com rastreabilidade financeira.</p></div>
      <div className="page-actions"><button className="btn btn-secondary" type="button" onClick={addActiveStudents} disabled={batching}>{batching ? "Incluindo alunos..." : "Adicionar alunos ativos"}</button><button className="btn btn-primary" type="button" onClick={() => open("inscricao")}>Nova inscrição</button></div>
    </div>
    <div className="metric-grid metric-grid-3">
      <div className="metric-card metric-card-blue"><div className="metric-label">Contratos ativos</div><div className="metric-value">{activeCount}</div><div className="metric-note">Prazo padrão de 24 meses</div></div>
      <div className="metric-card metric-card-gold"><div className="metric-label">Desistências</div><div className="metric-value">{contratos.filter((item) => text(item.status) === "Desistencia solicitada").length}</div><div className="metric-note">Aguardando definição</div></div>
      <div className="metric-card metric-card-red"><div className="metric-label">Cancelados</div><div className="metric-value">{contratos.filter((item) => text(item.status) === "Cancelado").length}</div><div className="metric-note">Taxa calculada a 10%</div></div>
    </div>
    <div className="card"><div className="toolbar"><div className="toolbar-left"><select className="filter-select" value={filter} onChange={(event) => setFilter(event.target.value)}><option>Todos</option><option>Ativo</option><option>Desistencia solicitada</option><option>Cancelado</option></select></div><div className="toolbar-right" style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>Cancelamento: 10% das parcelas restantes do prazo de 24 meses.</div></div>
      <div className="card-body" style={{ paddingTop: 0 }}><table className="data-table"><thead><tr><th>Aluno / curso</th><th>Início</th><th>Mensalidade</th><th>Status</th><th>Ações</th></tr></thead><tbody>{shown.map((contract) => <tr key={text(contract.id)}><td><div className="table-name-cell"><span className="table-name-primary">{text(contract.aluno)}</span><span className="table-name-secondary">{text(contract.curso)}</span></div></td><td>{date(contract.data_inicio)}</td><td><span>{brl(contract.valor_mensal)}</span>{contract.valor_pendente === true && <span className="table-name-secondary" style={{ color: "var(--gold-700)" }}>Definir valor mensal</span>}</td><td><span className={`badge badge-${text(contract.status) === "Ativo" ? "success" : text(contract.status) === "Cancelado" ? "danger" : "warning"}`}><span className="badge-dot" />{text(contract.status)}</span></td><td><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><button className="btn btn-secondary btn-sm" type="button" onClick={() => printContract(contract)}>Imprimir</button>{isOpen(contract) && <button className="btn btn-secondary btn-sm" type="button" onClick={() => open("desistencia", contract)}>Desistência</button>}{isOpen(contract) && isAdmin && <button className="btn btn-danger btn-sm" type="button" onClick={() => open("cancelamento", contract)}>Cancelar</button>}</div></td></tr>)}{shown.length === 0 && <tr><td colSpan={5}><div className="empty-state"><div className="empty-title">Nenhum contrato encontrado</div><p className="empty-desc">Registre uma inscrição para iniciar o controle contratual.</p></div></td></tr>}</tbody></table></div>
    </div>
    {modal && <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && !busy && setModal(null)}>
      <div className="modal-box" style={{ maxWidth: 620 }}>
        <div className="modal-header"><div><div className="modal-title">{modal.action === "inscricao" ? "Nova inscrição" : modal.action === "desistencia" ? "Registrar desistência" : "Confirmar cancelamento"}</div><div className="modal-subtitle">{modal.action === "inscricao" ? "Contrato padrão de 24 meses." : text(current?.aluno)}</div></div><button className="modal-close" type="button" onClick={() => setModal(null)} disabled={busy}>×</button></div>
        <div className="modal-body">
          {modal.action === "inscricao" ? <div className="form-grid"><label className="form-label form-field-full">Aluno<select className="form-input" value={form.aluno_id} onChange={(event) => { const student = alunos.find((item) => studentId(item) === event.target.value); setForm({ ...form, aluno_id: event.target.value, valor_mensal: form.valor_mensal || text(student?.mensalidade || student?.valor_mensalidade || "") }); }}><option value="">Selecione o aluno</option>{alunos.map((student) => <option key={studentId(student)} value={studentId(student)}>{text(student.nome || student.name)}</option>)}</select></label><label className="form-label">Curso<input className="form-input" value={form.curso} onChange={(event) => setForm({ ...form, curso: event.target.value })} /></label><label className="form-label">Início<input className="form-input" type="date" value={form.data_inicio} onChange={(event) => setForm({ ...form, data_inicio: event.target.value })} /></label><label className="form-label form-field-full">Valor mensal<input className="form-input" inputMode="decimal" placeholder="0,00" value={form.valor_mensal} onChange={(event) => setForm({ ...form, valor_mensal: event.target.value })} /></label><label className="form-label form-field-full">Observações<textarea className="form-input form-textarea" value={form.observacoes} onChange={(event) => setForm({ ...form, observacoes: event.target.value })} /></label></div> : <><div className="form-help" style={{ marginBottom: 14 }}>{modal.action === "cancelamento" ? <>Taxa calculada: <strong>{brl(preview?.fee)}</strong>, equivalente a 10% de {preview?.remaining} parcela(s) restante(s). Será criado apenas um lançamento em aberto, sem envio automático.</> : "A desistência fica registrada para análise administrativa e não gera cobrança automática."}</div>{modal.action === "cancelamento" && <label className="form-label">Vencimento da taxa<input className="form-input" type="date" value={form.vencimento} onChange={(event) => setForm({ ...form, vencimento: event.target.value })} /></label>}<label className="form-label">Motivo<textarea className="form-input form-textarea" value={form.motivo} onChange={(event) => setForm({ ...form, motivo: event.target.value })} /></label></>}
          {error && <div className="form-error">{error}</div>}
        </div>
        <div className="modal-footer"><button className="btn btn-secondary" type="button" onClick={() => setModal(null)} disabled={busy}>Voltar</button><button className={`btn ${modal.action === "cancelamento" ? "btn-danger" : "btn-primary"}`} type="button" onClick={save} disabled={busy}>{busy ? "Salvando..." : modal.action === "inscricao" ? "Criar contrato" : modal.action === "desistencia" ? "Registrar desistência" : "Confirmar cancelamento"}</button></div>
      </div>
    </div>}
  </>;
}
