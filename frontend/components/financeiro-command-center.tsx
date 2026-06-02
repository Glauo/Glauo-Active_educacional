"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { financeMessage } from "@/lib/finance-message";
import { boletoAccessUrl } from "@/lib/finance-boleto-links";
import { manualWhatsAppUrl } from "@/lib/manual-whatsapp";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return String(value || "").trim();
}

function parseValor(v: unknown): number {
  return parseFloat(String(v || "0").replace(/[^\d.,-]/g, "").replace(",", ".")) || 0;
}

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function isPaid(row: Row) {
  const s = text(row.status || row.situacao).toLowerCase();
  return s.includes("pago") || s.includes("baixado") || s.includes("liquidado");
}

function parseBRDate(v: string): Date {
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return new Date(v);
}

function dateOf(row: Row) {
  const raw = text(row.vencimento || row.data_vencimento || row.data_pagamento || row.data_baixa);
  if (!raw) return null;
  const date = parseBRDate(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function daysLate(row: Row) {
  const d = dateOf(row);
  if (!d || isPaid(row)) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - d.getTime()) / 86400000));
}

function phoneOf(row: Row) {
  return text(row.telefone || row.whatsapp || row.celular || row.responsavel_telefone || row.telefone_responsavel || row.whatsapp_responsavel);
}

function emailOf(row: Row) {
  return text(row.email || row.aluno_email || row.responsavel_email || row.email_responsavel || row.emailResponsavel);
}

function alunoOf(row: Row) {
  return text(row.aluno || row.nome || row.responsavel || "Aluno");
}

function descricaoOf(row: Row) {
  return text(row.descricao || row.tipo_lancamento_detalhe || row.categoria || "Mensalidade");
}

function boletoLink(row: Row) {
  return boletoAccessUrl(row, typeof window !== "undefined" ? window.location.origin : "");
}

function smartFinanceMessage(row: Row, mode: CobrancaMode) {
  const base = financeMessage(row, typeof window !== "undefined" ? window.location.origin : "");
  const aluno = alunoOf(row);
  const descricao = descricaoOf(row);
  const valor = formatBRL(parseValor(row.valor_parcela || row.valor || row.valor_total));
  const vencimento = text(row.vencimento || row.data_vencimento);
  const link = typeof window !== "undefined" ? boletoLink(row) : "";
  const atraso = daysLate(row);

  if (mode === "atrasados") {
    return {
      subject: `Pendencia financeira - ${aluno}`,
      body: [
        `Ola, ${aluno}! Tudo bem?`,
        "",
        `Identificamos uma pendencia financeira referente a ${descricao}.`,
        `Valor: ${valor}`,
        vencimento ? `Vencimento: ${vencimento}` : "",
        atraso ? `Atraso: ${atraso} dia(s)` : "",
        link ? `Boleto/fatura: ${link}` : "",
        "",
        "Podemos te ajudar com a regularizacao? Se ja realizou o pagamento, por favor nos envie o comprovante.",
        "",
        "Ativo Educacional"
      ].filter(Boolean).join("\n")
    };
  }

  if (mode === "hoje") {
    return {
      subject: `Vencimento hoje - ${aluno}`,
      body: [
        `Ola, ${aluno}! Tudo bem?`,
        "",
        `Passando para lembrar que hoje vence ${descricao}.`,
        `Valor: ${valor}`,
        vencimento ? `Vencimento: ${vencimento}` : "",
        link ? `Boleto/fatura: ${link}` : "",
        "",
        "Qualquer duvida, a secretaria esta a disposicao.",
        "",
        "Ativo Educacional"
      ].filter(Boolean).join("\n")
    };
  }

  if (mode === "proximos") {
    return {
      subject: `Proximo vencimento - ${aluno}`,
      body: [
        `Ola, ${aluno}! Tudo bem?`,
        "",
        `Sua fatura referente a ${descricao} esta proxima do vencimento.`,
        `Valor: ${valor}`,
        vencimento ? `Vencimento: ${vencimento}` : "",
        link ? `Boleto/fatura: ${link}` : "",
        "",
        "Enviamos este lembrete para facilitar sua organizacao.",
        "",
        "Ativo Educacional"
      ].filter(Boolean).join("\n")
    };
  }

  return base;
}

type CobrancaMode = "atrasados" | "hoje" | "proximos" | "boletos";

function SendDocButton({
  canal,
  row,
  message,
}: {
  canal: "whatsapp" | "email";
  row: Row;
  message: { subject: string; body: string };
}) {
  const [sending, setSending] = useState(false);
  const target = canal === "whatsapp" ? phoneOf(row) : emailOf(row);

  if (canal === "whatsapp") {
    const href = manualWhatsAppUrl(target, message.body);
    if (!href) {
      return <button className="btn btn-secondary btn-sm" type="button" disabled title="Sem telefone cadastrado">WhatsApp manual</button>;
    }
    return <a className="btn btn-secondary btn-sm" href={href} target="_blank" rel="noreferrer">WhatsApp manual</a>;
  }

  async function send() {
    if (!target || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/financeiro/send-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canal,
          telefone: "",
          email: target,
          assunto: message.subject,
          mensagem: message.body,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) alert(String(data.error || data.results?.[canal] || "Envio nao confirmado."));
    } catch {
      alert("Nao foi possivel enviar agora. Verifique a configuracao de envio.");
    } finally {
      setSending(false);
    }
  }

  return (
    <button className="btn btn-secondary btn-sm" type="button" onClick={send} disabled={!target || sending} title={!target ? "Sem e-mail cadastrado" : ""}>
      {sending ? "Enviando..." : "E-mail"}
    </button>
  );
}

function CobrancaModal({
  mode,
  title,
  rows,
  onClose,
}: {
  mode: CobrancaMode;
  title: string;
  rows: Row[];
  onClose: () => void;
}) {
  const [copied, setCopied] = useState("");

  async function copyMessage(id: string, body: string) {
    await navigator.clipboard?.writeText(body);
    setCopied(id);
  }

  return (
    <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 980, width: "94vw", maxHeight: "90vh", overflowY: "auto" }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{title}</div>
            <div className="modal-subtitle">{rows.length} lancamento(s) prontos para acao, com mensagem personalizada por situacao.</div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
          </button>
        </div>
        <div className="modal-body">
          {rows.length === 0 ? (
            <div className="empty-state">
              <div className="empty-title">Nada pendente nesta fila</div>
              <p className="empty-desc">Quando houver lancamentos neste criterio, eles aparecem aqui.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {rows.map((row, index) => {
                const id = text(row.id) || `${mode}_${index}`;
                const message = smartFinanceMessage(row, mode);
                const late = daysLate(row);
                return (
                  <div key={id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 12, background: "var(--surface-raised)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) auto", gap: 12, alignItems: "start" }}>
                      <div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <strong style={{ color: "var(--navy-900)" }}>{alunoOf(row)}</strong>
                          <span className={`badge badge-${late > 0 ? "danger" : "warning"}`}><span className="badge-dot" />{late > 0 ? `${late} dias atraso` : text(row.status || "Pendente")}</span>
                        </div>
                        <div style={{ color: "var(--text-secondary)", fontSize: "0.84rem", marginTop: 4 }}>
                          {descricaoOf(row)} | {formatBRL(parseValor(row.valor_parcela || row.valor || row.valor_total))} | Venc.: {text(row.vencimento || row.data_vencimento) || "-"}
                        </div>
                        <pre style={{ whiteSpace: "pre-wrap", marginTop: 10, padding: 10, borderRadius: "var(--radius-sm)", background: "#fff", border: "1px solid var(--border)", color: "var(--text-secondary)", fontFamily: "inherit", fontSize: "0.78rem", lineHeight: 1.45, maxHeight: 140, overflowY: "auto" }}>{message.body}</pre>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <SendDocButton canal="whatsapp" row={row} message={message} />
                        <SendDocButton canal="email" row={row} message={message} />
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => copyMessage(id, message.body)}>
                          {copied === id ? "Copiado" : "Copiar"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" type="button" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

function ResultPill({ label, value, tone }: { label: string; value: string; tone: "green" | "gold" | "red" | "blue" }) {
  const color = tone === "green" ? "var(--green-700)" : tone === "gold" ? "var(--gold-700)" : tone === "red" ? "var(--red-700)" : "var(--blue-600)";
  return (
    <div style={{ padding: "10px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--surface-raised)" }}>
      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>{label}</div>
      <div style={{ color, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function RegerarBoletosButton() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  async function regerar() {
    if (!confirm("Regerar via Mercado Pago todos os boletos que ainda nao possuem URL real (codigos AE-XXXX ou Erro MP)?\n\nIsso pode demorar alguns segundos.")) return;
    setSaving(true);
    setMsg("");
    const res = await fetch("/api/financeiro/regerar-boleto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ todos_sem_mp: true }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setMsg(text(data.error) || "Erro ao regerar boletos.");
      return;
    }
    if (data.message) {
      setMsg(data.message);
    } else {
      setMsg(`${data.regerados || 0} boleto(s) regerado(s) no Mercado Pago. ${data.erros || 0} erro(s).`);
      router.refresh();
    }
    setTimeout(() => setMsg(""), 8000);
  }
  return (
    <>
      <button className="btn btn-secondary" onClick={regerar} disabled={saving} title="Regera via Mercado Pago todos os boletos com codigo interno AE-XXXX">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" /></svg>
        {saving ? "Regerando..." : "Regerar boletos MP"}
      </button>
      {msg && <div style={{ fontSize: "0.8rem", color: msg.includes("erro") || msg.includes("Erro") ? "var(--red-600)" : "var(--green-700)", padding: "4px 8px", background: msg.includes("erro") || msg.includes("Erro") ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)", borderRadius: 6, border: "1px solid currentColor" }}>{msg}</div>}
    </>
  );
}
function BatchBoletosButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [valor, setValor] = useState("");
  const [dia, setDia] = useState("10");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  async function gerar() {
    setSaving(true);
    const res = await fetch("/api/financeiro/lote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ competencia, valor_padrao: valor, dia_vencimento: dia }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setMsg(text(data.error) || "Erro ao gerar boletos.");
      return;
    }
    setMsg(`${data.criados || 0} boleto(s) gerados. ${data.ignorados || 0} ignorado(s).`);
    router.refresh();
  }

  return (
    <>
      <button className="btn btn-secondary" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 20 20" fill="currentColor"><path d="M4 3a2 2 0 00-2 2v1h16V5a2 2 0 00-2-2H4z" /><path fillRule="evenodd" d="M18 8H2v7a2 2 0 002 2h12a2 2 0 002-2V8zM5 12a1 1 0 011-1h4a1 1 0 110 2H6a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
        Gerar mes
      </button>
      {open && (
        <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && setOpen(false)}>
          <div className="modal-box" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Gerar boletos do mes</div>
                <div className="modal-subtitle">Cria mensalidades para alunos ativos e evita duplicidade na competencia.</div>
              </div>
              <button className="modal-close" onClick={() => setOpen(false)}>
                <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group"><label className="form-label">Competencia</label><input className="form-input" type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Dia de vencimento</label><input className="form-input" type="number" min={1} max={28} value={dia} onChange={(e) => setDia(e.target.value)} /></div>
                <div className="form-group form-group-span2"><label className="form-label">Valor padrao, se o aluno nao tiver mensalidade cadastrada</label><input className="form-input" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ex: 350,00" /></div>
              </div>
              {msg && <div className={msg.includes("Erro") ? "form-error" : "form-success"}>{msg}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setOpen(false)} disabled={saving}>Fechar</button>
              <button className="btn btn-primary" onClick={gerar} disabled={saving}>{saving ? "Gerando..." : "Gerar boletos"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function csvCell(value: unknown) {
  return `"${text(value).replace(/"/g, '""')}"`;
}

export function FinanceiroExportButton({
  recebimentos,
  despesas,
}: {
  recebimentos: Row[];
  despesas: Row[];
}) {
  function exportar() {
    const headers = ["tipo", "pessoa", "descricao", "valor", "vencimento", "status", "telefone", "email", "data_baixa"];
    const linhas = [
      headers.join(";"),
      ...recebimentos.map((row) => [
        "recebimento",
        alunoOf(row),
        descricaoOf(row),
        parseValor(row.valor_parcela || row.valor || row.valor_total).toFixed(2).replace(".", ","),
        text(row.vencimento || row.data_vencimento),
        text(row.status || row.situacao || "Pendente"),
        phoneOf(row),
        emailOf(row),
        text(row.data_baixa),
      ].map(csvCell).join(";")),
      ...despesas.map((row) => [
        "despesa",
        text(row.aluno || row.nome || row.professor || row.fornecedor),
        descricaoOf(row),
        parseValor(row.valor_parcela || row.valor || row.valor_total).toFixed(2).replace(".", ","),
        text(row.vencimento || row.data_vencimento),
        text(row.status || row.situacao || "Pendente"),
        phoneOf(row),
        emailOf(row),
        text(row.data_baixa),
      ].map(csvCell).join(";")),
    ].join("\n");
    const blob = new Blob([`\uFEFF${linhas}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `financeiro-active-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button className="btn btn-secondary" type="button" onClick={exportar}>
      <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
      Exportar
    </button>
  );
}

export function FinanceiroCommandCenter({
  recebimentos,
  despesas,
  alunos,
  professores,
}: {
  recebimentos: Row[];
  despesas: Row[];
  alunos: Row[];
  professores: Row[];
}) {
  const [busca, setBusca] = useState("");
  const [cobranca, setCobranca] = useState<{ mode: CobrancaMode; title: string; rows: Row[] } | null>(null);
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  const stats = useMemo(() => {
    let receitaMes = 0;
    let receitaMesAnterior = 0;
    let futuro = 0;
    let vencido = 0;
    let vencemHoje = 0;
    const inadimplentes = new Map<string, { aluno: string; total: number; maxDias: number; count: number }>();

    for (const row of recebimentos) {
      const value = parseValor(row.valor_pago || row.valor);
      const paid = isPaid(row);
      const due = dateOf(row);
      if (paid) {
        const paidDate = new Date(text(row.data_baixa || row.updated_at || row.created_at || row.vencimento || ""));
        if (!Number.isNaN(paidDate.getTime()) && paidDate.getMonth() === month && paidDate.getFullYear() === year) receitaMes += value;
        const previous = new Date(year, month - 1, 1);
        if (!Number.isNaN(paidDate.getTime()) && paidDate.getMonth() === previous.getMonth() && paidDate.getFullYear() === previous.getFullYear()) receitaMesAnterior += value;
        continue;
      }
      if (!due) {
        futuro += value;
        continue;
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      due.setHours(0, 0, 0, 0);
      if (due.getTime() === today.getTime()) vencemHoje += 1;
      if (due < today) {
        const dias = daysLate(row);
        vencido += value;
        const aluno = text(row.aluno || row.nome || "Nao identificado");
        const current = inadimplentes.get(aluno) || { aluno, total: 0, maxDias: 0, count: 0 };
        inadimplentes.set(aluno, { aluno, total: current.total + value, maxDias: Math.max(current.maxDias, dias), count: current.count + 1 });
      } else {
        futuro += value;
      }
    }

    const folhaPendente = despesas
      .filter((row) => !isPaid(row))
      .filter((row) => [row.aluno, row.nome, row.descricao, row.tipo].map((v) => text(v).toLowerCase()).join(" ").includes("prof"))
      .reduce((sum, row) => sum + parseValor(row.valor), 0);

    return {
      receitaMes,
      receitaMesAnterior,
      futuro,
      vencido,
      vencemHoje,
      folhaPendente,
      inadimplentes: Array.from(inadimplentes.values()).sort((a, b) => b.total - a.total),
    };
  }, [recebimentos, despesas, month, year]);

  const queues = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const next7 = addDays(today, 7);
    const openRows = recebimentos.filter((row) => !isPaid(row));
    return {
      atrasados: openRows
        .filter((row) => daysLate(row) > 0)
        .sort((a, b) => daysLate(b) - daysLate(a)),
      hoje: openRows.filter((row) => {
        const due = dateOf(row);
        return due ? isSameDay(due, today) : false;
      }),
      proximos: openRows.filter((row) => {
        const due = dateOf(row);
        if (!due) return false;
        due.setHours(0, 0, 0, 0);
        return due > today && due <= next7;
      }),
      boletos: openRows.filter((row) => text(row.boleto_pdf_url || row.boleto_pdf_public_url || row.boleto_status || row.boleto_codigo)),
    };
  }, [recebimentos]);

  const results = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return [];
    const found = [
      ...recebimentos.map((row) => ({ tipo: "Boleto", titulo: text(row.aluno || row.nome || row.descricao), detalhe: `${text(row.descricao)} | ${formatBRL(parseValor(row.valor))} | ${text(row.status || "Pendente")}` })),
      ...despesas.map((row) => ({ tipo: "Despesa", titulo: text(row.aluno || row.nome || row.descricao), detalhe: `${text(row.descricao)} | ${formatBRL(parseValor(row.valor))}` })),
      ...alunos.map((row) => ({ tipo: "Aluno", titulo: text(row.nome || row.name || row.login), detalhe: `${text(row.turma || row.classe)} | ${text(row.responsavel || "")}` })),
      ...professores.map((row) => ({ tipo: "Professor", titulo: text(row.nome || row.name || row.login), detalhe: `${text(row.disciplina || row.email || "")}` })),
    ];
    return found.filter((item) => `${item.tipo} ${item.titulo} ${item.detalhe}`.toLowerCase().includes(q)).slice(0, 8);
  }, [busca, recebimentos, despesas, alunos, professores]);

  const crescimento = stats.receitaMesAnterior ? ((stats.receitaMes - stats.receitaMesAnterior) / stats.receitaMesAnterior) * 100 : 0;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div className="card card-hero">
        <div className="card-body">
          <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1fr) auto", gap: 16, alignItems: "start" }}>
            <div>
              <div className="section-eyebrow">Centro de comando financeiro</div>
              <h3 className="section-title" style={{ fontSize: "1.35rem", marginBottom: 8 }}>Tudo em ate 3 cliques</h3>
              <div className="search-bar" style={{ width: "100%", maxWidth: 620 }}>
                <span className="search-icon"><svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg></span>
                <input className="search-input" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar aluno, boleto, professor, turma, CPF ou descricao..." style={{ minWidth: 260 }} />
              </div>
              {results.length > 0 && (
                <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                  {results.map((item, index) => (
                    <div className="spotlight-row" key={`${item.tipo}_${index}`}>
                      <span className="badge badge-info"><span className="badge-dot" />{item.tipo}</span>
                      <span className="spotlight-label">{item.titulo}</span>
                      <span className="spotlight-value" style={{ fontSize: "0.78rem" }}>{item.detalhe}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <RegerarBoletosButton />
              <BatchBoletosButton />
              <button className="btn btn-secondary" onClick={() => window.print()}>Relatorio rapido</button>
            </div>
          </div>
        </div>
      </div>

      <div className="metric-grid metric-grid-4">
        <div className="metric-card metric-card-green"><div className="metric-label">Receita do mes</div><div className="metric-value" style={{ fontSize: "1.45rem" }}>{formatBRL(stats.receitaMes)}</div><div className="metric-note">{crescimento >= 0 ? "+" : ""}{crescimento.toFixed(1)}% vs mes anterior</div></div>
        <div className="metric-card metric-card-gold"><div className="metric-label">A receber futuro</div><div className="metric-value" style={{ fontSize: "1.45rem" }}>{formatBRL(stats.futuro)}</div><div className="metric-note">Boletos em aberto nao vencidos</div></div>
        <div className="metric-card metric-card-red"><div className="metric-label">Inadimplencia</div><div className="metric-value" style={{ fontSize: "1.45rem" }}>{formatBRL(stats.vencido)}</div><div className="metric-note">{stats.inadimplentes.length} aluno(s) com atraso</div></div>
        <div className="metric-card metric-card-blue"><div className="metric-label">Folha pendente</div><div className="metric-value" style={{ fontSize: "1.45rem" }}>{formatBRL(stats.folhaPendente)}</div><div className="metric-note">Professores/fornecedores</div></div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="section-eyebrow">Cobranca inteligente</div>
            <h3 className="section-title">Filas prontas para acao</h3>
            <p className="section-subtitle">Abra a fila, confira a mensagem e use o WhatsApp manual ou e-mail sem procurar lancamento por lancamento.</p>
          </div>
        </div>
        <div className="card-body">
          <div className="metric-grid metric-grid-4" style={{ margin: 0 }}>
            {[
              { mode: "atrasados" as CobrancaMode, title: "Cobrar atrasados", rows: queues.atrasados, tone: "red", note: "Prioridade maxima" },
              { mode: "hoje" as CobrancaMode, title: "Vencem hoje", rows: queues.hoje, tone: "blue", note: "Lembrete do dia" },
              { mode: "proximos" as CobrancaMode, title: "Proximos 7 dias", rows: queues.proximos, tone: "gold", note: "Prevencao de atraso" },
              { mode: "boletos" as CobrancaMode, title: "Boletos prontos", rows: queues.boletos, tone: "green", note: "Enviar link/PDF" },
            ].map((item) => (
              <button
                key={item.mode}
                type="button"
                className={`metric-card metric-card-${item.tone}`}
                onClick={() => setCobranca({ mode: item.mode, title: item.title, rows: item.rows })}
                style={{ textAlign: "left", cursor: "pointer", border: "1px solid var(--border)" }}
              >
                <div className="metric-label">{item.title}</div>
                <div className="metric-value">{item.rows.length}</div>
                <div className="metric-note">{item.note}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="content-grid grid-2-1">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="section-eyebrow">Alertas financeiros</div>
              <h3 className="section-title">Prioridade de hoje</h3>
            </div>
          </div>
          <div className="card-body">
            <div className="spotlight-list">
              <div className="spotlight-row"><span className="spotlight-label">Boletos vencendo hoje</span><span className="spotlight-value">{stats.vencemHoje}</span></div>
              <div className="spotlight-row"><span className="spotlight-label">Alunos com 2+ mensalidades em atraso</span><span className="spotlight-value">{stats.inadimplentes.filter((item) => item.count >= 2).length}</span></div>
              <div className="spotlight-row"><span className="spotlight-label">Maior atraso</span><span className="spotlight-value">{Math.max(0, ...stats.inadimplentes.map((item) => item.maxDias))} dias</span></div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <div className="section-eyebrow">Inadimplencia por faixa</div>
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              <ResultPill label="1-30 dias" value={String(stats.inadimplentes.filter((item) => item.maxDias <= 30).length)} tone="gold" />
              <ResultPill label="31-60 dias" value={String(stats.inadimplentes.filter((item) => item.maxDias > 30 && item.maxDias <= 60).length)} tone="red" />
              <ResultPill label="+60 dias" value={String(stats.inadimplentes.filter((item) => item.maxDias > 60).length)} tone="red" />
            </div>
          </div>
        </div>
      </div>
      {cobranca && <CobrancaModal mode={cobranca.mode} title={cobranca.title} rows={cobranca.rows} onClose={() => setCobranca(null)} />}
    </div>
  );
}
