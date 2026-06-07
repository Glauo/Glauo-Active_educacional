"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { financeMessage } from "@/lib/finance-message";
import { BaixaBtn, EditarLancamentoBtn, EstornoBtn } from "./financeiro-modal";
import { FinanceiroFornecedores } from "./financeiro-fornecedores";
import { FinanceiroProfessorFechamento } from "./financeiro-professor-fechamento";
import { AutoWhatsAppButton } from "./auto-whatsapp-button";

type Lancamento = {
  id?: string;
  aluno?: string;
  nome?: string;
  descricao?: string;
  valor?: number | string;
  vencimento?: string;
  data_vencimento?: string;
  data_baixa?: string;
  status?: string;
  situacao?: string;
  tipo?: string;
  codigo?: string;
  professor?: string;
  professor_telefone?: string;
  turma?: string;
  data_aula?: string;
  horario?: string;
  local?: string;
  modulo?: string;
  licao_inicio?: string;
  licao_fim?: string;
  duracao_minutos?: number | string;
  forma_pagamento?: string;
  banco_destino?: string;
  [k: string]: unknown;
};

type Tab = "recebimentos" | "despesas" | "inadimplencia" | "professores" | "fornecedores" | "fechamentos" | "relatorio";

function parseValor(v: unknown): number {
  return parseFloat(String(v || "0").replace(/[^\d.,]/g, "").replace(",", ".")) || 0;
}

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function valorParcela(lancamento: Lancamento) {
  return parseValor(lancamento.valor_parcela ?? lancamento.valor ?? 0);
}

function statusBadge(s: string) {
  const l = s.toLowerCase();
  if (l.includes("pago") || l.includes("baixado") || l.includes("liquidado")) return "success";
  if (l.includes("atraso") || l.includes("vencido")) return "danger";
  if (l.includes("recus") || l.includes("cancel")) return "danger";
  if (l.includes("pendent") || l.includes("boleto")) return "warning";
  return "neutral";
}

function parseBRDate(v: string): Date {
  if (!v) return new Date(NaN);
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return new Date(v);
}

function fmtDate(v: string) {
  if (!v) return v;
  if (/^\d{2}\/\d{2}\/\d{4}/.test(v)) return v.substring(0, 10);
  const d = parseBRDate(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString("pt-BR");
}

function printWindow(elementId: string, title = "Relatório — Ativo Educacional") {
  const el = document.getElementById(elementId);
  if (!el) return;
  const w = window.open("", "_blank", "width=960,height=700");
  if (!w) { window.print(); return; }
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
.badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;text-transform:uppercase}
.badge-success{background:rgba(5,150,105,.12);color:#065f46}
.badge-warning{background:rgba(234,179,8,.12);color:#92400e}
@page{margin:15mm;size:A4}
@media print{body{padding:0}}
</style></head><body>${el.innerHTML}</body></html>`);
  w.document.close();
  setTimeout(() => { try { w.print(); } catch { /* ignore */ } }, 400);
}

function diasAtraso(lancamento: Lancamento) {
  const venc = String(lancamento.vencimento || lancamento.data_vencimento || "");
  const d = parseBRDate(venc);
  if (!venc || isNaN(d.getTime()) || statusBadge(String(lancamento.status || lancamento.situacao || "")) === "success") return 0;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((hoje.getTime() - d.getTime()) / 86400000));
}

function extra(row: unknown, key: string) {
  return (row as Record<string, unknown>)[key];
}

function isProfessorPayment(d: Lancamento) {
  const all = [d.aluno, d.nome, d.descricao, d.tipo, d.categoria, d.tipo_origem]
    .map((v) => String(v || "").toLowerCase())
    .join(" ");
  return all.includes("professor") || all.includes("salário") || all.includes("salario") || all.includes("docente") || all.includes("pagto prof") || all.includes("aula_professor");
}

function professorLabel(d: Lancamento) {
  return String(d.professor || d.aluno || d.nome || "Professor");
}

function whatsappUrl(phone: unknown, message: string) {
  return "";
}

function LegacyAutoWhatsAppButton({ phone, message, label = "WhatsApp" }: { phone: unknown; message: string; label?: string }) {
  const [sending, setSending] = useState(false);
  const [fallback, setFallback] = useState("");
  const telefone = String(phone || "").trim();

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
      <button className="btn btn-secondary btn-sm" type="button" onClick={send} disabled={!telefone || sending}>
        {sending ? "Enviando..." : label}
      </button>
    </>
  );
}

function boletoPdfHref(lancamento: Lancamento) {
  const id = String(lancamento.id || "").trim();
  const mercadoPagoHistory = Boolean(String(
    lancamento.mercado_pago_payment_id ||
    lancamento.mp_payment_id ||
    lancamento.mercado_pago_ticket_url ||
    lancamento.boleto_url ||
    lancamento.boleto_codigo ||
    ""
  ).trim());
  if (id && mercadoPagoHistory) return `/api/financeiro/boleto?id=${encodeURIComponent(id)}`;
  if (lancamento.boleto_pdf_b64 && lancamento.id) return `/api/financeiro/boleto-pdf?id=${encodeURIComponent(String(lancamento.id))}`;
  return String(lancamento.boleto_pdf_url || "");
}

function absoluteUrl(url: string) {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${url.startsWith("/") ? url : `/${url}`}`;
}

function shortPaymentId(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.length > 14 ? raw.slice(-14) : raw;
}

function boletoLink(lancamento: Lancamento) {
  const href = boletoPdfHref(lancamento);
  if (href) return absoluteUrl(href);
  const id = String(lancamento.id || "");
  return id ? absoluteUrl(`/api/financeiro/boleto?id=${encodeURIComponent(id)}`) : "";
}

function pixHref(lancamento: Lancamento) {
  const link = String(lancamento.pix_ticket_url || "").trim();
  if (link.startsWith("http")) return link;
  const id = String(lancamento.id || "");
  if (id && String(lancamento.pix_qr_code || "").trim()) return `/api/financeiro/pix?id=${encodeURIComponent(id)}`;
  return "";
}

function canOpenMercadoPagoCharge(lancamento: Lancamento) {
  return Boolean(String(lancamento.id || "").trim());
}

function financePhone(lancamento: Lancamento) {
  return String(
    lancamento.telefone ||
    lancamento.whatsapp ||
    lancamento.celular ||
    lancamento.aluno_telefone ||
    lancamento.phone ||
    lancamento.responsavel_telefone ||
    lancamento.telefone_responsavel ||
    lancamento.celular_responsavel ||
    lancamento.whatsapp_responsavel ||
    ""
  ).trim();
}

function financeEmail(lancamento: Lancamento) {
  return String(
    lancamento.email ||
    lancamento.aluno_email ||
    lancamento.responsavel_email ||
    lancamento.email_responsavel ||
    ""
  ).trim();
}

function boletoErrorMessage(data: Record<string, unknown>) {
  return [
    String(data.title || "Erro ao gerar boleto Mercado Pago"),
    String(data.error || "Nao foi possivel gerar o boleto."),
    String(data.detail || ""),
  ].filter(Boolean).join("\n");
}

function BoletoWhatsAppButton({ lancamento }: { lancamento: Lancamento }) {
  const [sending, setSending] = useState(false);
  const [currentLancamento, setCurrentLancamento] = useState<Lancamento>(lancamento);
  const phone = financePhone(currentLancamento);

  async function send() {
    if (sending) return;
    setSending(true);
    try {
      let current: Lancamento = currentLancamento;
      let currentPhone = financePhone(current);
      if (!String(current.mercado_pago_ticket_url || current.boleto_pdf_url || current.boleto_pdf_b64 || "").trim() || !currentPhone) {
        const hasMercadoPagoHistory = Boolean(String(
          current.mercado_pago_payment_id ||
          current.mp_payment_id ||
          current.mercado_pago_ticket_url ||
          current.boleto_url ||
          current.boleto_codigo ||
          ""
        ).trim());
        const res = await fetch(hasMercadoPagoHistory ? "/api/financeiro/regerar-boleto" : "/api/financeiro", {
          method: hasMercadoPagoHistory ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(hasMercadoPagoHistory ? { id: current.id } : { id: current.id, tipo: "recebimentos", gerar_boleto: true })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          alert(boletoErrorMessage(data));
          return;
        }
        current = ((data.resultados && Array.isArray(data.resultados) && data.resultados[0]?.boleto_url)
          ? { ...current, mercado_pago_ticket_url: data.resultados[0].boleto_url, boleto_url: data.resultados[0].boleto_url, boleto_pdf_url: data.resultados[0].boleto_url }
          : (data.lancamento || current)) as Lancamento;
        setCurrentLancamento(current);
        currentPhone = financePhone(current);
      }
      if (!currentPhone) {
        alert("WhatsApp nao encontrado no lancamento nem no cadastro do aluno.");
        return;
      }
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const link = boletoLink(current);
      const message = financeMessage({ ...current, mercado_pago_ticket_url: link }, origin).body;
      const sendRes = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefone: currentPhone, mensagem: message }),
      });
      const sendData = await sendRes.json().catch(() => ({}));
      if (!sendRes.ok || !sendData.ok) {
        alert(`WhatsApp nao enviado automaticamente: ${String(sendData.status || sendData.error || "verifique a WAPI")}`);
        return;
      }
      alert("Boleto enviado por WhatsApp.");
    } catch {
      alert("Erro ao enviar boleto por WhatsApp.");
    } finally {
      setSending(false);
    }
  }

  return (
    <button className="btn btn-secondary btn-sm" type="button" onClick={send} disabled={sending} title={!phone ? "Busca o WhatsApp no cadastro do aluno antes de enviar" : ""}>
      {sending ? "Enviando..." : "WhatsApp"}
    </button>
  );
}

/* ── Agrupamento por mês ── */
function mesKey(venc: string) {
  const d = parseBRDate(venc);
  if (isNaN(d.getTime())) return "sem-data";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function mesLabel(key: string) {
  if (key === "sem-data") return "Sem data de vencimento";
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function sortDateValue(value: unknown) {
  const date = parseBRDate(String(value || ""));
  return Number.isNaN(date.getTime()) ? Number.MAX_SAFE_INTEGER : date.getTime();
}

function groupByMes(items: Lancamento[]): { key: string; label: string; items: Lancamento[] }[] {
  const map = new Map<string, Lancamento[]>();
  for (const item of items) {
    const venc = String(item.vencimento || item.data_vencimento || "");
    const key = venc ? mesKey(venc) : "sem-data";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries())
    .map(([key, its]) => ({
      key,
      label: mesLabel(key),
      items: [...its].sort((a, b) => sortDateValue(a.vencimento || a.data_vencimento) - sortDateValue(b.vencimento || b.data_vencimento)),
    }))
    .sort((a, b) => {
      if (a.key === "sem-data") return 1;
      if (b.key === "sem-data") return -1;
      return a.key.localeCompare(b.key);
    });
}

function BoletoBtn({ lancamento }: { lancamento: Lancamento }) {
  const [loading, setLoading] = useState(false);
  const id = String(lancamento.id || "");
  const pdfHref = canOpenMercadoPagoCharge(lancamento) ? boletoPdfHref(lancamento) : "";
  const hasMercadoPagoHistory = Boolean(String(
    lancamento.mercado_pago_payment_id ||
    lancamento.mp_payment_id ||
    lancamento.mercado_pago_ticket_url ||
    lancamento.boleto_url ||
    lancamento.boleto_codigo ||
    ""
  ).trim());
  const openLabel = hasMercadoPagoHistory ? "Abrir boleto" : "Abrir PDF";

  async function gerar() {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(hasMercadoPagoHistory ? "/api/financeiro/regerar-boleto" : "/api/financeiro", {
        method: hasMercadoPagoHistory ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(hasMercadoPagoHistory ? { id } : { id, tipo: "recebimentos", gerar_boleto: true })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        alert(boletoErrorMessage(data));
        return;
      }
      const next = ((data.resultados && Array.isArray(data.resultados) && data.resultados[0]?.boleto_url)
        ? { ...lancamento, mercado_pago_ticket_url: data.resultados[0].boleto_url, boleto_url: data.resultados[0].boleto_url, boleto_pdf_url: data.resultados[0].boleto_url }
        : (data.lancamento || lancamento)) as Lancamento;
      window.open(boletoLink(next) || `/api/financeiro/boleto?id=${id}`, "_blank");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {pdfHref && <a className="btn btn-secondary btn-sm" href={pdfHref} target="_blank" rel="noreferrer">{openLabel}</a>}
      <button className="btn btn-secondary btn-sm" onClick={gerar} disabled={loading}>{loading ? "Gerando..." : "Gerar boleto MP"}</button>
      <BoletoWhatsAppButton lancamento={lancamento} />
    </>
  );
}

function PixBtn({ lancamento }: { lancamento: Lancamento }) {
  const [loading, setLoading] = useState(false);
  const id = String(lancamento.id || "");
  const href = canOpenMercadoPagoCharge(lancamento) ? pixHref(lancamento) : "";

  async function gerar() {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch("/api/financeiro/pix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        alert([
          String(data.title || "Erro ao gerar PIX Mercado Pago"),
          String(data.error || "Nao foi possivel gerar o PIX."),
          String(data.detail || ""),
        ].filter(Boolean).join("\n"));
        return;
      }
      const next = (data.lancamento || lancamento) as Lancamento;
      window.open(pixHref(next) || `/api/financeiro/pix?id=${encodeURIComponent(id)}`, "_blank");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {href && <a className="btn btn-secondary btn-sm" href={href} target="_blank" rel="noreferrer">Abrir Pix</a>}
      <button className="btn btn-secondary btn-sm" onClick={gerar} disabled={loading}>{loading ? "Gerando..." : "Gerar Pix MP"}</button>
    </>
  );
}

function VerificarPagamentoBtn({ lancamento }: { lancamento: Lancamento }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const id = String(lancamento.id || "");
  const paymentId = String(
    lancamento.mercado_pago_payment_id ||
    lancamento.mp_payment_id ||
    lancamento.boleto_codigo ||
    lancamento.pix_codigo ||
    ""
  ).trim();

  if (!id && !paymentId) return null;

  async function verificar() {
    setLoading(true);
    try {
      const res = await fetch("/api/financeiro/verificar-pagamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, payment_id: paymentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(String(data.error || "Nao foi possivel verificar o pagamento."));
        return;
      }
      alert(String(data.message || "Pagamento consultado com sucesso."));
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button className="btn btn-ghost btn-sm" type="button" onClick={verificar} disabled={loading}>
      {loading ? "Verificando..." : "Verificar pagamento"}
    </button>
  );
}

/* ── Recibo ── */
function ReciboModal({ lancamento, onClose }: { lancamento: Lancamento; onClose: () => void }) {
  const nome = String(lancamento.aluno || lancamento.nome || "Pagante");
  const descricao = String(lancamento.descricao || "");
  const valor = valorParcela(lancamento);
  const dataBaixa = lancamento.data_baixa
    ? fmtDate(String(lancamento.data_baixa))
    : new Date().toLocaleDateString("pt-BR");
  const recNum = String(lancamento.id || Date.now()).slice(-6).toUpperCase();

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <div className="modal-title">Recibo de Pagamento</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => printWindow("recibo-print", "Recibo — Ativo Educacional")}>
              <svg viewBox="0 0 20 20" fill="currentColor" width={14} height={14}>
                <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a1 1 0 001 1h8a1 1 0 001-1v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm0 8H6v4h8v-4h-7v1a1 1 0 102 0v-1z" clipRule="evenodd" />
              </svg>
              Imprimir
            </button>
            <button className="modal-close" onClick={onClose}>
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
          </div>
        </div>
        <div className="modal-body" id="recibo-print">
          <div style={{ textAlign: "center", paddingBottom: 20, marginBottom: 20, borderBottom: "2px solid var(--border)" }}>
            <div style={{ fontWeight: 800, fontSize: "1.375rem", color: "var(--navy-900)" }}>Ativo Educacional</div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 4 }}>Recibo de Pagamento</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 24px", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 4 }}>Recibo nº</div>
              <div style={{ fontWeight: 700, fontFamily: "monospace", fontSize: "1rem" }}>{recNum}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 4 }}>Data</div>
              <div style={{ fontWeight: 700 }}>{dataBaixa}</div>
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 4 }}>Recebemos de</div>
              <div style={{ fontWeight: 700, fontSize: "1.0625rem" }}>{nome}</div>
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 4 }}>Referente a</div>
              <div style={{ color: "var(--text-secondary)" }}>{descricao || "Mensalidade / Serviços Educacionais"}</div>
            </div>
          </div>
          <div style={{ padding: "20px 24px", background: "linear-gradient(135deg, rgba(5,150,105,0.06), rgba(5,150,105,0.02))", borderRadius: "var(--radius-lg)", border: "2px solid rgba(5,150,105,0.15)", textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>Valor Recebido</div>
            <div style={{ fontSize: "2.25rem", fontWeight: 800, color: "var(--green-700)", letterSpacing: "-0.03em" }}>{formatBRL(valor)}</div>
          </div>
          <div style={{ borderTop: "1px dashed var(--border)", paddingTop: 14, textAlign: "center" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-faint)" }}>Ativo Educacional {new Date().getFullYear()} - Sistema de Gestão Educacional</div>
            <div style={{ fontSize: "0.7rem", color: "var(--text-faint)", marginTop: 3 }}>Este recibo confirma o pagamento do valor acima especificado.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReciboBtn({ lancamento, label = "Recibo" }: { lancamento: Lancamento; label?: string }) {
  const [open, setOpen] = useState(false);
  const isPago = String(lancamento.status || "").toLowerCase().includes("pago") ||
    String(lancamento.status || "").toLowerCase().includes("baixado");
  if (!isPago) return null;
  return (
    <>
      <button className="btn btn-ghost btn-sm" style={{ fontSize: "0.72rem", color: "var(--blue-600)" }} onClick={() => setOpen(true)} title="Ver recibo">{label}</button>
      {open && <ReciboModal lancamento={lancamento} onClose={() => setOpen(false)} />}
    </>
  );
}

/* ── Relatório Detalhado do Professor ── */
function RelatorioDetalhadoProfModal({
  professor,
  aulas,
  onClose,
}: {
  professor: string;
  aulas: Lancamento[];
  onClose: () => void;
}) {
  const total = aulas.reduce((s, a) => s + parseValor(a.valor), 0);
  const totalPago = aulas.filter((a) => statusBadge(String(a.status || "")) === "success").reduce((s, a) => s + parseValor(a.valor), 0);
  const formaPagamento = aulas.find((a) => a.forma_pagamento)?.forma_pagamento || "";
  const banco = aulas.find((a) => a.banco_destino)?.banco_destino || "";
  const telefone = aulas.find((a) => a.professor_telefone)?.professor_telefone || "";
  const hoje = new Date().toLocaleDateString("pt-BR");
  const periodo = (() => {
    const datas = aulas
      .map((a) => String(a.data_aula || a.vencimento || a.data_vencimento || ""))
      .filter(Boolean)
      .sort();
    if (!datas.length) return "";
    return datas.length === 1 ? fmtDate(datas[0]) : `${fmtDate(datas[0])} a ${fmtDate(datas[datas.length - 1])}`;
  })();

  const aulasOrdenadas = [...aulas].sort((a, b) => {
    const da = String(a.data_aula || a.vencimento || "");
    const db = String(b.data_aula || b.vencimento || "");
    return da.localeCompare(db);
  });

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 820, width: "95vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div className="modal-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="modal-title">Relatório de Pagamento — Professor</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={() => printWindow("relatorio-professor-print", `Relatório — ${professor}`)}>
              <svg viewBox="0 0 20 20" fill="currentColor" width={14} height={14} style={{ marginRight: 4 }}>
                <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a1 1 0 001 1h8a1 1 0 001-1v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm0 8H6v4h8v-4h-7v1a1 1 0 102 0v-1z" clipRule="evenodd" />
              </svg>
              Imprimir / PDF
            </button>
            {telefone && <AutoWhatsAppButton phone={telefone} message={`Relatório de aulas — ${professor}\nPeríodo: ${periodo}\nTotal: ${formatBRL(total)}`} />}
            <button className="modal-close" onClick={onClose}>
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
          </div>
        </div>

        <div className="modal-body" id="relatorio-professor-print" style={{ padding: "28px 32px" }}>
          {/* Cabeçalho */}
          <div style={{ textAlign: "center", borderBottom: "3px solid var(--navy-900)", paddingBottom: 18, marginBottom: 24 }}>
            <div style={{ fontWeight: 900, fontSize: "1.5rem", color: "var(--navy-900)", letterSpacing: "-0.02em" }}>ATIVO EDUCACIONAL</div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.14em", marginTop: 4 }}>
              Relatório de Pagamento de Professor
            </div>
          </div>

          {/* Dados do professor */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px 24px", marginBottom: 24, padding: "16px 20px", background: "var(--surface-raised)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
            <div style={{ gridColumn: "span 2" }}>
              <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: 3 }}>Professor</div>
              <div style={{ fontWeight: 700, fontSize: "1.125rem", color: "var(--navy-900)" }}>{professor}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: 3 }}>Data de emissão</div>
              <div style={{ fontWeight: 600 }}>{hoje}</div>
            </div>
            {periodo && (
              <div style={{ gridColumn: "span 3" }}>
                <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: 3 }}>Período</div>
                <div style={{ fontWeight: 600, textTransform: "capitalize" }}>{periodo}</div>
              </div>
            )}
          </div>

          {/* Tabela de aulas */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, color: "var(--text-muted)", marginBottom: 10 }}>
              Detalhamento das Aulas
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ background: "var(--navy-900)", color: "#fff" }}>
                  <th style={{ padding: "9px 12px", textAlign: "left", fontWeight: 700, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>Data</th>
                  <th style={{ padding: "9px 12px", textAlign: "left", fontWeight: 700, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>Turma</th>
                  <th style={{ padding: "9px 12px", textAlign: "left", fontWeight: 700, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>Horário</th>
                  <th style={{ padding: "9px 12px", textAlign: "left", fontWeight: 700, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>Local</th>
                  <th style={{ padding: "9px 12px", textAlign: "left", fontWeight: 700, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>Lição / Módulo</th>
                  <th style={{ padding: "9px 12px", textAlign: "center", fontWeight: 700, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>Duração</th>
                  <th style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>Valor</th>
                  <th style={{ padding: "9px 12px", textAlign: "center", fontWeight: 700, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {aulasOrdenadas.map((a, i) => {
                  const dataAula = String(a.data_aula || a.vencimento || a.data_vencimento || "—");
                  const licao = [a.licao_inicio, a.licao_fim ? `a ${a.licao_fim}` : ""].filter(Boolean).join(" ") || String(a.modulo || a.descricao || "—");
                  const dur = a.duracao_minutos ? `${a.duracao_minutos} min` : "—";
                  const status = String(a.status || a.situacao || "Pendente");
                  const isPago = statusBadge(status) === "success";
                  return (
                    <tr key={String(a.id || i)} style={{ background: i % 2 === 0 ? "transparent" : "var(--surface-raised)", borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "9px 12px", fontWeight: 600 }}>{dataAula !== "—" ? fmtDate(dataAula) : "—"}</td>
                      <td style={{ padding: "9px 12px" }}>{String(a.turma || "—")}</td>
                      <td style={{ padding: "9px 12px" }}>{String(a.horario || "—")}</td>
                      <td style={{ padding: "9px 12px" }}>{String(a.local || "—")}</td>
                      <td style={{ padding: "9px 12px", color: "var(--text-secondary)" }}>{licao}</td>
                      <td style={{ padding: "9px 12px", textAlign: "center", color: "var(--text-secondary)" }}>{dur}</td>
                      <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700 }}>{formatBRL(parseValor(a.valor))}</td>
                      <td style={{ padding: "9px 12px", textAlign: "center" }}>
                        <span style={{
                          display: "inline-block", padding: "2px 8px", borderRadius: 99,
                          fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase",
                          background: isPago ? "rgba(5,150,105,0.12)" : "rgba(234,179,8,0.12)",
                          color: isPago ? "var(--green-700)" : "var(--gold-700)"
                        }}>
                          {isPago ? "Pago" : "Pendente"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--navy-900)" }}>
                  <td colSpan={6} style={{ padding: "10px 12px", fontWeight: 700, fontSize: "0.875rem" }}>Total geral ({aulasOrdenadas.length} aulas)</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 800, fontSize: "1rem", color: "var(--navy-900)" }}>{formatBRL(total)}</td>
                  <td />
                </tr>
                {totalPago > 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: "4px 12px", color: "var(--green-700)", fontSize: "0.82rem" }}>Já pago</td>
                    <td style={{ padding: "4px 12px", textAlign: "right", fontWeight: 700, color: "var(--green-700)", fontSize: "0.82rem" }}>{formatBRL(totalPago)}</td>
                    <td />
                  </tr>
                )}
                {total - totalPago > 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: "4px 12px", color: "var(--gold-700)", fontSize: "0.82rem" }}>Saldo a pagar</td>
                    <td style={{ padding: "4px 12px", textAlign: "right", fontWeight: 700, color: "var(--gold-700)", fontSize: "0.82rem" }}>{formatBRL(total - totalPago)}</td>
                    <td />
                  </tr>
                )}
              </tfoot>
            </table>
          </div>

          {/* Resumo e forma de pagamento */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 32 }}>
            <div style={{ padding: "16px 20px", background: "linear-gradient(135deg, rgba(5,150,105,0.07), rgba(5,150,105,0.02))", border: "1.5px solid rgba(5,150,105,0.18)", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: 8 }}>Valor Total a Receber</div>
              <div style={{ fontSize: "1.75rem", fontWeight: 900, color: "var(--green-700)", letterSpacing: "-0.03em" }}>{formatBRL(total)}</div>
              <div style={{ marginTop: 6, fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                {aulas.length} aulas · Período: {periodo || "—"}
              </div>
            </div>
            <div style={{ padding: "16px 20px", border: "1.5px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--surface-raised)" }}>
              <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: 8 }}>Forma de Pagamento</div>
              <div style={{ fontWeight: 600, fontSize: "0.9375rem", marginBottom: 4 }}>{formaPagamento || "—"}</div>
              {banco && <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>Banco / Destino: {banco}</div>}
            </div>
          </div>

          {/* Área de assinatura */}
          <div style={{ borderTop: "2px dashed var(--border)", paddingTop: 28, marginTop: 8 }}>
            <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: 20 }}>Confirmação e Assinatura</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "40px 48px" }}>
              <div>
                <div style={{ borderTop: "1.5px solid var(--text-secondary)", paddingTop: 8, marginTop: 52 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.82rem", color: "var(--navy-900)", marginBottom: 3 }}>Assinatura do Professor</div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Nome: {professor}</div>
                </div>
              </div>
              <div>
                <div style={{ borderTop: "1.5px solid var(--text-secondary)", paddingTop: 8, marginTop: 52 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.82rem", color: "var(--navy-900)", marginBottom: 3 }}>Assinatura — Ativo Educacional</div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Responsável Financeiro</div>
                </div>
              </div>
              <div>
                <div style={{ borderTop: "1.5px solid var(--border)", paddingTop: 8, marginTop: 0 }}>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Data: _______ / _______ / ___________</div>
                </div>
              </div>
              <div>
                <div style={{ borderTop: "1.5px solid var(--border)", paddingTop: 8, marginTop: 0 }}>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Data: _______ / _______ / ___________</div>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 24, textAlign: "center", fontSize: "0.68rem", color: "var(--text-faint)" }}>
              Ativo Educacional — Sistema de Gestão Educacional · Documento gerado em {hoje}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Tab: Recebimentos (agrupado por mês) ── */
function RecebimentosTab({ recebimentos, canReversePayments }: { recebimentos: Lancamento[]; canReversePayments: boolean }) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("Todos");
  const [filtroPeriodo, setFiltroPeriodo] = useState("Todos");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [excluindo, setExcluindo] = useState(false);
  const [erroExclusao, setErroExclusao] = useState("");

  function isMesAtual(v: string) { const d = parseBRDate(v), n = new Date(); return !isNaN(d.getTime()) && d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); }
  function isMesPassado(v: string) { const d = parseBRDate(v), n = new Date(), mp = new Date(n.getFullYear(), n.getMonth() - 1, 1); return !isNaN(d.getTime()) && d.getMonth() === mp.getMonth() && d.getFullYear() === mp.getFullYear(); }

  const filtrados = useMemo(() => recebimentos.filter((r) => {
    const nome = String(r.aluno || r.nome || r.descricao || "").toLowerCase();
    const status = String(r.status || r.situacao || "Pendente");
    const venc = String(r.vencimento || r.data_vencimento || "");
    const matchBusca = !busca || nome.includes(busca.toLowerCase()) || String(r.codigo || "").toLowerCase().includes(busca.toLowerCase());
    const matchStatus = filtroStatus === "Todos" ||
      (filtroStatus === "Em aberto" && statusBadge(status) !== "success") ||
      (filtroStatus === "Pago" && statusBadge(status) === "success") ||
      (filtroStatus === "Atrasado" && statusBadge(status) === "danger");
    const matchPeriodo = filtroPeriodo === "Todos" ||
      (filtroPeriodo === "Este mês" && venc && isMesAtual(venc)) ||
      (filtroPeriodo === "Mês passado" && venc && isMesPassado(venc));
    return matchBusca && matchStatus && matchPeriodo;
  }), [recebimentos, busca, filtroStatus, filtroPeriodo]);

  const grupos = useMemo(() => groupByMes(filtrados), [filtrados]);
  const totalGeral = filtrados.reduce((s, r) => s + valorParcela(r), 0);
  const idsExcluiveis = useMemo(() => filtrados
    .filter((r) => r.id && statusBadge(String(r.status || r.situacao || "")) !== "success")
    .map((r) => String(r.id)), [filtrados]);
  const selecionadosValidos = selecionados.filter((id) => idsExcluiveis.includes(id));
  const todosSelecionados = idsExcluiveis.length > 0 && idsExcluiveis.every((id) => selecionados.includes(id));

  function toggleSelecionado(id: string) {
    setSelecionados((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
    setErroExclusao("");
  }

  function toggleTodos() {
    setSelecionados(todosSelecionados ? [] : idsExcluiveis);
    setErroExclusao("");
  }

  async function excluirSelecionados() {
    const ids = selecionadosValidos;
    if (ids.length === 0) return;
    const msg = ids.length === 1
      ? "Excluir a parcela selecionada? Esta acao nao pode ser desfeita."
      : `Excluir ${ids.length} parcelas selecionadas? Esta acao nao pode ser desfeita.`;
    if (!confirm(msg)) return;

    setExcluindo(true);
    setErroExclusao("");
    const res = await fetch(`/api/financeiro?tipo=recebimentos&ids=${encodeURIComponent(ids.join(","))}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setExcluindo(false);
    if (!res.ok) {
      setErroExclusao(String(data.error || "Erro ao excluir parcelas selecionadas."));
      return;
    }
    setSelecionados([]);
    router.refresh();
  }

  return (
    <>
      <div className="card">
        <div className="toolbar">
          <div className="toolbar-left">
            <div className="search-bar">
              <span className="search-icon"><svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg></span>
              <input className="search-input" placeholder="Buscar aluno ou descrição..." value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
          </div>
          <div className="toolbar-right">
            <button className="btn btn-secondary btn-sm" onClick={toggleTodos} disabled={idsExcluiveis.length === 0}>
              {todosSelecionados ? "Limpar selecao" : "Selecionar abertas"}
            </button>
            <button className="btn btn-danger btn-sm" onClick={excluirSelecionados} disabled={excluindo || selecionadosValidos.length === 0}>
              {excluindo ? "Excluindo..." : `Excluir selecionadas${selecionadosValidos.length ? ` (${selecionadosValidos.length})` : ""}`}
            </button>
            <select className="filter-select" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
              <option value="Todos">Todos os status</option>
              <option>Em aberto</option>
              <option>Pago</option>
              <option>Atrasado</option>
            </select>
            <select className="filter-select" value={filtroPeriodo} onChange={(e) => setFiltroPeriodo(e.target.value)}>
              <option value="Todos">Todos os períodos</option>
              <option>Este mês</option>
              <option>Mês passado</option>
            </select>
          </div>
        </div>
        {erroExclusao && <div className="form-error" style={{ margin: "0 20px 16px" }}>{erroExclusao}</div>}
      </div>

      {grupos.length === 0 ? (
        <div className="card"><div className="card-body"><div className="empty-state"><div className="empty-title">Nenhum lançamento encontrado</div><p className="empty-desc">Ajuste os filtros para ver mais resultados.</p></div></div></div>
      ) : (
        grupos.map((grupo) => {
          const recebido = grupo.items.filter((r) => statusBadge(String(r.status || r.situacao || "")) === "success").reduce((s, r) => s + valorParcela(r), 0);
          const pendente = grupo.items.filter((r) => statusBadge(String(r.status || r.situacao || "")) !== "success").reduce((s, r) => s + valorParcela(r), 0);
          return (
            <div key={grupo.key} className="card" style={{ marginBottom: 4 }}>
              {/* Cabeçalho do mês */}
              <div style={{ padding: "14px 20px", background: "linear-gradient(90deg, var(--surface-raised), transparent)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 4, height: 32, background: "var(--blue-600)", borderRadius: 4 }} />
                  <div>
                    <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--navy-900)", textTransform: "capitalize" }}>{grupo.label}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>{grupo.items.length} lançamento{grupo.items.length !== 1 ? "s" : ""}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 16 }}>
                  {recebido > 0 && (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--green-700)", fontWeight: 700 }}>Recebido</div>
                      <div style={{ fontWeight: 800, color: "var(--green-700)", fontSize: "0.95rem" }}>{formatBRL(recebido)}</div>
                    </div>
                  )}
                  {pendente > 0 && (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--gold-700)", fontWeight: 700 }}>A receber</div>
                      <div style={{ fontWeight: 800, color: "var(--gold-700)", fontSize: "0.95rem" }}>{formatBRL(pendente)}</div>
                    </div>
                  )}
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", fontWeight: 700 }}>Total mês</div>
                    <div style={{ fontWeight: 800, fontSize: "0.95rem" }}>{formatBRL(recebido + pendente)}</div>
                  </div>
                </div>
              </div>
              <div className="card-body" style={{ paddingTop: 0, paddingBottom: 0 }}>
                <table className="data-table">
                  <thead><tr><th>Aluno / Descrição</th><th>Vencimento</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead>
                  <tbody>
                    {grupo.items.map((r, i) => {
                      const nome = String(r.aluno || r.nome || r.descricao || `Lançamento ${i + 1}`);
                      const venc = String(r.vencimento || r.data_vencimento || "—");
                      const status = String(r.status || r.situacao || "Pendente");
                      const atrasado = venc !== "—" && statusBadge(status) !== "success" && parseBRDate(venc) < new Date();
                      const id = String(r.id || "");
                      const podeExcluir = Boolean(id) && statusBadge(status) !== "success";
                      return (
                        <tr key={String(r.id || i)}>
                          <td>
                            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                              <input
                                type="checkbox"
                                aria-label={`Selecionar ${nome}`}
                                checked={id ? selecionados.includes(id) : false}
                                onChange={() => id && toggleSelecionado(id)}
                                disabled={!podeExcluir}
                                title={podeExcluir ? "Selecionar para excluir" : "Parcelas pagas exigem estorno"}
                              />
                              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 700 }}>Selecionar</span>
                            </label>
                            <div className="table-name-cell">
                              <span className="table-name-primary">{nome}</span>
                              {r.codigo && <span className="table-name-secondary">{String(r.codigo)}</span>}
                              {String(r.descricao || "") && String(r.descricao) !== nome && <span className="table-name-secondary">{String(r.descricao)}</span>}
                              {String(r.mercado_pago_payment_id || r.mp_payment_id || "").trim() && (
                                <span className="table-name-secondary">
                                  MP atual: {shortPaymentId(r.mercado_pago_payment_id || r.mp_payment_id)}
                                </span>
                              )}
                              {String(r.mercado_pago_previous_payment_id || "").trim() && (
                                <span className="table-name-secondary" style={{ color: "var(--text-muted)" }}>
                                  MP anterior: {shortPaymentId(r.mercado_pago_previous_payment_id)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td><span style={{ fontWeight: 600, color: atrasado ? "var(--red-600)" : "inherit" }}>{venc !== "—" ? fmtDate(venc) : "—"}{atrasado && " ⚠"}</span></td>
	                          <td><span style={{ fontWeight: 700, fontSize: "0.9375rem" }}>{formatBRL(valorParcela(r))}</span></td>
                          <td><span className={`badge badge-${statusBadge(status)}`}><span className="badge-dot" />{status}</span></td>
                          <td><div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}><BaixaBtn lancamento={r} tipo="recebimentos" /><BoletoBtn lancamento={r} /><PixBtn lancamento={r} /><VerificarPagamentoBtn lancamento={r} /><ReciboBtn lancamento={r} /><EstornoBtn lancamento={r} tipo="recebimentos" canReverse={canReversePayments} /><EditarLancamentoBtn lancamento={r} tipo="recebimentos" /></div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}

      {grupos.length > 1 && (
        <div className="card" style={{ background: "var(--surface-raised)" }}>
          <div className="card-body" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, color: "var(--text-secondary)" }}>Total geral — {filtrados.length} lançamentos em {grupos.length} meses</span>
            <span style={{ fontWeight: 800, fontSize: "1.0625rem" }}>{formatBRL(totalGeral)}</span>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Tab: Despesas ── */
function DespesasTab({ despesas, canReversePayments }: { despesas: Lancamento[]; canReversePayments: boolean }) {
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("Todos");

  const filtrados = useMemo(() => despesas.filter((d) => {
    const nome = String(d.aluno || d.nome || d.descricao || "").toLowerCase();
    const status = String(d.status || d.situacao || "Pendente");
    const matchBusca = !busca || nome.includes(busca.toLowerCase());
    const matchStatus = filtroStatus === "Todos" ||
      (filtroStatus === "Em aberto" && statusBadge(status) !== "success") ||
      (filtroStatus === "Pago" && statusBadge(status) === "success");
    return matchBusca && matchStatus;
  }), [despesas, busca, filtroStatus]);

  const total = filtrados.reduce((s, d) => s + parseValor(d.valor), 0);

  return (
    <>
      <div className="card">
        <div className="toolbar">
          <div className="toolbar-left">
            <div className="search-bar">
              <span className="search-icon"><svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg></span>
              <input className="search-input" placeholder="Buscar fornecedor ou despesa..." value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
          </div>
          <div className="toolbar-right">
            <select className="filter-select" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
              <option value="Todos">Todos</option>
              <option>Em aberto</option>
              <option>Pago</option>
            </select>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="section-eyebrow">Despesas</div>
            <h3 className="section-title">Custos e pagamentos</h3>
            <p className="section-subtitle">{filtrados.length} de {despesas.length} lançamentos</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: 2 }}>Total filtrado</div>
            <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--red-700)" }}>{formatBRL(total)}</div>
          </div>
        </div>
        <div className="card-body" style={{ paddingTop: 12 }}>
          {filtrados.length === 0 ? (
            <div className="empty-state"><div className="empty-title">Nenhuma despesa encontrada</div><p className="empty-desc">Cadastre despesas com "Novo lançamento → Despesa".</p></div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Fornecedor / Descrição</th><th>Vencimento</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead>
              <tbody>
                {filtrados.map((d, i) => {
                  const nome = String(d.aluno || d.nome || d.descricao || `Despesa ${i + 1}`);
                  const venc = String(d.vencimento || d.data_vencimento || "—");
                  const status = String(d.status || d.situacao || "Pendente");
                  const atrasado = venc !== "—" && statusBadge(status) !== "success" && parseBRDate(venc) < new Date();
                  return (
                    <tr key={String(d.id || i)}>
                      <td>
                        <div className="table-name-cell">
                          <span className="table-name-primary">{nome}</span>
                          {String(d.descricao || "") && String(d.descricao) !== nome && <span className="table-name-secondary">{String(d.descricao)}</span>}
                        </div>
                      </td>
                      <td><span style={{ fontWeight: 600, color: atrasado ? "var(--red-600)" : "inherit" }}>{venc !== "—" ? fmtDate(venc) : "—"}{atrasado && " ⚠"}</span></td>
                      <td><span style={{ fontWeight: 700, color: "var(--red-700)" }}>{formatBRL(parseValor(d.valor))}</span></td>
                      <td><span className={`badge badge-${statusBadge(status)}`}><span className="badge-dot" />{status}</span></td>
                      <td><div style={{ display: "flex", gap: 4 }}><BaixaBtn lancamento={d} tipo="despesas" /><EstornoBtn lancamento={d} tipo="despesas" canReverse={canReversePayments} /><EditarLancamentoBtn lancamento={d} tipo="despesas" /></div></td>
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

/* ── Baixa em massa para um professor ── */
function BaixaMassaBtn({ profNome, aulas, onDone }: { profNome: string; aulas: Lancamento[]; onDone: () => void }) {
  const router = useRouter();
  const pendentes = aulas.filter((a) => statusBadge(String(a.status || "")) !== "success");
  const totalPendente = pendentes.reduce((s, a) => s + parseValor(a.valor), 0);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState({
    data_baixa: new Date().toISOString().slice(0, 10),
    forma_pagamento: "PIX",
    banco_destino: "",
    observacao_baixa: "",
  });

  if (pendentes.length === 0) return null;

  async function confirmar() {
    setSaving(true);
    setErro("");
    try {
      const res = await fetch("/api/financeiro", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: pendentes.map((a) => String(a.id)).filter(Boolean),
          tipo: "despesas",
          ...form,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(String(data.error || "Erro ao processar.")); setSaving(false); return; }
      setOpen(false);
      onDone();
      router.refresh();
    } catch { setErro("Erro de conexão. Tente novamente."); }
    setSaving(false);
  }

  return (
    <>
      <button
        className="btn btn-success btn-sm"
        onClick={() => setOpen(true)}
        title={`Pagar ${pendentes.length} aulas pendentes de ${profNome}`}
        style={{ background: "var(--green-700)", color: "#fff", border: "none" }}
      >
        Pagar tudo ({pendentes.length})
      </button>
      {open && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal-box" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Baixa em massa — {profNome}</div>
                <div className="modal-subtitle">{pendentes.length} aulas pendentes · Total: {formatBRL(totalPendente)}</div>
              </div>
              <button className="modal-close" onClick={() => setOpen(false)}>
                <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              </button>
            </div>
            <div className="modal-body">
              {/* Resumo */}
              <div style={{ padding: "12px 16px", background: "rgba(5,150,105,0.06)", border: "1.5px solid rgba(5,150,105,0.2)", borderRadius: "var(--radius-md)", marginBottom: 20 }}>
                <div style={{ fontWeight: 700, color: "var(--green-700)", marginBottom: 6 }}>Confirmação de pagamento</div>
                <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  Todas as <strong>{pendentes.length} aulas pendentes</strong> de <strong>{profNome}</strong> serão marcadas como <strong>Pagas</strong>.
                  <br />Valor total: <strong style={{ color: "var(--green-700)" }}>{formatBRL(totalPendente)}</strong>
                </div>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Data do pagamento</label>
                  <input className="form-input" type="date" value={form.data_baixa} onChange={(e) => setForm((p) => ({ ...p, data_baixa: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Forma de pagamento</label>
                  <select className="form-input" value={form.forma_pagamento} onChange={(e) => setForm((p) => ({ ...p, forma_pagamento: e.target.value }))}>
                    <option>PIX</option><option>Boleto</option><option>Dinheiro</option>
                    <option>Cartao</option><option>TED</option><option>Cheque</option>
                  </select>
                </div>
                <div className="form-group form-group-span2">
                  <label className="form-label">Banco / conta destino</label>
                  <input className="form-input" placeholder="Ex: Nubank, Conta 001" value={form.banco_destino} onChange={(e) => setForm((p) => ({ ...p, banco_destino: e.target.value }))} />
                </div>
                <div className="form-group form-group-span2">
                  <label className="form-label">Observação</label>
                  <textarea className="form-input form-textarea" rows={2} placeholder="Opcional" value={form.observacao_baixa} onChange={(e) => setForm((p) => ({ ...p, observacao_baixa: e.target.value }))} />
                </div>
              </div>
              {erro && <div className="form-error" style={{ marginTop: 8 }}>{erro}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setOpen(false)} disabled={saving}>Cancelar</button>
              <button className="btn btn-primary" onClick={confirmar} disabled={saving} style={{ background: "var(--green-700)", borderColor: "var(--green-700)" }}>
                {saving ? "Processando..." : `Confirmar pagamento — ${formatBRL(totalPendente)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Tab: Pagamento Professores (por nome do professor) ── */
function ProfessoresAulasTab({ despesas, canReversePayments }: { despesas: Lancamento[]; canReversePayments: boolean }) {
  const [professor, setProfessor] = useState("todos");
  const [relatorioAberto, setRelatorioAberto] = useState(false);

  const profDespesas = useMemo(() => despesas.filter(isProfessorPayment), [despesas]);
  const professores = useMemo(() => Array.from(new Set(profDespesas.map(professorLabel))).sort(), [profDespesas]);
  const filtradas = professor === "todos" ? profDespesas : profDespesas.filter((d) => professorLabel(d) === professor);

  const total = filtradas.reduce((s, d) => s + parseValor(d.valor), 0);
  const totalPago = filtradas.filter((d) => statusBadge(String(d.status || "")) === "success").reduce((s, d) => s + parseValor(d.valor), 0);

  const porProfessor = useMemo(() => {
    const map = new Map<string, Lancamento[]>();
    for (const d of filtradas) {
      const p = professorLabel(d);
      if (!map.has(p)) map.set(p, []);
      map.get(p)!.push(d);
    }
    return Array.from(map.entries()).map(([nome, aulas]) => ({ nome, aulas })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [filtradas]);

  const [relatorioProf, setRelatorioProf] = useState<string | null>(null);

  return (
    <>
      <div className="metric-grid metric-grid-3">
        <div className="metric-card metric-card-gold">
          <div className="metric-icon metric-icon-gold"><svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg></div>
          <div className="metric-label">Professores</div>
          <div className="metric-value">{porProfessor.length}</div>
          <div className="metric-note">{filtradas.length} lançamentos</div>
        </div>
        <div className="metric-card metric-card-green">
          <div className="metric-icon metric-icon-green"><svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg></div>
          <div className="metric-label">Pago</div>
          <div className="metric-value" style={{ fontSize: "1.5rem" }}>{formatBRL(totalPago)}</div>
          <div className="metric-note">Pagamentos confirmados</div>
        </div>
        <div className="metric-card metric-card-red">
          <div className="metric-icon metric-icon-red"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" /><path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9z" clipRule="evenodd" /></svg></div>
          <div className="metric-label">Em aberto</div>
          <div className="metric-value" style={{ fontSize: "1.5rem" }}>{formatBRL(total - totalPago)}</div>
          <div className="metric-note">Aguardando pagamento</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="section-eyebrow">Professores</div>
            <h3 className="section-title">Pagamento de professores</h3>
            <p className="section-subtitle">{porProfessor.length} professor(es) · {filtradas.length} lançamentos</p>
          </div>
          <div className="toolbar" style={{ flexWrap: "wrap" }}>
            <select className="form-input" value={professor} onChange={(e) => setProfessor(e.target.value)} style={{ minWidth: 220 }}>
              <option value="todos">Todos os professores</option>
              {professores.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            {professor !== "todos" && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => { setRelatorioProf(professor); setRelatorioAberto(true); }}
              >
                Relatório Detalhado
              </button>
            )}
          </div>
        </div>

        <div className="card-body" style={{ paddingTop: 0 }}>
          {filtradas.length === 0 ? (
            <div className="empty-state">
              <div className="empty-title">Nenhum pagamento de professor encontrado</div>
              <p className="empty-desc">Ao fechar uma aula, o pagamento do professor aparece aqui automaticamente.</p>
            </div>
          ) : (
            porProfessor.map(({ nome: profNome, aulas }) => {
              const totalProf = aulas.reduce((s, a) => s + parseValor(a.valor), 0);
              const pagoProf = aulas.filter((a) => statusBadge(String(a.status || "")) === "success").reduce((s, a) => s + parseValor(a.valor), 0);
              const telefone = aulas.find((a) => a.professor_telefone)?.professor_telefone;

              return (
                <div key={profNome} style={{ marginBottom: 28 }}>
                  {/* Cabeçalho do professor */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "var(--surface-raised)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, var(--blue-600), var(--navy-900))", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: "1rem" }}>
                        {profNome.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--navy-900)" }}>{profNome}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{aulas.length} aula{aulas.length !== 1 ? "s" : ""} · Pago: {formatBRL(pagoProf)} · Em aberto: {formatBRL(totalProf - pagoProf)}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div style={{ fontWeight: 800, fontSize: "1.0625rem", color: "var(--navy-900)" }}>{formatBRL(totalProf)}</div>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => { setRelatorioProf(profNome); setRelatorioAberto(true); }}
                        title="Ver relatório detalhado com assinatura"
                      >
                        Relatório
                      </button>
                      <BaixaMassaBtn profNome={profNome} aulas={aulas} onDone={() => { /* router.refresh() called inside */ }} />
                      {telefone && <AutoWhatsAppButton phone={telefone} message={`Olá ${profNome}! Segue resumo do seu pagamento:\nAulas: ${aulas.length}\nTotal: ${formatBRL(totalProf)}\nPago: ${formatBRL(pagoProf)}\nEm aberto: ${formatBRL(totalProf - pagoProf)}`} />}
                    </div>
                  </div>

                  {/* Tabela de aulas do professor */}
                  <table className="data-table" style={{ marginBottom: 0 }}>
                    <thead>
                      <tr>
                        <th>Data da Aula</th>
                        <th>Turma</th>
                        <th>Horário</th>
                        <th>Lição / Módulo</th>
                        <th>Duração</th>
                        <th>Valor</th>
                        <th>Status</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...aulas].sort((a, b) => String(a.data_aula || a.vencimento || "").localeCompare(String(b.data_aula || b.vencimento || ""))).map((d, i) => {
                        const dataAula = String(d.data_aula || d.vencimento || d.data_vencimento || "—");
                        const licao = [d.licao_inicio, d.licao_fim ? `a ${d.licao_fim}` : ""].filter(Boolean).join(" ") || String(d.modulo || d.descricao || "—");
                        const dur = d.duracao_minutos ? `${d.duracao_minutos} min` : "—";
                        const status = String(d.status || d.situacao || "Pendente");
                        return (
                          <tr key={String(d.id || i)}>
                            <td style={{ fontWeight: 600 }}>{dataAula !== "—" ? fmtDate(dataAula) : "—"}</td>
                            <td>{String(d.turma || "—")}</td>
                            <td>{String(d.horario || "—")}</td>
                            <td style={{ color: "var(--text-secondary)" }}>{licao}</td>
                            <td style={{ color: "var(--text-secondary)" }}>{dur}</td>
                            <td><span style={{ fontWeight: 700 }}>{formatBRL(parseValor(d.valor))}</span></td>
                            <td><span className={`badge badge-${statusBadge(status)}`}><span className="badge-dot" />{status}</span></td>
                            <td>
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                <BaixaBtn lancamento={d} tipo="despesas" />
                                <ReciboBtn lancamento={d} label="Recibo" />
                                <EstornoBtn lancamento={d} tipo="despesas" canReverse={canReversePayments} />
                                <EditarLancamentoBtn lancamento={d} tipo="despesas" />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: "var(--surface-raised)" }}>
                        <td colSpan={5} style={{ padding: "8px 12px", fontWeight: 700, fontSize: "0.82rem" }}>Subtotal {profNome}</td>
                        <td style={{ padding: "8px 12px", fontWeight: 800, fontSize: "0.9rem", color: totalProf - pagoProf > 0 ? "var(--gold-700)" : "var(--green-700)" }}>{formatBRL(totalProf)}</td>
                        <td colSpan={2} style={{ padding: "8px 12px", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                          {pagoProf > 0 && `Pago: ${formatBRL(pagoProf)}`}
                          {totalProf - pagoProf > 0 && ` · Pendente: ${formatBRL(totalProf - pagoProf)}`}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })
          )}
        </div>
      </div>

      {relatorioAberto && relatorioProf && (
        <RelatorioDetalhadoProfModal
          professor={relatorioProf}
          aulas={profDespesas.filter((d) => professorLabel(d) === relatorioProf)}
          onClose={() => { setRelatorioAberto(false); setRelatorioProf(null); }}
        />
      )}
    </>
  );
}

/* ── Tab: Inadimplência (agrupada por mês) ── */
function InadimplenciaTab({ recebimentos }: { recebimentos: Lancamento[] }) {
  const [busca, setBusca] = useState("");

  const atrasados = useMemo(() => recebimentos
    .map((r) => ({ ...(r as Lancamento & Record<string, unknown>), dias: diasAtraso(r) }))
    .filter((r) => r.dias > 0)
    .filter((r) => !busca || [r.aluno, r.nome, extra(r, "responsavel"), extra(r, "turma"), r.descricao].map((v) => String(v || "").toLowerCase()).join(" ").includes(busca.toLowerCase()))
    .sort((a, b) => b.dias - a.dias), [recebimentos, busca]);

  const grupos = useMemo(() => groupByMes(atrasados), [atrasados]);
  const total = atrasados.reduce((s, r) => s + valorParcela(r), 0);
  const doisOuMais = Object.values(atrasados.reduce((acc: Record<string, number>, r) => {
    const aluno = String(r.aluno || r.nome || "Nao identificado");
    acc[aluno] = (acc[aluno] || 0) + 1;
    return acc;
  }, {})).filter((count) => count >= 2).length;

  function faixa(dias: number) {
    if (dias > 60) return "danger";
    if (dias > 30) return "warning";
    return "gold";
  }

  return (
    <>
      <div className="metric-grid metric-grid-3">
        <div className="metric-card metric-card-red"><div className="metric-label">Total em atraso</div><div className="metric-value" style={{ fontSize: "1.5rem" }}>{formatBRL(total)}</div><div className="metric-note">{atrasados.length} boletos vencidos</div></div>
        <div className="metric-card metric-card-gold"><div className="metric-label">2+ mensalidades</div><div className="metric-value">{doisOuMais}</div><div className="metric-note">Risco de cancelamento</div></div>
        <div className="metric-card metric-card-red"><div className="metric-label">+60 dias</div><div className="metric-value">{atrasados.filter((r) => r.dias >= 60).length}</div><div className="metric-note">Exige ação da direção</div></div>
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="toolbar-left">
            <div className="search-bar">
              <span className="search-icon"><svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg></span>
              <input className="search-input" placeholder="Buscar inadimplente, turma ou responsável..." value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {grupos.length === 0 ? (
        <div className="card"><div className="card-body"><div className="empty-state"><div className="empty-title">Sem inadimplência no filtro</div><p className="empty-desc">Quando houver boleto vencido, aparecerá aqui agrupado por mês de vencimento.</p></div></div></div>
      ) : (
        grupos.map((grupo) => {
          const totalGrupo = grupo.items.reduce((s, r) => s + valorParcela(r), 0);
          return (
            <div key={grupo.key} className="card" style={{ marginBottom: 4 }}>
              {/* Cabeçalho do mês */}
              <div style={{ padding: "12px 20px", background: "linear-gradient(90deg, rgba(220,38,38,0.06), transparent)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 4, height: 28, background: "var(--red-600)", borderRadius: 4 }} />
                  <div>
                    <div style={{ fontWeight: 800, fontSize: "0.9375rem", color: "var(--red-700)", textTransform: "capitalize" }}>
                      Vencimento: {grupo.label}
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 1 }}>{grupo.items.length} lançamento{grupo.items.length !== 1 ? "s" : ""} em atraso</div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--red-700)", fontWeight: 700 }}>Total em atraso</div>
                  <div style={{ fontWeight: 800, color: "var(--red-700)", fontSize: "1rem" }}>{formatBRL(totalGrupo)}</div>
                </div>
              </div>
              <div className="card-body" style={{ paddingTop: 0, paddingBottom: 0 }}>
                <table className="data-table">
                  <thead><tr><th>Aluno</th><th>Turma</th><th>Valor</th><th>Atraso</th><th>Responsável</th><th>Ações</th></tr></thead>
                  <tbody>
                    {grupo.items.map((r, i) => {
                      const aluno = String(r.aluno || r.nome || `Aluno ${i + 1}`);
                      const msg = `Olá! Identificamos pendência financeira de ${aluno}: ${String(r.descricao || "mensalidade")} no valor de ${formatBRL(valorParcela(r))}, vencida há ${r.dias} dia(s). Podemos ajudar com o pagamento ou negociação?`;
                      return (
                        <tr key={String(r.id || i)}>
                          <td><div className="table-name-cell"><span className="table-name-primary">{aluno}</span><span className="table-name-secondary">{String(r.descricao || "")}</span></div></td>
                          <td>{String(extra(r, "turma") || "—")}</td>
                          <td style={{ fontWeight: 800, color: "var(--red-700)" }}>{formatBRL(valorParcela(r))}</td>
                          <td><span className={`badge badge-${faixa(r.dias as number)}`}><span className="badge-dot" />{r.dias as number} dias</span></td>
                          <td>{String(extra(r, "responsavel") || "—")}</td>
                          <td><div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}><AutoWhatsAppButton phone={extra(r, "telefone") || extra(r, "whatsapp")} message={msg} /><BoletoBtn lancamento={r} /><PixBtn lancamento={r} /><BaixaBtn lancamento={r} tipo="recebimentos" /></div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
    </>
  );
}

/* ── Tab: Relatório mensal ── */
function RelatorioTab({ recebimentos, despesas }: { recebimentos: Lancamento[]; despesas: Lancamento[] }) {
  const meses = useMemo(() => {
    const map = new Map<string, { chave: string; mes: string; recebido: number; aReceber: number; totalDespesas: number }>();

    function addEntry(chave: string, date: Date) {
      if (!map.has(chave)) map.set(chave, { chave, mes: date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }), recebido: 0, aReceber: 0, totalDespesas: 0 });
      return map.get(chave)!;
    }

    for (const r of recebimentos) {
      const v = r.vencimento || r.data_vencimento; if (!v) continue;
      const d = parseBRDate(String(v)); if (isNaN(d.getTime())) continue;
      const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const entry = addEntry(chave, d);
      const s = String(r.status || r.situacao || "").toLowerCase();
      if (s.includes("pago") || s.includes("baixado") || s.includes("liquidado")) entry.recebido += valorParcela(r);
      else entry.aReceber += valorParcela(r);
    }

    for (const d of despesas) {
      const v = d.vencimento || d.data_vencimento; if (!v) continue;
      const dt = parseBRDate(String(v)); if (isNaN(dt.getTime())) continue;
      const chave = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      addEntry(chave, dt).totalDespesas += parseValor(d.valor);
    }

    return Array.from(map.values()).sort((a, b) => b.chave.localeCompare(a.chave));
  }, [recebimentos, despesas]);

  const totais = meses.reduce((a, m) => ({ rec: a.rec + m.recebido, ar: a.ar + m.aReceber, dep: a.dep + m.totalDespesas }), { rec: 0, ar: 0, dep: 0 });

  return (
    <div id="relatorio-financeiro-print">
      <div className="metric-grid metric-grid-3">
        <div className="metric-card metric-card-green">
          <div className="metric-icon metric-icon-green"><svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg></div>
          <div className="metric-label">Total recebido</div>
          <div className="metric-value" style={{ fontSize: "1.5rem" }}>{formatBRL(totais.rec)}</div>
          <div className="metric-note">Todos os períodos</div>
        </div>
        <div className="metric-card metric-card-gold">
          <div className="metric-icon metric-icon-gold"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" /></svg></div>
          <div className="metric-label">A receber</div>
          <div className="metric-value" style={{ fontSize: "1.5rem" }}>{formatBRL(totais.ar)}</div>
          <div className="metric-note">Em aberto (todos os períodos)</div>
        </div>
        <div className="metric-card metric-card-red">
          <div className="metric-icon metric-icon-red"><svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg></div>
          <div className="metric-label">Total despesas</div>
          <div className="metric-value" style={{ fontSize: "1.5rem" }}>{formatBRL(totais.dep)}</div>
          <div className="metric-note">Todos os períodos</div>
        </div>
      </div>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="section-eyebrow">Relatório</div>
            <h3 className="section-title">Resumo mensal</h3>
            <p className="section-subtitle">{meses.length} meses com movimentação</p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => printWindow("relatorio-financeiro-print", "Relatório Financeiro — Ativo Educacional")}>Imprimir / PDF</button>
        </div>
        <div className="card-body" style={{ paddingTop: 12 }}>
          {meses.length === 0 ? (
            <div className="empty-state"><div className="empty-title">Sem dados para relatório</div><p className="empty-desc">Não há lançamentos com datas cadastradas.</p></div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Mês</th><th>Recebido</th><th>A receber</th><th>Despesas</th><th>Saldo</th></tr></thead>
              <tbody>
                {meses.map((m) => {
                  const saldo = m.recebido - m.totalDespesas;
                  return (
                    <tr key={m.chave}>
                      <td style={{ textTransform: "capitalize", fontWeight: 600 }}>{m.mes}</td>
                      <td style={{ color: "var(--green-700)", fontWeight: 700 }}>{formatBRL(m.recebido)}</td>
                      <td style={{ color: "var(--gold-700)" }}>{formatBRL(m.aReceber)}</td>
                      <td style={{ color: "var(--red-700)" }}>{formatBRL(m.totalDespesas)}</td>
                      <td><span style={{ fontWeight: 700, color: saldo >= 0 ? "var(--green-700)" : "var(--red-700)" }}>{formatBRL(saldo)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ fontWeight: 700 }}>Total geral</td>
                  <td style={{ color: "var(--green-700)", fontWeight: 800 }}>{formatBRL(totais.rec)}</td>
                  <td style={{ color: "var(--gold-700)", fontWeight: 800 }}>{formatBRL(totais.ar)}</td>
                  <td style={{ color: "var(--red-700)", fontWeight: 800 }}>{formatBRL(totais.dep)}</td>
                  <td><span style={{ fontWeight: 800, color: (totais.rec - totais.dep) >= 0 ? "var(--green-700)" : "var(--red-700)" }}>{formatBRL(totais.rec - totais.dep)}</span></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Export principal ── */
export function FinanceiroTable({
  recebimentos,
  despesas,
  canSeeProfessorReports,
  canReversePayments,
  professores = [],
  fornecedores = [],
  fechamentos = [],
}: {
  recebimentos: Lancamento[];
  despesas: Lancamento[];
  canSeeProfessorReports: boolean;
  canReversePayments: boolean;
  professores?: Record<string, unknown>[];
  fornecedores?: Record<string, unknown>[];
  fechamentos?: Record<string, unknown>[];
}) {
  const [tab, setTab] = useState<Tab>("recebimentos");
  const visibleTabs: { id: Tab; label: string }[] = [
    { id: "recebimentos", label: "Recebimentos" },
    { id: "despesas", label: "Despesas" },
    { id: "inadimplencia", label: "Inadimplência" },
    ...(canSeeProfessorReports ? [
      { id: "professores" as Tab, label: "Professores" },
      { id: "fornecedores" as Tab, label: "Fornecedores" },
      { id: "fechamentos" as Tab, label: "Fechamentos" },
      { id: "relatorio" as Tab, label: "Relatório" },
    ] : []),
  ];

  // Suppress unused warning for fechamentos (passed through to child as-is via props)
  void fechamentos;

  return (
    <>
      <div className="card">
        <div className="card-body" style={{ paddingTop: 16, paddingBottom: 16 }}>
          <div className="tab-bar">
            {visibleTabs.map((t) => (
              <button key={t.id} className={`tab-btn${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
          </div>
        </div>
      </div>
      {tab === "recebimentos" && <RecebimentosTab recebimentos={recebimentos} canReversePayments={canReversePayments} />}
      {tab === "despesas" && <DespesasTab despesas={despesas} canReversePayments={canReversePayments} />}
      {tab === "inadimplencia" && <InadimplenciaTab recebimentos={recebimentos} />}
      {canSeeProfessorReports && tab === "professores" && <ProfessoresAulasTab despesas={despesas} canReversePayments={canReversePayments} />}
      {canSeeProfessorReports && tab === "fornecedores" && (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <FinanceiroFornecedores fornecedores={fornecedores as any} despesas={despesas} />
      )}
      {canSeeProfessorReports && tab === "fechamentos" && (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <FinanceiroProfessorFechamento professores={professores as any} payables={despesas} />
      )}
      {canSeeProfessorReports && tab === "relatorio" && <RelatorioTab recebimentos={recebimentos} despesas={despesas} />}
    </>
  );
}
