"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { financeMessage } from "@/lib/finance-message";
import { vipPackageStats } from "@/lib/course-modules";
import { EditarAlunoBtn } from "./aluno-modal";
import { AutoWhatsAppButton } from "./auto-whatsapp-button";
import { EditarLancamentoBtn, ImportarBoletoPdfBtn } from "./financeiro-modal";

type Aluno = {
  id?: string; nome?: string; name?: string; matricula?: string;
  turma?: string; classe?: string; livro?: string; book?: string;
  modulo?: string; modalidade?: string; vip_tipo_plano?: string;
  vip_aulas_total?: string | number; vip_aulas_restantes?: string | number;
  status?: string; situacao?: string; status_financeiro?: string; situacao_financeira?: string;
  responsavel?: unknown; responsavel_nome?: string; responsavel_telefone?: string;
  responsavel_email?: string; telefone?: string; whatsapp?: string; phone?: string;
  email?: string; login?: string; senha?: string; data_nascimento?: string;
  nascimento?: string; cpf?: string; rg?: string; genero?: string; idade?: string;
  endereco?: string; address?: string; rua?: string; numero?: string;
  complemento?: string; bairro?: string; cidade?: string; cep?: string;
  cidade_natal?: string; pais?: string; observacoes?: string; obs?: string;
  [k: string]: unknown;
};

type Recebimento = {
  id?: string; aluno?: string; nome?: string; aluno_id?: string; aluno_login?: string;
  descricao?: string; valor?: string | number; valor_parcela?: string | number;
  vencimento?: string; data_vencimento?: string; data_baixa?: string;
  status?: string; situacao?: string; forma_pagamento?: string;
  boleto_pdf_url?: string; boleto_status?: string; [k: string]: unknown;
};

type Frequencia = {
  id?: string; aluno?: string; aluno_id?: string; turma?: string;
  presente?: boolean; falta?: boolean; data?: string; materia?: string;
  licao_inicio?: string; licao_fim?: string; [k: string]: unknown;
};

type Certificado = {
  id?: string;
  aluno?: string;
  aluno_id?: string;
  aluno_login?: string;
  turma?: string;
  curso?: string;
  carga_horaria?: string;
  data_conclusao?: string;
  data_emissao?: string;
  certificado_codigo?: string;
  instrutor?: string;
  assinatura_digital?: boolean;
  assinatura_nome?: string;
  assinatura_cargo?: string;
  assinatura_hash?: string;
  assinatura_emitted_at?: string;
  [k: string]: unknown;
};

type DrawerTab = "perfil" | "financeiro" | "pedagogico";

function text(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const row = value as Record<string, unknown>;
    const extracted = row.nome || row.name || row.celular || row.telefone || row.email;
    return extracted ? String(extracted).trim() : "";
  }
  const s = String(value || "").trim();
  return s === "[object Object]" ? "" : s;
}

function parseValor(v: unknown) {
  return parseFloat(String(v || "0").replace(/[^\d.,-]/g, "").replace(",", ".")) || 0;
}

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nowReadable() {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());
}

function fmtDate(v: unknown) {
  const raw = text(v);
  if (!raw || raw === "-") return "-";
  if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString("pt-BR");
}

// Converts DD/MM/YYYY or ISO date to a sortable YYYY-MM-DD string
function toSortableDate(v: unknown): string {
  const raw = text(v);
  if (!raw) return "9999-99-99";
  if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) {
    const [d, m, y] = raw.slice(0, 10).split("/");
    return `${y}-${m}-${d}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "9999-99-99" : parsed.toISOString().slice(0, 10);
}

function isPago(f: Recebimento) {
  const s = text(f.status || f.situacao).toLowerCase();
  return s.includes("pago") || s.includes("baixado") || s.includes("liquidado");
}

function statusBadge(s: string) {
  const l = s.toLowerCase();
  if (l.includes("inativ") || l.includes("cancel")) return "neutral";
  if (l.includes("atenc") || l.includes("pendente")) return "warning";
  return "success";
}

function financBadge(s: string) {
  const l = s.toLowerCase();
  if (l.includes("atraso") || l.includes("vencido") || l.includes("inadim")) return "danger";
  if (l.includes("pendent") || l.includes("boleto") || l.includes("aberto")) return "warning";
  return "success";
}

function whatsappUrl(phone: unknown, message: string) {
  return "";
}

function LegacyAutoWhatsAppButton({ phone, message, label = "WhatsApp", className = "btn btn-secondary btn-sm", style }: { phone: unknown; message: string; label?: string; className?: string; style?: CSSProperties }) {
  const [sending, setSending] = useState(false);
  const [fallback, setFallback] = useState("");
  const telefone = text(phone);

  async function send() {
    if (!telefone || sending) return;
    setSending(true);
    setFallback("");
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefone, mensagem: message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setFallback(whatsappUrl(telefone, message));
        alert(`WhatsApp nao enviado automaticamente: ${String(data.status || data.error || "verifique a WAPI")}`);
      }
    } catch {
      setFallback(whatsappUrl(telefone, message));
      alert("Erro ao enviar WhatsApp automatico.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button className={className} style={style} type="button" onClick={send} disabled={!telefone || sending}>
        {sending ? "Enviando..." : label}
      </button>
    </>
  );
}

function printWindow(elementId: string, title = "Relatório — Ativo Educacional") {
  const el = document.getElementById(elementId);
  if (!el) return;
  const w = window.open("", "_blank", "width=960,height=700");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="utf-8"><title>${title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1e293b;background:#fff;padding:24px 32px;font-size:14px}
table{width:100%;border-collapse:collapse;font-size:13px}
thead tr{background:#0f172a!important;color:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
th{padding:9px 12px;text-align:left;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
td{padding:9px 12px}
tbody tr:nth-child(even){background:#f8fafc}
tbody tr{border-bottom:1px solid #e2e8f0}
tfoot tr:first-child{border-top:2px solid #0f172a}
@page{margin:15mm;size:A4}
@media print{body{padding:0}}
</style></head><body>${el.innerHTML}</body></html>`);
  w.document.close();
  setTimeout(() => { try { w.print(); } catch { /**/ } }, 400);
}

function faturaKeys(aluno: Aluno) {
  return [
    `id:${text(aluno.id).toLowerCase()}`,
    `cpf:${text(aluno.cpf).toLowerCase()}`,
    `nome:${text(aluno.nome || aluno.name).toLowerCase()}`,
    `login:${text(aluno.login).toLowerCase()}`,
  ].filter((k) => !k.endsWith(":"));
}

function vipLabel(aluno: Aluno) {
  const p = vipPackageStats(aluno);
  if (!p) return "";
  if (p.unlimited) return `${p.dadas} dadas · Sem limite`;
  return `${p.dadas}/${p.total} dadas · ${p.restantes} restantes`;
}

/* ── Envio de documento (recibo/relatorio) ── */
function assinaturaHashBase(aluno: Aluno, dataConclusao: string) {
  return [
    text(aluno.id || aluno.matricula || aluno.login || aluno.nome || aluno.name),
    dataConclusao || todayISO(),
    Date.now().toString().slice(-6),
  ].filter(Boolean).join("-").toUpperCase();
}

async function sendDoc(canal: "whatsapp" | "email" | "ambos", opts: { telefone?: string; email?: string; assunto?: string; mensagem: string }) {
  const res = await fetch("/api/financeiro/send-doc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ canal, ...opts }),
  });
  const data = await res.json().catch(() => ({})) as { ok?: boolean; results?: Record<string, string> };
  if (!res.ok || !data.ok) {
    const detail = data.results ? Object.entries(data.results).map(([k, v]) => `${k}: ${v}`).join(" | ") : "verifique configuracoes";
    alert(`Envio nao confirmado: ${detail}`);
  } else {
    const detail = data.results ? Object.entries(data.results).map(([k, v]) => `${k}: ${v}`).join(" | ") : "ok";
    alert(`Enviado! ${detail}`);
  }
}

/* ── Inline recibo ── */
function ReciboInline({ fatura, aluno, onClose }: { fatura: Recebimento; aluno: Aluno; onClose: () => void }) {
  const [sending, setSending] = useState<"" | "whatsapp" | "email" | "ambos">("");
  const nome = text(aluno.nome || aluno.name || "Aluno");
  const valor = parseValor(fatura.valor_parcela ?? fatura.valor);
  const dataBaixa = fatura.data_baixa ? fmtDate(fatura.data_baixa) : new Date().toLocaleDateString("pt-BR");
  const recNum = text(fatura.id || Date.now()).slice(-6).toUpperCase();
  const telefone = text(aluno.responsavel_telefone || aluno.telefone || aluno.whatsapp);
  const email = text(aluno.responsavel_email || aluno.email);

  const mensagemRecibo = [
    `✅ *Recibo de Pagamento — Ativo Educacional*`,
    `Recibo nº: ${recNum}`,
    `Data: ${dataBaixa}`,
    `Aluno: ${nome}`,
    `Referente: ${text(fatura.descricao || "Mensalidade / Serviços Educacionais")}`,
    `Valor recebido: ${formatBRL(valor)}`,
    ``,
    `Ativo Educacional — Este recibo confirma o pagamento do valor acima.`,
  ].join("\n");

  async function enviar(canal: "whatsapp" | "email" | "ambos") {
    setSending(canal);
    await sendDoc(canal, { telefone, email, assunto: `Recibo de Pagamento — ${nome}`, mensagem: mensagemRecibo });
    setSending("");
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <div className="modal-title">Recibo de Pagamento</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button className="btn btn-primary btn-sm" onClick={() => printWindow("recibo-print", "Recibo — Ativo Educacional")}>Imprimir</button>
            <button className="btn btn-secondary btn-sm" onClick={() => enviar("whatsapp")} disabled={!telefone || !!sending} title={!telefone ? "Sem telefone cadastrado" : ""}>{sending === "whatsapp" ? "Enviando..." : "WhatsApp"}</button>
            <button className="btn btn-secondary btn-sm" onClick={() => enviar("email")} disabled={!email || !!sending} title={!email ? "Sem e-mail cadastrado" : ""}>{sending === "email" ? "Enviando..." : "E-mail"}</button>
            <button className="modal-close" onClick={onClose}>
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
          </div>
        </div>
        <div className="modal-body" id="recibo-print">
          <div style={{ textAlign: "center", paddingBottom: 16, marginBottom: 16, borderBottom: "2px solid var(--border)" }}>
            <div style={{ fontWeight: 800, fontSize: "1.25rem", color: "var(--navy-900)" }}>Ativo Educacional</div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>Recibo de Pagamento</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px", marginBottom: 16 }}>
            <div><div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Recibo nº</div><div style={{ fontWeight: 700, fontFamily: "monospace" }}>{recNum}</div></div>
            <div><div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Data</div><div style={{ fontWeight: 700 }}>{dataBaixa}</div></div>
            <div style={{ gridColumn: "span 2" }}><div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Recebemos de</div><div style={{ fontWeight: 700, fontSize: "1rem" }}>{nome}</div></div>
            <div style={{ gridColumn: "span 2" }}><div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Referente a</div><div style={{ color: "var(--text-secondary)" }}>{text(fatura.descricao || "Mensalidade / Serviços Educacionais")}</div></div>
          </div>
          <div style={{ padding: "16px 20px", background: "rgba(5,150,105,0.06)", borderRadius: "var(--radius-lg)", border: "2px solid rgba(5,150,105,0.15)", textAlign: "center", marginBottom: 16 }}>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 6 }}>Valor Recebido</div>
            <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--green-700)" }}>{formatBRL(valor)}</div>
          </div>
          <div style={{ borderTop: "1px dashed var(--border)", paddingTop: 12, textAlign: "center", fontSize: "0.72rem", color: "var(--text-faint)" }}>
            Ativo Educacional {new Date().getFullYear()} — Este recibo confirma o pagamento do valor acima.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Relatório do aluno ── */
function RelatorioAlunoModal({ aluno, faturas: faturasRaw, onClose }: { aluno: Aluno; faturas: Recebimento[]; onClose: () => void }) {
  const [sending, setSending] = useState<"" | "whatsapp" | "email">("");
  const faturas = [...faturasRaw].sort((a, b) =>
    toSortableDate(a.vencimento || a.data_vencimento).localeCompare(toSortableDate(b.vencimento || b.data_vencimento))
  );
  const nome = text(aluno.nome || aluno.name || "Aluno");
  const total = faturas.reduce((s, f) => s + parseValor(f.valor_parcela ?? f.valor), 0);
  const totalPago = faturas.filter(isPago).reduce((s, f) => s + parseValor(f.valor_parcela ?? f.valor), 0);
  const telefone = text(aluno.responsavel_telefone || aluno.telefone || aluno.whatsapp);
  const email = text(aluno.responsavel_email || aluno.email);
  const hoje = new Date().toLocaleDateString("pt-BR");
  const datas = faturas.map((f) => text(f.vencimento || f.data_vencimento)).filter(Boolean).sort();
  const periodo = datas.length > 0 ? (datas.length === 1 ? fmtDate(datas[0]) : `${fmtDate(datas[0])} a ${fmtDate(datas[datas.length - 1])}`) : "";

  const mensagemRelatorio = [
    `📊 *Relatório Financeiro — Ativo Educacional*`,
    `Aluno: ${nome}`,
    periodo ? `Período: ${periodo}` : "",
    `Emissão: ${hoje}`,
    ``,
    `Total: ${formatBRL(total)}`,
    `Pago: ${formatBRL(totalPago)}`,
    `Em aberto: ${formatBRL(total - totalPago)}`,
  ].filter((l) => l !== undefined).join("\n");

  async function enviar(canal: "whatsapp" | "email") {
    setSending(canal);
    await sendDoc(canal, { telefone, email, assunto: `Relatório Financeiro — ${nome}`, mensagem: mensagemRelatorio });
    setSending("");
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 760, width: "95vw", maxHeight: "90vh", overflowY: "auto" }}>
        <div className="modal-header">
          <div className="modal-title">Relatório Financeiro do Aluno</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-primary btn-sm" onClick={() => printWindow("relatorio-professor-print", `Relatório — ${nome}`)}>Imprimir / PDF</button>
            <button className="btn btn-secondary btn-sm" onClick={() => enviar("whatsapp")} disabled={!telefone || !!sending} title={!telefone ? "Sem telefone cadastrado" : ""}>{sending === "whatsapp" ? "Enviando..." : "WhatsApp"}</button>
            <button className="btn btn-secondary btn-sm" onClick={() => enviar("email")} disabled={!email || !!sending} title={!email ? "Sem e-mail cadastrado" : ""}>{sending === "email" ? "Enviando..." : "E-mail"}</button>
            <button className="modal-close" onClick={onClose}>
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
          </div>
        </div>
        <div className="modal-body" id="relatorio-professor-print" style={{ padding: "24px 28px" }}>
          <div style={{ textAlign: "center", borderBottom: "3px solid var(--navy-900)", paddingBottom: 14, marginBottom: 20 }}>
            <div style={{ fontWeight: 900, fontSize: "1.4rem", color: "var(--navy-900)" }}>ATIVO EDUCACIONAL</div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em" }}>Extrato Financeiro do Aluno</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 20px", marginBottom: 20, padding: "14px 18px", background: "var(--surface-raised)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
            <div style={{ gridColumn: "span 2" }}><div style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Aluno</div><div style={{ fontWeight: 700, fontSize: "1.05rem" }}>{nome}</div></div>
            <div><div style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Emissão</div><div style={{ fontWeight: 600 }}>{hoje}</div></div>
            <div style={{ gridColumn: "span 2" }}><div style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Turma / Módulo</div><div style={{ fontWeight: 600 }}>{text(aluno.turma || aluno.classe || "-")} · {text(aluno.modulo || aluno.modalidade || "-")}</div></div>
            {periodo && <div><div style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Período</div><div style={{ fontWeight: 600 }}>{periodo}</div></div>}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", marginBottom: 20 }}>
            <thead>
              <tr style={{ background: "var(--navy-900)", color: "#fff" }}>
                {["Descrição","Vencimento","Valor","Status","Pago em"].map((h) => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, fontSize: "0.72rem", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {faturas.map((f, i) => (
                <tr key={text(f.id || i)} style={{ background: i % 2 === 0 ? "transparent" : "var(--surface-raised)", borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 12px" }}>{text(f.descricao || "Mensalidade")}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 600 }}>{fmtDate(f.vencimento || f.data_vencimento)}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 700 }}>{formatBRL(parseValor(f.valor_parcela ?? f.valor))}</td>
                  <td style={{ padding: "8px 12px" }}><span style={{ padding: "2px 8px", borderRadius: 4, fontSize: "0.72rem", fontWeight: 700, background: isPago(f) ? "rgba(5,150,105,0.12)" : "rgba(245,158,11,0.12)", color: isPago(f) ? "var(--green-700)" : "var(--gold-700)" }}>{text(f.status || f.situacao || "Pendente")}</span></td>
                  <td style={{ padding: "8px 12px", color: "var(--text-muted)", fontSize: "0.8rem" }}>{fmtDate(f.data_baixa) || "-"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid var(--navy-900)" }}>
                <td colSpan={2} style={{ padding: "10px 12px", fontWeight: 700 }}>Total</td>
                <td style={{ padding: "10px 12px", fontWeight: 800, fontSize: "1rem" }}>{formatBRL(total)}</td>
                <td colSpan={2} style={{ padding: "10px 12px" }}><span style={{ color: "var(--green-700)", fontWeight: 700 }}>Pago: {formatBRL(totalPago)}</span> · <span style={{ color: "var(--gold-700)", fontWeight: 700 }}>Em aberto: {formatBRL(total - totalPago)}</span></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ── Acesso do aluno ── */
function CertificadoConclusaoModal({ aluno, onClose }: { aluno: Aluno; onClose: () => void }) {
  const nome = text(aluno.nome || aluno.name || "Aluno");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [isError, setIsError] = useState(false);
  const [certificado, setCertificado] = useState<Certificado | null>(null);
  const [curso, setCurso] = useState("Curso de Ingles - Mister Wiz");
  const [cargaHoraria, setCargaHoraria] = useState("120 horas");
  const [dataConclusao, setDataConclusao] = useState(todayISO());
  const [dataEmissao, setDataEmissao] = useState(todayISO());
  const [instrutor, setInstrutor] = useState("Equipe Pedagogica Mister Wiz");
  const [assinaturaDigital, setAssinaturaDigital] = useState(true);
  const [assinaturaNome, setAssinaturaNome] = useState("Direcao Pedagogica Mister Wiz");
  const [assinaturaCargo, setAssinaturaCargo] = useState("Direcao Pedagogica");
  const [assinaturaHash, setAssinaturaHash] = useState(() => assinaturaHashBase(aluno, todayISO()));

  async function emitir() {
    setSaving(true);
    setFeedback("");
    setIsError(false);
    try {
      const res = await fetch("/api/certificados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aluno: nome,
          aluno_id: text(aluno.id),
          aluno_login: text(aluno.login),
          turma: text(aluno.turma || aluno.classe),
          curso,
          carga_horaria: cargaHoraria,
          data_conclusao: dataConclusao,
          data_emissao: dataEmissao,
          instrutor,
          assinatura_digital: assinaturaDigital,
          assinatura_nome: assinaturaDigital ? assinaturaNome : "",
          assinatura_cargo: assinaturaDigital ? assinaturaCargo : "",
          assinatura_hash: assinaturaDigital ? assinaturaHash : "",
          assinatura_emitted_at: assinaturaDigital ? new Date().toISOString() : "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setIsError(true);
        setFeedback(String(data.error || "Erro ao emitir certificado."));
        return;
      }
      setCertificado((data.certificado || null) as Certificado | null);
      setFeedback("Certificado emitido com sucesso.");
    } catch {
      setIsError(true);
      setFeedback("Erro ao emitir certificado.");
    } finally {
      setSaving(false);
    }
  }

  const assinaturaHashAtual = assinaturaDigital
    ? (certificado?.assinatura_hash ? text(certificado.assinatura_hash) : assinaturaHash)
    : "";

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 980, width: "95vw", maxHeight: "90vh", overflowY: "auto" }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Certificado de Conclusao</div>
            <div className="modal-subtitle">Mister Wiz - curso de ingles</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-primary btn-sm" onClick={emitir} disabled={saving}>
              {saving ? "Emitindo..." : "Emitir certificado"}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => printWindow("certificado-conclusao-print", `Certificado - ${nome}`)} disabled={!certificado}>
              Imprimir / PDF
            </button>
            <button className="modal-close" onClick={onClose}>
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
          </div>
        </div>
        <div className="modal-body" style={{ padding: "20px 24px" }}>
          {feedback && <div className={isError ? "form-error" : "form-success"} style={{ marginBottom: 12 }}>{feedback}</div>}
          <div className="form-grid" style={{ marginBottom: 18 }}>
            <div className="form-group form-group-span2">
              <label className="form-label">Aluno</label>
              <input className="form-input" value={nome} readOnly />
            </div>
            <div className="form-group">
              <label className="form-label">Curso</label>
              <input className="form-input" value={curso} onChange={(e) => setCurso(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Carga horaria</label>
              <input className="form-input" value={cargaHoraria} onChange={(e) => setCargaHoraria(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Data de conclusao</label>
              <input className="form-input" type="date" value={dataConclusao} onChange={(e) => {
                setDataConclusao(e.target.value);
                setAssinaturaHash(assinaturaHashBase(aluno, e.target.value));
              }} />
            </div>
            <div className="form-group">
              <label className="form-label">Data de emissao</label>
              <input className="form-input" type="date" value={dataEmissao} onChange={(e) => setDataEmissao(e.target.value)} />
            </div>
            <div className="form-group form-group-span2">
              <label className="form-label">Responsavel pela emissao</label>
              <input className="form-input" value={instrutor} onChange={(e) => setInstrutor(e.target.value)} />
            </div>
          </div>

          <div className="drawer-section" style={{ marginBottom: 18 }}>
            <div className="drawer-section-title">Assinatura digital</div>
            <div style={{ display: "grid", gap: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", fontWeight: 600 }}>
                <input type="checkbox" checked={assinaturaDigital} onChange={(e) => setAssinaturaDigital(e.target.checked)} />
                Incluir assinatura digital no certificado
              </label>
              {assinaturaDigital && (
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Nome da assinatura</label>
                    <input className="form-input" value={assinaturaNome} onChange={(e) => setAssinaturaNome(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Cargo</label>
                    <input className="form-input" value={assinaturaCargo} onChange={(e) => setAssinaturaCargo(e.target.value)} />
                  </div>
                  <div className="form-group form-group-span2">
                    <label className="form-label">Codigo/hash de validacao</label>
                    <input className="form-input" value={assinaturaHash} onChange={(e) => setAssinaturaHash(e.target.value.toUpperCase())} />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div id="certificado-conclusao-print" style={{ background: "#fff", border: "2px solid #d4af37", borderRadius: 16, padding: "36px 42px", boxShadow: "inset 0 0 0 6px rgba(212,175,55,0.12)" }}>
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <div style={{ fontSize: "0.86rem", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "#7c5d00", marginBottom: 8 }}>
                Mister Wiz
              </div>
              <div style={{ fontSize: "2rem", fontWeight: 900, color: "#0f172a", marginBottom: 8 }}>
                Certificado de Conclusao
              </div>
              <div style={{ fontSize: "0.95rem", color: "#475569" }}>
                Curso de Ingles
              </div>
            </div>

            <div style={{ textAlign: "center", marginBottom: 28, color: "#1e293b", lineHeight: 1.8 }}>
              Certificamos que <strong style={{ fontSize: "1.3rem" }}>{nome}</strong><br />
              concluiu com aproveitamento o <strong>{curso}</strong>,
              com carga horaria total de <strong>{cargaHoraria}</strong>,
              em <strong>{fmtDate(certificado?.data_conclusao || dataConclusao)}</strong>.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 26 }}>
              <div style={{ padding: "12px 14px", border: "1px solid #e2e8f0", borderRadius: 10 }}>
                <div style={{ fontSize: "0.7rem", textTransform: "uppercase", color: "#64748b", marginBottom: 4 }}>Aluno</div>
                <div style={{ fontWeight: 700 }}>{nome}</div>
              </div>
              <div style={{ padding: "12px 14px", border: "1px solid #e2e8f0", borderRadius: 10 }}>
                <div style={{ fontSize: "0.7rem", textTransform: "uppercase", color: "#64748b", marginBottom: 4 }}>Turma</div>
                <div style={{ fontWeight: 700 }}>{text(aluno.turma || aluno.classe || "-")}</div>
              </div>
              <div style={{ padding: "12px 14px", border: "1px solid #e2e8f0", borderRadius: 10 }}>
                <div style={{ fontSize: "0.7rem", textTransform: "uppercase", color: "#64748b", marginBottom: 4 }}>Data de emissao</div>
                <div style={{ fontWeight: 700 }}>{fmtDate(certificado?.data_emissao || dataEmissao)}</div>
              </div>
              <div style={{ padding: "12px 14px", border: "1px solid #e2e8f0", borderRadius: 10 }}>
                <div style={{ fontSize: "0.7rem", textTransform: "uppercase", color: "#64748b", marginBottom: 4 }}>Codigo do certificado</div>
                <div style={{ fontWeight: 700, fontFamily: "monospace" }}>{text(certificado?.certificado_codigo || "Sera gerado ao emitir")}</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: assinaturaDigital ? "1fr 1fr" : "1fr", gap: 24, alignItems: "end", marginTop: 40 }}>
              <div>
                <div style={{ borderTop: "1px solid #0f172a", paddingTop: 10, textAlign: "center" }}>
                  <div style={{ fontWeight: 700 }}>{instrutor}</div>
                  <div style={{ fontSize: "0.82rem", color: "#64748b" }}>Responsavel pela emissao</div>
                </div>
              </div>
              {assinaturaDigital && (
                <div>
                  <div style={{ borderTop: "1px solid #0f172a", paddingTop: 10, textAlign: "center" }}>
                    <div style={{ fontWeight: 700 }}>{certificado?.assinatura_nome ? text(certificado.assinatura_nome) : assinaturaNome}</div>
                    <div style={{ fontSize: "0.82rem", color: "#64748b" }}>
                      {certificado?.assinatura_cargo ? text(certificado.assinatura_cargo) : assinaturaCargo}
                    </div>
                    <div style={{ fontSize: "0.76rem", color: "#0f766e", marginTop: 8, fontFamily: "monospace" }}>
                      Assinatura digital: {assinaturaHashAtual}
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: 4 }}>
                      Emitida em {certificado?.assinatura_emitted_at ? fmtDate(certificado.assinatura_emitted_at) : nowReadable()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AcessoBox({ aluno }: { aluno: Aluno }) {
  const [login, setLogin] = useState(text(aluno.login));
  const [senha, setSenha] = useState(text(aluno.senha));
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const alunoRef = text(aluno.id || aluno.nome || aluno.name || aluno.login);

  async function salvar() {
    if (!login.trim() || senha.length < 4) { setFeedback("Login e senha (mín. 4 caracteres) são obrigatórios."); return; }
    setSaving(true);
    setFeedback("");
    const res = await fetch("/api/alunos/credenciais", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: alunoRef, login, senha }) });
    const d = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setFeedback(d.error || "Erro ao alterar acesso."); return; }
    setFeedback(d.whatsapp_enviado ? "Acesso atualizado e enviado automaticamente por WhatsApp." : `Acesso atualizado. WhatsApp nao enviado: ${d.whatsapp_status || "verifique a WAPI"}.`);
    const phone = text(aluno.responsavel_telefone || aluno.telefone || aluno.whatsapp || aluno.celular);
    const msg = `Olá, ${text(aluno.nome || aluno.name)}! Seu acesso ao portal Active Educacional foi atualizado.\n\nLogin: ${login}\nSenha: ${senha}\n\nGuarde esses dados com segurança.`;
  }

  return (
    <div>
      <div className="drawer-section-title">Acesso ao portal</div>
      <div className="form-grid" style={{ marginBottom: 12 }}>
        <div className="form-group"><label className="form-label">Login</label><input className="form-input" value={login} onChange={(e) => setLogin(e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Senha</label><input className="form-input" value={senha} onChange={(e) => setSenha(e.target.value)} /></div>
      </div>
      {feedback && <div className={feedback.includes("sucesso") ? "form-success" : "form-error"} style={{ marginBottom: 8 }}>{feedback}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-primary btn-sm" onClick={salvar} disabled={saving || !alunoRef}>{saving ? "Salvando..." : "Alterar acesso"}</button>
      </div>
    </div>
  );
}

/* ── Drawer principal ── */
function AlunoDrawer({
  aluno, faturas, frequencias, onClose, canManageAccess, canReversePayments,
}: {
  aluno: Aluno; faturas: Recebimento[]; frequencias: Frequencia[];
  onClose: () => void; canManageAccess: boolean; canReversePayments: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<DrawerTab>("perfil");
  const [reciboFatura, setReciboFatura] = useState<Recebimento | null>(null);
  const [showRelatorio, setShowRelatorio] = useState(false);
  const [showCertificado, setShowCertificado] = useState(false);
  const [baixaFatura, setBaixaFatura] = useState<Recebimento | null>(null);
  const [baixaForma, setBaixaForma] = useState("PIX");
  const [baixaData, setBaixaData] = useState(todayISO());
  const [baixaValor, setBaixaValor] = useState("");
  const [estornoFatura, setEstornoFatura] = useState<Recebimento | null>(null);
  const [estornoMotivo, setEstornoMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [isError, setIsError] = useState(false);
  const [showNovoLanc, setShowNovoLanc] = useState(false);
  const [lancCategoria, setLancCategoria] = useState("Mensalidade");
  const [lancDescricao, setLancDescricao] = useState("");
  const [lancValor, setLancValor] = useState(lancCategoria === "Mensalidade" ? text(aluno.valor_mensalidade) : "");
  const [lancVenc, setLancVenc] = useState(todayISO());
  const [lancParcelas, setLancParcelas] = useState("1");
  const [lancDiaVenc, setLancDiaVenc] = useState(text(aluno.dia_vencimento) || "10");
  const [lancMesInicio, setLancMesInicio] = useState(new Date().toISOString().slice(0, 7));
  const [lancNumMeses, setLancNumMeses] = useState("12");

  const nome = text(aluno.nome || aluno.name || "Aluno");
  const turma = text(aluno.turma || aluno.classe || "-");
  const livro = text(aluno.livro || aluno.book || "-");
  const modulo = text(aluno.modulo || aluno.modalidade || "-");
  const status = text(aluno.status || aluno.situacao || "Ativo");
  const responsavel = text(aluno.responsavel_nome || aluno.responsavel || "-");
  const telefone = text(aluno.responsavel_telefone || aluno.telefone || aluno.phone || aluno.celular || "-");
  const email = text(aluno.responsavel_email || aluno.email || "-");
  const enderecoFull = [text(aluno.rua), text(aluno.numero), text(aluno.complemento), text(aluno.bairro), text(aluno.cidade), text(aluno.cep)].filter(Boolean).join(", ") || text(aluno.endereco || aluno.address || "-");
  const vip = vipLabel(aluno);
  const hue = (nome.charCodeAt(0) * 137) % 360;
  const initials = nome.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  const totalAberto = faturas.filter((f) => !isPago(f)).reduce((s, f) => s + parseValor(f.valor_parcela ?? f.valor), 0);
  const totalPago = faturas.filter(isPago).reduce((s, f) => s + parseValor(f.valor_parcela ?? f.valor), 0);
  const financeiro = text(aluno.status_financeiro || aluno.situacao_financeira || (totalAberto > 0 ? "Pendente" : "Regular"));

  const faturasOrdenadas = useMemo(() => [...faturas].sort((a, b) => {
    const da = toSortableDate(a.vencimento || a.data_vencimento);
    const db = toSortableDate(b.vencimento || b.data_vencimento);
    return da.localeCompare(db);
  }), [faturas]);

  const freqAluno = useMemo(() => frequencias.filter((f) => {
    const fn = text(f.aluno).toLowerCase();
    const nl = nome.toLowerCase();
    return fn === nl || fn.includes(nl.split(" ")[0].toLowerCase());
  }), [frequencias, nome]);

  const totalPresencas = freqAluno.filter((f) => Boolean(f.presente)).length;
  const totalFaltas = freqAluno.filter((f) => Boolean(f.falta) || f.presente === false).length;

  async function darBaixa() {
    if (!baixaFatura?.id) return;
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/financeiro", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [baixaFatura.id], tipo: "recebimentos", data_baixa: baixaData, valor_pago: baixaValor || text(baixaFatura.valor_parcela ?? baixaFatura.valor), forma_pagamento: baixaForma }),
      });
      if (res.ok) {
        setBaixaFatura(null);
        setBaixaValor("");
        setMsg("Pagamento registrado!");
        setIsError(false);
        router.refresh();
      } else {
        const d = await res.json().catch(() => ({})) as { error?: string };
        setMsg(d.error || "Erro ao registrar baixa.");
        setIsError(true);
      }
    } catch {
      setMsg("Erro de conexao ao registrar baixa.");
      setIsError(true);
    } finally {
      setSaving(false);
    }
  }

  async function tirarBaixa() {
    if (!estornoFatura?.id) return;
    if (!estornoMotivo.trim()) {
      setMsg("Informe o motivo para tirar a baixa.");
      setIsError(true);
      return;
    }
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/financeiro", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: estornoFatura.id,
          tipo: "recebimentos",
          estorno: true,
          estorno_motivo: estornoMotivo,
        }),
      });
      if (res.ok) {
        setEstornoFatura(null);
        setEstornoMotivo("");
        setMsg("Baixa retirada. A fatura voltou para pendente.");
        setIsError(false);
        router.refresh();
      } else {
        const d = await res.json().catch(() => ({})) as { error?: string };
        setMsg(d.error || "Erro ao tirar baixa.");
        setIsError(true);
      }
    } catch {
      setMsg("Erro de conexao ao tirar baixa.");
      setIsError(true);
    } finally {
      setSaving(false);
    }
  }

  const MESES_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  async function criarLancamento() {
    if (!lancValor.trim()) { setMsg("Informe o valor."); setIsError(true); return; }
    setSaving(true);
    setMsg("");

    if (lancCategoria === "Mensalidade") {
      const dia = Math.max(1, Math.min(31, parseInt(lancDiaVenc) || 10));
      const numMeses = Math.max(1, Math.min(24, parseInt(lancNumMeses) || 12));
      const [anoIni, mesIni] = lancMesInicio.split("-").map(Number);
      const items = Array.from({ length: numMeses }, (_, i) => {
        const d = new Date(anoIni, mesIni - 1 + i, 1);
        const ano = d.getFullYear();
        const mes = d.getMonth();
        const diaEfetivo = Math.min(dia, new Date(ano, mes + 1, 0).getDate());
        const venc = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(diaEfetivo).padStart(2, "0")}`;
        return {
          aluno: nome, aluno_login: text(aluno.login),
          telefone: text(aluno.responsavel_telefone || aluno.telefone || aluno.whatsapp),
          email: text(aluno.responsavel_email || aluno.email),
          descricao: `Mensalidade ${MESES_PT[mes]}/${ano}`,
          categoria: "Mensalidade", valor: lancValor, valor_parcela: lancValor,
          vencimento: venc, data_vencimento: venc, status: "Pendente",
        };
      });
      const res = await fetch("/api/financeiro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "recebimentos", items }),
      });
      setSaving(false);
      if (res.ok) {
        const d = await res.json().catch(() => ({})) as { count?: number };
        setMsg(`${d.count || numMeses} mensalidade(s) gerada(s) com sucesso!`);
        setIsError(false);
        setShowNovoLanc(false);
        setLancValor("");
        router.refresh();
      } else {
        const d = await res.json().catch(() => ({})) as { error?: string };
        setMsg(d.error || "Erro ao gerar mensalidades.");
        setIsError(true);
      }
      return;
    }

    // Outros lançamentos (Material, Taxa, etc.)
    if (!lancVenc) { setSaving(false); setMsg("Informe o vencimento."); setIsError(true); return; }
    const res = await fetch("/api/financeiro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo_lancamento: "recebimentos",
        aluno: nome, aluno_login: text(aluno.login),
        telefone: text(aluno.responsavel_telefone || aluno.telefone || aluno.whatsapp),
        email: text(aluno.responsavel_email || aluno.email),
        descricao: lancDescricao || lancCategoria,
        categoria: lancCategoria,
        valor: lancValor, vencimento: lancVenc,
        parcelas: Number(lancParcelas) || 1, status: "Pendente",
      }),
    });
    setSaving(false);
    if (res.ok) {
      setMsg("Lançamento criado com sucesso!");
      setIsError(false);
      setShowNovoLanc(false);
      setLancValor("");
      setLancDescricao("");
      setLancParcelas("1");
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({})) as { error?: string };
      setMsg(d.error || "Erro ao criar lançamento.");
      setIsError(true);
    }
  }

  const tabs: { id: DrawerTab; label: string }[] = [
    { id: "perfil", label: "Perfil" },
    { id: "financeiro", label: `Financeiro (${faturas.length})` },
    { id: "pedagogico", label: "Pedagógico" },
  ];

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer drawer-wide">
        {/* Header */}
        <div className="drawer-header">
          <div className="drawer-title-row">
            <div className="avatar avatar-lg" style={{ background: `hsl(${hue},50%,42%)`, flexShrink: 0 }}>{initials}</div>
            <div style={{ minWidth: 0 }}>
              <h2 className="drawer-title">{nome}</h2>
              <p className="drawer-subtitle">{turma !== "-" ? `Turma ${turma}` : "Sem turma"} · {livro !== "-" ? livro : "Sem livro"}</p>
            </div>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="Fechar">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
          </button>
          <div className="drawer-badges">
            <span className={`badge badge-${statusBadge(status)}`}><span className="badge-dot" />{status}</span>
            <span className={`badge badge-${financBadge(financeiro)}`}><span className="badge-dot" />{financeiro}</span>
            {totalAberto > 0 && <span className="badge badge-warning" style={{ fontVariantNumeric: "tabular-nums" }}>{formatBRL(totalAberto)} em aberto</span>}
          </div>
        </div>

        {/* Tabs */}
        <div className="drawer-tabs">
          {tabs.map((t) => (
            <button key={t.id} className={`drawer-tab${tab === t.id ? " drawer-tab-active" : ""}`} onClick={() => { setTab(t.id); setMsg(""); }}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="drawer-body">
          {msg && <div className={isError ? "form-error" : "form-success"} style={{ margin: "0 0 14px" }}>{msg}</div>}

          {/* ── TAB: PERFIL ── */}
          {tab === "perfil" && (
            <>
              <div className="drawer-section">
                <div className="drawer-section-title">Dados pessoais</div>
                {[
                  ["Matrícula", text(aluno.matricula || "-")],
                  ["CPF", text(aluno.cpf || "-")],
                  ["RG", text(aluno.rg || "-")],
                  ["Gênero", text(aluno.genero || "-")],
                  ["Data de nascimento", fmtDate(aluno.data_nascimento || aluno.nascimento)],
                  ["Idade", text(aluno.idade || "-")],
                  ["Cidade natal", text(aluno.cidade_natal || "-")],
                  ["Endereço", enderecoFull],
                ].filter(([, v]) => v && v !== "-").map(([l, v]) => (
                  <div key={l} className="drawer-detail-row"><span className="drawer-detail-label">{l}</span><span className="drawer-detail-value">{v}</span></div>
                ))}
              </div>

              <div className="drawer-section">
                <div className="drawer-section-title">Responsável / Contato</div>
                {[
                  ["Nome", responsavel],
                  ["Telefone / WhatsApp", telefone],
                  ["E-mail", email],
                ].filter(([, v]) => v && v !== "-").map(([l, v]) => (
                  <div key={l} className="drawer-detail-row"><span className="drawer-detail-label">{l}</span><span className="drawer-detail-value">{v}</span></div>
                ))}
                {telefone !== "-" && <AutoWhatsAppButton phone={telefone} message={`Olá, ${responsavel !== "-" ? responsavel : nome}! Mensagem do Active Educacional.`} label="WhatsApp responsável" style={{ marginTop: 10 }} />}
              </div>

              <div className="drawer-section">
                <div className="drawer-section-title">Acadêmico</div>
                {[
                  ["Turma", turma],
                  ["Módulo", modulo],
                  ["Livro / Apostila", livro],
                  ["Plano VIP", text(aluno.vip_tipo_plano || "-")],
                  ["Saldo aulas VIP", vip],
                ].filter(([, v]) => v && v !== "-").map(([l, v]) => (
                  <div key={l} className="drawer-detail-row"><span className="drawer-detail-label">{l}</span><span className="drawer-detail-value">{v}</span></div>
                ))}
              </div>

              {text(aluno.observacoes || aluno.obs) && (
                <div className="drawer-section">
                  <div className="drawer-section-title">Observações</div>
                  <p className="drawer-obs">{text(aluno.observacoes || aluno.obs)}</p>
                </div>
              )}

              {canManageAccess && (
                <div className="drawer-section">
                  <AcessoBox aluno={aluno} />
                </div>
              )}
            </>
          )}

          {/* ── TAB: FINANCEIRO ── */}
          {tab === "financeiro" && (
            <>
              {/* Resumo */}
              <div className="metric-grid metric-grid-3" style={{ marginBottom: 16 }}>
                <div className="metric-card metric-card-gold" style={{ padding: "12px 14px" }}>
                  <div className="metric-label" style={{ fontSize: "0.72rem" }}>Em aberto</div>
                  <div className="metric-value" style={{ fontSize: "1.2rem" }}>{formatBRL(totalAberto)}</div>
                </div>
                <div className="metric-card metric-card-green" style={{ padding: "12px 14px" }}>
                  <div className="metric-label" style={{ fontSize: "0.72rem" }}>Pago</div>
                  <div className="metric-value" style={{ fontSize: "1.2rem" }}>{formatBRL(totalPago)}</div>
                </div>
                <div className="metric-card metric-card-blue" style={{ padding: "12px 14px" }}>
                  <div className="metric-label" style={{ fontSize: "0.72rem" }}>Faturas</div>
                  <div className="metric-value" style={{ fontSize: "1.2rem" }}>{faturas.length}</div>
                </div>
              </div>

              {/* Ações globais */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                <button className="btn btn-primary btn-sm" onClick={() => { setShowNovoLanc(!showNovoLanc); setMsg(""); }}>
                  {showNovoLanc ? "Cancelar lançamento" : "+ Novo lançamento"}
                </button>
                <ImportarBoletoPdfBtn alunoInicial={aluno} label="Anexar boleto PDF" className="btn btn-secondary btn-sm" />
                <button className="btn btn-secondary btn-sm" onClick={() => setShowRelatorio(true)}>
                  Relatório / imprimir
                </button>
              </div>

              {/* Form novo lançamento */}
              {showNovoLanc && (
                <div className="drawer-section" style={{ background: "var(--surface-raised)", borderRadius: "var(--radius-md)", padding: "16px", marginBottom: 16 }}>
                  <div className="drawer-section-title">Novo lançamento para {nome}</div>
                  <div className="form-grid" style={{ marginBottom: 12 }}>
                    <div className="form-group">
                      <label className="form-label">Categoria</label>
                      <select className="form-input" value={lancCategoria} onChange={(e) => {
                        const cat = e.target.value;
                        setLancCategoria(cat);
                        if (cat === "Mensalidade") setLancValor(text(aluno.valor_mensalidade));
                        else setLancValor("");
                      }}>
                        <option>Mensalidade</option><option>Material</option><option>Matrícula</option>
                        <option>Taxa</option><option>Rematrícula</option><option>Outros</option>
                      </select>
                    </div>

                    {lancCategoria === "Mensalidade" ? (
                      <>
                        <div className="form-group">
                          <label className="form-label">Valor da mensalidade (R$)</label>
                          <input className="form-input" inputMode="decimal" placeholder="299,00" value={lancValor} onChange={(e) => setLancValor(e.target.value)} />
                          <div className="form-help">Cadastrado no aluno: {text(aluno.valor_mensalidade) || "não informado"}</div>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Dia de vencimento</label>
                          <input className="form-input" type="number" min="1" max="31" placeholder="10" value={lancDiaVenc} onChange={(e) => setLancDiaVenc(e.target.value)} />
                          <div className="form-help">Todo mês neste dia. Meses com menos dias ajustam automaticamente.</div>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Mês de início</label>
                          <input className="form-input" type="month" value={lancMesInicio} onChange={(e) => setLancMesInicio(e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Gerar quantos meses</label>
                          <select className="form-input" value={lancNumMeses} onChange={(e) => setLancNumMeses(e.target.value)}>
                            {[1,2,3,4,5,6,7,8,9,10,11,12].map((n) => <option key={n} value={n}>{n} {n === 1 ? "mês" : "meses"}</option>)}
                          </select>
                          <div className="form-help">Serão geradas {lancNumMeses} cobrança(s) mensais com vencimento todo dia {lancDiaVenc}.</div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="form-group">
                          <label className="form-label">Descrição</label>
                          <input className="form-input" placeholder="Ex: Material livro 1" value={lancDescricao} onChange={(e) => setLancDescricao(e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Valor (R$)</label>
                          <input className="form-input" inputMode="decimal" placeholder="450,00" value={lancValor} onChange={(e) => setLancValor(e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Vencimento</label>
                          <input className="form-input" type="date" value={lancVenc} onChange={(e) => setLancVenc(e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Parcelas</label>
                          <select className="form-input" value={lancParcelas} onChange={(e) => setLancParcelas(e.target.value)}>
                            {[1,2,3,4,5,6,7,8,9,10,11,12].map((n) => <option key={n} value={n}>{n}x</option>)}
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={criarLancamento} disabled={saving}>
                    {saving ? "Gerando..." : lancCategoria === "Mensalidade" ? `Gerar ${lancNumMeses} mensalidade(s)` : "Criar lançamento"}
                  </button>
                </div>
              )}

              {/* Faturas */}
              {faturasOrdenadas.length === 0 ? (
                <div className="empty-state" style={{ padding: "24px 0" }}>
                  <div className="empty-title">Nenhuma fatura encontrada</div>
                  <p className="empty-desc">Use o botão "Novo lançamento" para criar uma cobrança.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {faturasOrdenadas.map((f, i) => {
                    const pago = isPago(f);
                    const valor = parseValor(f.valor_parcela ?? f.valor);
                    const boletoUrl = text(f.boleto_pdf_url) || (f.id ? `/api/financeiro/boleto?id=${text(f.id)}` : "");
                    const phone = text(aluno.responsavel_telefone || aluno.telefone || aluno.phone || aluno.celular || aluno.whatsapp);
                    const boletoMsg = `Olá! Segue boleto/fatura do Active Educacional.\n${text(f.descricao || "Mensalidade")}\nVencimento: ${fmtDate(f.vencimento || f.data_vencimento)}\nValor: ${formatBRL(valor)}`;
                    return (
                      <div key={text(f.id || i)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: pago ? "rgba(5,150,105,0.04)" : "var(--surface-raised)", borderRadius: "var(--radius-md)", border: `1px solid ${pago ? "rgba(5,150,105,0.15)" : "var(--border)"}` }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: 2 }}>{text(f.descricao || "Mensalidade")}</div>
                          <div style={{ display: "flex", gap: 10, fontSize: "0.78rem", color: "var(--text-muted)" }}>
                            <span>Venc.: <strong>{fmtDate(f.vencimento || f.data_vencimento)}</strong></span>
                            <span style={{ fontWeight: 700, color: pago ? "var(--green-700)" : "var(--navy-900)" }}>{formatBRL(valor)}</span>
                          </div>
                        </div>
                        <span className={`badge badge-${pago ? "success" : financBadge(text(f.status || f.situacao || "Pendente"))}`} style={{ flexShrink: 0 }}>
                          <span className="badge-dot" />{text(f.status || f.situacao || "Pendente")}
                        </span>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
                          <EditarLancamentoBtn lancamento={f} tipo="recebimentos" />
                          {!pago && (
                            <button className="btn btn-primary btn-sm" style={{ fontSize: "0.72rem" }} onClick={() => { setBaixaFatura(f); setBaixaValor(text(f.valor_parcela ?? f.valor)); }}>
                              Baixar
                            </button>
                          )}
                          {pago && (
                            <button className="btn btn-ghost btn-sm" style={{ fontSize: "0.72rem", color: "var(--blue-600)" }} onClick={() => setReciboFatura(f)}>
                              Recibo
                            </button>
                          )}
                          {pago && canReversePayments && (
                            <button className="btn btn-ghost btn-sm" style={{ fontSize: "0.72rem", color: "var(--red-700)" }} onClick={() => { setEstornoFatura(f); setEstornoMotivo(""); }}>
                              Tirar baixa
                            </button>
                          )}
                          {(boletoUrl || phone) && (
                            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                              {boletoUrl && (
                                <a
                                  className="btn btn-secondary btn-sm"
                                  style={{ fontSize: "0.72rem" }}
                                  href={boletoUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Boleto
                                </a>
                              )}
                              {phone && (
                                <AutoWhatsAppButton
                                  phone={phone}
                                  message={financeMessage(f, typeof window !== "undefined" ? window.location.origin : "").body}
                                  label="WhatsApp boleto"
                                  className="btn btn-secondary btn-sm"
                                  style={{ fontSize: "0.72rem", color: "var(--green-700)", borderColor: "rgba(5,150,105,0.24)" }}
                                />
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Modal baixa */}
              {baixaFatura && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setBaixaFatura(null)}>
                  <div className="modal-box" style={{ maxWidth: 500 }}>
                    <div className="modal-header">
                      <div><div className="modal-title">Registrar pagamento</div><div className="modal-subtitle">{text(baixaFatura.descricao || "Mensalidade")} — {nome}</div></div>
                      <button className="modal-close" onClick={() => setBaixaFatura(null)}><svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>
                    </div>
                    <div className="modal-body">
                      <div className="form-grid">
                        <div className="form-group"><label className="form-label">Valor pago (R$)</label><input className="form-input" inputMode="decimal" value={baixaValor} onChange={(e) => setBaixaValor(e.target.value)} /></div>
                        <div className="form-group"><label className="form-label">Data do pagamento</label><input className="form-input" type="date" value={baixaData} onChange={(e) => setBaixaData(e.target.value)} /></div>
                        <div className="form-group form-group-span2">
                          <label className="form-label">Forma de pagamento</label>
                          <select className="form-input" value={baixaForma} onChange={(e) => setBaixaForma(e.target.value)}>
                            <option>PIX</option><option>Boleto</option><option>Dinheiro</option><option>Cartão</option><option>TED</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="modal-footer">
                      <button className="btn btn-secondary" onClick={() => setBaixaFatura(null)}>Cancelar</button>
                      <button className="btn btn-primary" onClick={darBaixa} disabled={saving}>{saving ? "Salvando..." : "Confirmar baixa"}</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Modal tirar baixa */}
              {estornoFatura && (
                <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setEstornoFatura(null)}>
                  <div className="modal-box" style={{ maxWidth: 500 }}>
                    <div className="modal-header">
                      <div>
                        <div className="modal-title">Tirar baixa do pagamento</div>
                        <div className="modal-subtitle">{text(estornoFatura.descricao || "Mensalidade")} â€” {nome}</div>
                      </div>
                      <button className="modal-close" onClick={() => setEstornoFatura(null)}><svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>
                    </div>
                    <div className="modal-body">
                      <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.18)", color: "var(--red-700)", fontSize: "0.82rem", marginBottom: 12 }}>
                        Esta ação não apaga a fatura. Ela remove a baixa, volta o status para Pendente e registra auditoria.
                      </div>
                      <div className="form-group">
                        <label className="form-label">Motivo do estorno</label>
                        <textarea className="form-input form-textarea" rows={3} value={estornoMotivo} onChange={(e) => setEstornoMotivo(e.target.value)} placeholder="Ex: baixa feita na parcela errada" />
                      </div>
                    </div>
                    <div className="modal-footer">
                      <button className="btn btn-secondary" onClick={() => setEstornoFatura(null)} disabled={saving}>Cancelar</button>
                      <button className="btn btn-primary" onClick={tirarBaixa} disabled={saving || !estornoMotivo.trim()}>{saving ? "Salvando..." : "Confirmar estorno"}</button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── TAB: PEDAGÓGICO ── */}
          {tab === "pedagogico" && (
            <>
              <div className="drawer-section">
                <div className="drawer-section-title">Situação acadêmica</div>
                {[
                  ["Turma", turma],
                  ["Módulo", modulo],
                  ["Livro atual", livro],
                  ["Última lição", text(aluno.ultima_licao || aluno.licao_atual || "-")],
                  ["Plano VIP", vip || text(aluno.vip_tipo_plano || "-")],
                ].filter(([, v]) => v && v !== "-").map(([l, v]) => (
                  <div key={l} className="drawer-detail-row"><span className="drawer-detail-label">{l}</span><span className="drawer-detail-value">{v}</span></div>
                ))}
              </div>

              {freqAluno.length > 0 ? (
                <div className="drawer-section">
                  <div className="drawer-section-title">Frequência</div>
                  <div className="metric-grid metric-grid-3" style={{ marginBottom: 14 }}>
                    <div className="metric-card metric-card-green" style={{ padding: "10px 12px" }}>
                      <div className="metric-label" style={{ fontSize: "0.72rem" }}>Presenças</div>
                      <div className="metric-value" style={{ fontSize: "1.2rem" }}>{totalPresencas}</div>
                    </div>
                    <div className="metric-card metric-card-red" style={{ padding: "10px 12px" }}>
                      <div className="metric-label" style={{ fontSize: "0.72rem" }}>Faltas</div>
                      <div className="metric-value" style={{ fontSize: "1.2rem" }}>{totalFaltas}</div>
                    </div>
                    <div className="metric-card metric-card-blue" style={{ padding: "10px 12px" }}>
                      <div className="metric-label" style={{ fontSize: "0.72rem" }}>Frequência</div>
                      <div className="metric-value" style={{ fontSize: "1.2rem" }}>{freqAluno.length > 0 ? `${Math.round((totalPresencas / freqAluno.length) * 100)}%` : "-"}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {freqAluno.slice(-10).reverse().map((fr, i) => (
                      <div key={text(fr.id || i)} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 12px", background: "var(--surface-raised)", borderRadius: "var(--radius-md)", fontSize: "0.82rem" }}>
                        <span className={`badge badge-${fr.presente ? "success" : "danger"}`} style={{ flexShrink: 0 }}><span className="badge-dot" />{fr.presente ? "Presente" : "Falta"}</span>
                        <span style={{ flex: 1 }}>{text(fr.materia || "Aula")} {fr.licao_inicio ? `· ${text(fr.licao_inicio)}` : ""}</span>
                        <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>{fmtDate(fr.data)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="drawer-section">
                  <div className="drawer-section-title">Frequência</div>
                  <p className="drawer-obs">Nenhum registro de frequência encontrado para este aluno. Os registros são criados ao fechar aulas na aba Professores.</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="drawer-footer">
          <EditarAlunoBtn aluno={aluno} />
          <button className="btn btn-secondary btn-sm" onClick={() => setShowCertificado(true)}>
            Certificado Mister Wiz
          </button>
        </div>
      </div>

      {reciboFatura && <ReciboInline fatura={reciboFatura} aluno={aluno} onClose={() => setReciboFatura(null)} />}
      {showRelatorio && <RelatorioAlunoModal aluno={aluno} faturas={faturasOrdenadas} onClose={() => setShowRelatorio(false)} />}
      {showCertificado && <CertificadoConclusaoModal aluno={aluno} onClose={() => setShowCertificado(false)} />}
    </>
  );
}

/* ── Tabela principal ── */
export function AlunosSearchTable({
  alunos, recebimentos, frequencias = [], canManageAccess, canReversePayments,
}: {
  alunos: Aluno[];
  recebimentos: Recebimento[];
  frequencias?: Frequencia[];
  canManageAccess: boolean;
  canReversePayments: boolean;
}) {
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("Todos");
  const [filtroFinanceiro, setFiltroFinanceiro] = useState("Todos");
  const [filtroTurma, setFiltroTurma] = useState("Todas");
  const [alunoSelecionado, setAlunoSelecionado] = useState<Aluno | null>(null);

  const faturasPorAluno = useMemo(() => {
    const map = new Map<string, Recebimento[]>();
    for (const r of recebimentos) {
      const keys = [
        `id:${text(r.aluno_id).toLowerCase()}`,
        `nome:${text(r.aluno || r.nome).toLowerCase()}`,
        `login:${text(r.aluno_login).toLowerCase()}`,
      ].filter((k) => !k.endsWith(":"));
      for (const key of keys) {
        const list = map.get(key) || [];
        list.push(r);
        map.set(key, list);
      }
    }
    return map;
  }, [recebimentos]);

  function getFaturas(aluno: Aluno): Recebimento[] {
    const found = new Map<string, Recebimento>();
    for (const key of faturaKeys(aluno)) {
      for (const f of faturasPorAluno.get(key) || []) {
        found.set(text(f.id) || `${text(f.descricao)}-${text(f.vencimento || f.data_vencimento)}-${text(f.valor)}`, f);
      }
    }
    return Array.from(found.values());
  }

  const turmas = useMemo(() => {
    const set = new Set(alunos.map((a) => text(a.turma || a.classe)).filter(Boolean));
    return ["Todas", ...Array.from(set).sort()];
  }, [alunos]);

  const filtrados = useMemo(() => alunos.filter((a) => {
    const nome = text(a.nome || a.name).toLowerCase();
    const turma = text(a.turma || a.classe).toLowerCase();
    const resp = text(a.responsavel_nome || a.responsavel).toLowerCase();
    const mod = text(a.modulo || a.modalidade).toLowerCase();
    const status = text(a.status || a.situacao || "Ativo");
    const faturas = getFaturas(a);
    const totalAberto = faturas.filter((f) => !isPago(f)).reduce((s, f) => s + parseValor(f.valor_parcela ?? f.valor), 0);
    const financeiro = text(a.status_financeiro || a.situacao_financeira || (totalAberto > 0 ? "Pendente" : "Regular"));
    const q = busca.toLowerCase();
    return (
      (!busca || nome.includes(q) || turma.includes(q) || resp.includes(q) || mod.includes(q)) &&
      (filtroStatus === "Todos" || status.toLowerCase().includes(filtroStatus.toLowerCase())) &&
      (filtroFinanceiro === "Todos" ||
        (filtroFinanceiro === "Regular" && financBadge(financeiro) === "success") ||
        (filtroFinanceiro === "Inadimplente" && financBadge(financeiro) === "danger") ||
        (filtroFinanceiro === "Pendente" && financBadge(financeiro) === "warning")) &&
      (filtroTurma === "Todas" || text(a.turma || a.classe) === filtroTurma)
    );
  }), [alunos, busca, filtroStatus, filtroFinanceiro, filtroTurma, faturasPorAluno]);

  return (
    <>
      {alunoSelecionado && (
        <AlunoDrawer
          aluno={alunoSelecionado}
          faturas={getFaturas(alunoSelecionado)}
          frequencias={frequencias}
          canManageAccess={canManageAccess}
          canReversePayments={canReversePayments}
          onClose={() => setAlunoSelecionado(null)}
        />
      )}

      {/* Filtros */}
      <div className="card">
        <div className="toolbar">
          <div className="toolbar-left" style={{ flex: 1 }}>
            <div className="search-bar" style={{ flex: 1, maxWidth: 420 }}>
              <span className="search-icon">
                <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg>
              </span>
              <input className="search-input" placeholder="Buscar por nome, turma, módulo ou responsável..." value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
          </div>
          <div className="toolbar-right">
            <select className="filter-select" value={filtroTurma} onChange={(e) => setFiltroTurma(e.target.value)}>
              {turmas.map((t) => <option key={t}>{t}</option>)}
            </select>
            <select className="filter-select" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
              <option value="Todos">Qualquer status</option>
              <option>Ativo</option>
              <option>Inativo</option>
            </select>
            <select className="filter-select" value={filtroFinanceiro} onChange={(e) => setFiltroFinanceiro(e.target.value)}>
              <option value="Todos">Todo financeiro</option>
              <option>Regular</option>
              <option>Inadimplente</option>
              <option>Pendente</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="section-eyebrow">Lista de alunos</div>
            <h3 className="section-title">
              {filtrados.length === alunos.length ? `${alunos.length} alunos` : `${filtrados.length} de ${alunos.length} alunos`}
            </h3>
            <p className="section-subtitle">Clique em um aluno para ver ficha completa, financeiro e pedagógico</p>
          </div>
        </div>
        <div className="card-body" style={{ paddingTop: 12 }}>
          {filtrados.length === 0 ? (
            <div className="empty-state">
              <div className="empty-title">Nenhum aluno encontrado</div>
              <p className="empty-desc">Ajuste os filtros para ver mais resultados.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>Aluno</th>
                  <th>Turma</th>
                  <th>Módulo</th>
                  <th>Situação</th>
                  <th style={{ textAlign: "right" }}>Em aberto</th>
                  <th>Editar</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((a, i) => {
                  const nome = text(a.nome || a.name || `Aluno ${i + 1}`);
                  const turma = text(a.turma || a.classe || "—");
                  const modulo = text(a.modulo || a.modalidade || "—");
                  const status = text(a.status || a.situacao || "Ativo");
                  const resp = text(a.responsavel_nome || a.responsavel);
                  const faturas = getFaturas(a);
                  const totalAberto = faturas.filter((f) => !isPago(f)).reduce((s, f) => s + parseValor(f.valor_parcela ?? f.valor), 0);
                  const financeiro = text(a.status_financeiro || a.situacao_financeira || (totalAberto > 0 ? "Pendente" : "Regular"));
                  const hue = (nome.charCodeAt(0) * 137) % 360;
                  const initials = nome.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

                  return (
                    <tr key={text(a.id || i)} className="table-row-clickable" onClick={() => setAlunoSelecionado(a)}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div className="avatar avatar-sm" style={{ background: `hsl(${hue},50%,42%)`, flexShrink: 0 }}>{initials}</div>
                          <div>
                            <div className="table-name-primary">{nome}</div>
                            {resp && <div className="table-name-secondary">{resp}</div>}
                          </div>
                        </div>
                      </td>
                      <td style={{ fontWeight: 600 }}>{turma}</td>
                      <td style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>{modulo}</td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <span className={`badge badge-${statusBadge(status)}`}><span className="badge-dot" />{status}</span>
                          <span className={`badge badge-${financBadge(financeiro)}`}><span className="badge-dot" />{financeiro}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: totalAberto > 0 ? "var(--gold-700)" : "var(--green-700)", fontVariantNumeric: "tabular-nums" }}>
                        {totalAberto > 0 ? formatBRL(totalAberto) : "—"}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <EditarAlunoBtn aluno={a} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
