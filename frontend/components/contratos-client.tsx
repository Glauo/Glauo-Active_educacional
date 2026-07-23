"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Row = Record<string, unknown>;
type ContractAction = "inscricao" | "desistencia" | "cancelamento" | "troca_modalidade";
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
function contractType(contract: Row) {
  const type = text(contract.tipo || contract.documento_tipo).toLowerCase();
  if (type.includes("cancel")) return "Cancelamento";
  if (type.includes("troca") || type.includes("modalidade")) return "Troca de modalidade";
  return "Matricula";
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
  const type = contractType(contract);
  const preview = cancellationPreview(contract);
  const title = type === "Cancelamento" ? "Contrato de Cancelamento" : type === "Troca de modalidade" ? "Contrato de Troca de Modalidade" : "Contrato de Matricula";
  const body = type === "Cancelamento"
    ? `Cancelamento registrado em ${html(date(contract.data_inicio || contract.cancelado_em))}. Taxa: ${html(brl(contract.taxa_cancelamento_valor))}. Motivo: ${html(contract.motivo_cancelamento)}.`
    : type === "Troca de modalidade"
    ? `Modalidade anterior: ${html(contract.modalidade_anterior)}. Nova modalidade: ${html(contract.modalidade_nova || contract.curso)}. Motivo: ${html(contract.motivo_troca_modalidade)}.`
    : `Prazo de ${html(text(contract.parcelas_totais || 24))} meses. Em caso de cancelamento, a taxa estimada e de ${html(brl(preview.fee))}, equivalente a 10% das parcelas restantes.`;
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:Arial,sans-serif;color:#172033;margin:44px;line-height:1.6}h1{font-size:24px}h2{font-size:16px;margin-top:28px}table{width:100%;border-collapse:collapse;margin:14px 0}td{border:1px solid #d8dee8;padding:9px}td:first-child{width:35%;font-weight:bold;background:#f6f8fb}.sign{margin-top:76px;display:grid;grid-template-columns:1fr 1fr;gap:48px}.line{border-top:1px solid #172033;padding-top:7px;text-align:center}</style></head><body><h1>${title}</h1><p>Active Educacional</p><table><tr><td>Aluno</td><td>${html(contract.aluno)}</td></tr><tr><td>Curso / modalidade</td><td>${html(contract.curso)}</td></tr><tr><td>Data</td><td>${html(date(contract.data_inicio))}</td></tr><tr><td>Valor mensal</td><td>${html(brl(contract.valor_mensal))}</td></tr><tr><td>Status</td><td>${html(contract.status)}</td></tr></table><h2>Declaracao</h2><p>${body}</p><div class="sign"><div class="line">Responsavel pelo aluno</div><div class="line">Active Educacional</div></div><script>window.onload=()=>window.print()</script></body></html>`);
  win.document.close();
}

export function ContratosClient({ alunos, contratos, isAdmin }: { alunos: Row[]; contratos: Row[]; isAdmin: boolean }) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>(null);
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [typeFilter, setTypeFilter] = useState("Todos");
  const [busy, setBusy] = useState(false);
  const [batching, setBatching] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ aluno_id: "", curso: "Curso de ingles", data_inicio: new Date().toISOString().slice(0, 10), valor_mensal: "", observacoes: "", motivo: "", vencimento: "", nova_modalidade: "" });

  const shown = useMemo(() => contratos.filter((contract) =>
    (statusFilter === "Todos" || text(contract.status) === statusFilter) &&
    (typeFilter === "Todos" || contractType(contract) === typeFilter)
  ), [contratos, statusFilter, typeFilter]);
  const activeCount = contratos.filter((contract) => contractType(contract) === "Matricula" && isOpen(contract)).length;
  const current = modal?.contrato;
  const preview = current ? cancellationPreview(current) : null;

  function open(action: ContractAction, contrato?: Row) {
    setError("");
    setModal({ action, contrato });
    setForm(action === "inscricao"
      ? { aluno_id: "", curso: "Curso de ingles", data_inicio: new Date().toISOString().slice(0, 10), valor_mensal: "", observacoes: "", motivo: "", vencimento: "", nova_modalidade: "" }
      : { aluno_id: "", curso: "", data_inicio: new Date().toISOString().slice(0, 10), valor_mensal: "", observacoes: "", motivo: "", vencimento: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), nova_modalidade: "" }
    );
  }

  async function addActiveStudents() {
    if (batching || !confirm("Adicionar contratos de matricula para todos os alunos ativos sem contrato? Nenhuma cobranca ou mensagem sera enviada.")) return;
    setBatching(true);
    try {
      const res = await fetch("/api/contratos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "inscricao_lote" }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { alert(String(data.error || "Nao foi possivel incluir os alunos ativos.")); return; }
      router.refresh();
      alert(`${Number(data.criados || 0)} contrato(s) criado(s). ${Number(data.valores_pendentes || 0)} com valor mensal pendente.`);
    } catch { alert("Erro de comunicacao ao incluir contratos."); }
    finally { setBatching(false); }
  }

  async function save() {
    if (!modal || busy) return;
    const student = alunos.find((item) => studentId(item) === form.aluno_id);
    const payload: Row = modal.action === "inscricao" ? {
      action: "inscricao", aluno_id: studentId(student), aluno: text(student?.nome || student?.name), aluno_login: text(student?.login || student?.usuario), curso: form.curso, data_inicio: form.data_inicio, valor_mensal: form.valor_mensal, observacoes: form.observacoes,
    } : {
      action: modal.action, contrato_id: text(current?.id), motivo: form.motivo, vencimento: form.vencimento, nova_modalidade: form.nova_modalidade,
    };
    if (modal.action === "cancelamento" && !confirm("Confirmar o cancelamento? Sera lancada taxa de 10% sobre as parcelas restantes.")) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/contratos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { setError(String(data.error || "Nao foi possivel salvar o contrato.")); return; }
      setModal(null);
      router.refresh();
      if (modal.action === "cancelamento") alert(`Cancelamento registrado. Taxa lancada: ${brl(data.calculo?.fee)}.`);
      if (modal.action === "troca_modalidade") alert("Troca de modalidade registrada.");
    } catch { setError("Erro de comunicacao ao salvar o contrato."); }
    finally { setBusy(false); }
  }

  const modalTitle = modal?.action === "inscricao" ? "Contrato de matricula" : modal?.action === "cancelamento" ? "Contrato de cancelamento" : modal?.action === "troca_modalidade" ? "Contrato de troca de modalidade" : "Registrar desistencia";
  const submitText = modal?.action === "inscricao" ? "Criar contrato" : modal?.action === "cancelamento" ? "Confirmar cancelamento" : modal?.action === "troca_modalidade" ? "Registrar troca" : "Registrar desistencia";

  return <>
    <div className="page-header">
      <div className="page-title-block"><div className="page-eyebrow"><span className="page-eyebrow-dot" />Gestao escolar</div><h1 className="page-title">Contratos</h1><p className="page-description">Matriculas, cancelamentos e trocas de modalidade por aluno.</p></div>
      <div className="page-actions"><button className="btn btn-secondary" type="button" onClick={addActiveStudents} disabled={batching}>{batching ? "Incluindo alunos..." : "Adicionar alunos ativos"}</button><button className="btn btn-primary" type="button" onClick={() => open("inscricao")}>Nova matricula</button></div>
    </div>
    <div className="metric-grid metric-grid-3">
      <div className="metric-card metric-card-blue"><div className="metric-label">Matriculas ativas</div><div className="metric-value">{activeCount}</div><div className="metric-note">Contratos em vigor</div></div>
      <div className="metric-card metric-card-gold"><div className="metric-label">Cancelamentos</div><div className="metric-value">{contratos.filter((item) => contractType(item) === "Cancelamento").length}</div><div className="metric-note">Documentos registrados</div></div>
      <div className="metric-card metric-card-red"><div className="metric-label">Trocas de modalidade</div><div className="metric-value">{contratos.filter((item) => contractType(item) === "Troca de modalidade").length}</div><div className="metric-note">Aditivos registrados</div></div>
    </div>
    <div className="card">
      <div className="toolbar"><div className="toolbar-left"><select className="filter-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>Todos</option><option>Ativo</option><option>Registrado</option><option>Cancelado</option><option>Desistencia solicitada</option></select><select className="filter-select" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option>Todos</option><option>Matricula</option><option>Cancelamento</option><option>Troca de modalidade</option></select></div><div className="toolbar-right" style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>Taxa de cancelamento: 10% das parcelas restantes.</div></div>
      <div className="card-body" style={{ paddingTop: 0 }}><table className="data-table"><thead><tr><th>Aluno / curso</th><th>Tipo</th><th>Data</th><th>Mensalidade</th><th>Status</th><th>Acoes</th></tr></thead><tbody>{shown.map((contract) => <tr key={text(contract.id)}><td><div className="table-name-cell"><span className="table-name-primary">{text(contract.aluno)}</span><span className="table-name-secondary">{text(contract.curso)}</span></div></td><td>{contractType(contract)}</td><td>{date(contract.data_inicio)}</td><td>{contractType(contract) === "Matricula" ? brl(contract.valor_mensal) : "-"}</td><td><span className={`badge badge-${text(contract.status) === "Ativo" ? "success" : text(contract.status) === "Cancelado" ? "danger" : "warning"}`}><span className="badge-dot" />{text(contract.status)}</span></td><td><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><button className="btn btn-secondary btn-sm" type="button" onClick={() => printContract(contract)}>Imprimir</button>{contractType(contract) === "Matricula" && isOpen(contract) && <button className="btn btn-secondary btn-sm" type="button" onClick={() => open("troca_modalidade", contract)}>Trocar modalidade</button>}{contractType(contract) === "Matricula" && isOpen(contract) && <button className="btn btn-secondary btn-sm" type="button" onClick={() => open("desistencia", contract)}>Desistencia</button>}{contractType(contract) === "Matricula" && isOpen(contract) && isAdmin && <button className="btn btn-danger btn-sm" type="button" onClick={() => open("cancelamento", contract)}>Cancelar</button>}</div></td></tr>)}{shown.length === 0 && <tr><td colSpan={6}><div className="empty-state"><div className="empty-title">Nenhum contrato encontrado</div><p className="empty-desc">Os contratos dos alunos ativos aparecerao nesta lista.</p></div></td></tr>}</tbody></table></div>
    </div>
    {modal && <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && !busy && setModal(null)}><div className="modal-box" style={{ maxWidth: 620 }}><div className="modal-header"><div><div className="modal-title">{modalTitle}</div><div className="modal-subtitle">{modal.action === "inscricao" ? "Documento padrao de 24 meses." : text(current?.aluno)}</div></div><button className="modal-close" type="button" onClick={() => setModal(null)} disabled={busy}>x</button></div><div className="modal-body">{modal.action === "inscricao" ? <div className="form-grid"><label className="form-label form-field-full">Aluno<select className="form-input" value={form.aluno_id} onChange={(event) => { const student = alunos.find((item) => studentId(item) === event.target.value); setForm({ ...form, aluno_id: event.target.value, valor_mensal: form.valor_mensal || text(student?.mensalidade || student?.valor_mensalidade || ""), curso: form.curso || text(student?.modalidade || student?.modulo) }); }}><option value="">Selecione o aluno</option>{alunos.map((student) => <option key={studentId(student)} value={studentId(student)}>{text(student.nome || student.name)}</option>)}</select></label><label className="form-label">Curso / modalidade<input className="form-input" value={form.curso} onChange={(event) => setForm({ ...form, curso: event.target.value })} /></label><label className="form-label">Inicio<input className="form-input" type="date" value={form.data_inicio} onChange={(event) => setForm({ ...form, data_inicio: event.target.value })} /></label><label className="form-label form-field-full">Valor mensal<input className="form-input" inputMode="decimal" placeholder="0,00" value={form.valor_mensal} onChange={(event) => setForm({ ...form, valor_mensal: event.target.value })} /></label><label className="form-label form-field-full">Observacoes<textarea className="form-input form-textarea" value={form.observacoes} onChange={(event) => setForm({ ...form, observacoes: event.target.value })} /></label></div> : <><div className="form-help" style={{ marginBottom: 14 }}>{modal.action === "cancelamento" ? <>Taxa estimada: <strong>{brl(preview?.fee)}</strong>, equivalente a 10% de {preview?.remaining} parcela(s) restante(s).</> : modal.action === "troca_modalidade" ? `Modalidade atual: ${text(current?.curso)}.` : "A desistencia fica registrada para analise administrativa."}</div>{modal.action === "troca_modalidade" && <label className="form-label">Nova modalidade<input className="form-input" value={form.nova_modalidade} onChange={(event) => setForm({ ...form, nova_modalidade: event.target.value })} placeholder="Informe a nova modalidade" /></label>}{modal.action === "cancelamento" && <label className="form-label">Vencimento da taxa<input className="form-input" type="date" value={form.vencimento} onChange={(event) => setForm({ ...form, vencimento: event.target.value })} /></label>}<label className="form-label">Motivo<textarea className="form-input form-textarea" value={form.motivo} onChange={(event) => setForm({ ...form, motivo: event.target.value })} /></label></>}{error && <div className="form-error">{error}</div>}</div><div className="modal-footer"><button className="btn btn-secondary" type="button" onClick={() => setModal(null)} disabled={busy}>Voltar</button><button className={`btn ${modal.action === "cancelamento" ? "btn-danger" : "btn-primary"}`} type="button" onClick={save} disabled={busy}>{busy ? "Salvando..." : submitText}</button></div></div></div>}
  </>;
}
