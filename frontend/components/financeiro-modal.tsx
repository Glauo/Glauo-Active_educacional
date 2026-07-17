"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { financeMessage } from "@/lib/finance-message";

type LancamentoData = {
  id?: string;
  aluno?: string;
  nome?: string;
  aluno_id?: string;
  aluno_login?: string;
  descricao?: string;
  valor?: number | string;
  valor_total?: number | string;
  valor_parcela?: number | string;
  vencimento?: string;
  data_vencimento?: string;
  data_lancamento?: string;
  status?: string;
  tipo_lancamento?: string;
  tipo_lancamento_detalhe?: string;
  telefone?: string;
  whatsapp?: string;
  email?: string;
  boleto_pdf_url?: string;
  [k: string]: unknown;
};

type AlunoOption = {
  id?: string;
  _id?: string;
  uuid?: string;
  codigo?: string;
  nome?: string;
  name?: string;
  nome_completo?: string;
  aluno?: string;
  aluno_nome?: string;
  login?: string;
  usuario?: string;
  cpf?: string;
  turma?: string;
  classe?: string;
  email?: string;
  responsavel_email?: string;
  email_responsavel?: string;
  emailResponsavel?: string;
  aluno_email?: string;
  telefone?: string;
  celular?: string;
  whatsapp?: string;
  responsavel_telefone?: string;
  telefone_responsavel?: string;
  celular_responsavel?: string;
  whatsapp_responsavel?: string;
  valor_mensalidade?: string | number;
  mensalidade?: string | number;
  plano_valor?: string | number;
  vencimento?: string;
  dia_vencimento?: string | number;
  [k: string]: unknown;
};

type Form = {
  tipo_lancamento: "recebimentos" | "despesas";
  aluno_id: string;
  aluno: string;
  aluno_login: string;
  aluno_email: string;
  aluno_telefone: string;
  data_lancamento: string;
  descricao: string;
  categoria: string;
  valor_total: string;
  qtd_parcelas: string;
  parcela_inicial: string;
  valor_parcela: string;
  vencimento: string;
  status: string;
  gerar_boleto: boolean;
  enviar_whatsapp: boolean;
  enviar_email: boolean;
  observacoes: string;
};

const hoje = () => new Date().toISOString().slice(0, 10);
const CATEGORIAS_RECEBIMENTO = ["Matricula", "Mensalidade", "Material", "Renegociacao", "Aulas avulsas", "Reposicao", "Evento", "Outros"];

function text(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const row = value as Record<string, unknown>;
    return String(row.nome || row.name || row.celular || row.telefone || row.email || "").trim();
  }
  return String(value || "").trim();
}

function parseMoney(value: unknown) {
  const cleaned = String(value || "0").replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  return Number.parseFloat(cleaned) || 0;
}

function moneyInput(value: number) {
  return value.toFixed(2).replace(".", ",");
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function addMonths(dateStr: string, months: number) {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

function studentName(aluno: AlunoOption) {
  return text(aluno.nome || aluno.name || aluno.nome_completo || aluno.aluno || aluno.aluno_nome || aluno.login || aluno.usuario);
}

function studentLogin(aluno?: AlunoOption) {
  return text(aluno?.login || aluno?.usuario || aluno?.codigo);
}

function studentIdentifier(aluno: AlunoOption, index?: number) {
  return text(aluno.id || aluno._id || aluno.uuid || aluno.codigo || studentLogin(aluno) || aluno.cpf || studentName(aluno) || (typeof index === "number" ? `aluno-${index}` : ""));
}

function findStudentByIdentifier(alunos: AlunoOption[], identifier: string) {
  const target = text(identifier);
  if (!target) return undefined;
  return alunos.find((aluno, index) => {
    const keys = [
      studentIdentifier(aluno, index),
      text(aluno.id),
      text(aluno._id),
      text(aluno.uuid),
      text(aluno.codigo),
      studentLogin(aluno),
      text(aluno.cpf),
      studentName(aluno),
    ];
    return keys.some((key) => key === target);
  });
}

function studentEmail(aluno?: AlunoOption) {
  return text(aluno?.responsavel_email || aluno?.email_responsavel || aluno?.emailResponsavel || aluno?.aluno_email || aluno?.email);
}

function studentPhone(aluno?: AlunoOption) {
  return text(aluno?.responsavel_telefone || aluno?.telefone_responsavel || aluno?.celular_responsavel || aluno?.whatsapp_responsavel || aluno?.celular || aluno?.whatsapp || aluno?.telefone);
}

function studentMonthlyValue(aluno?: AlunoOption) {
  return text(aluno?.valor_mensalidade || aluno?.mensalidade || aluno?.plano_valor);
}

function boletoImportForm(aluno?: AlunoOption) {
  return {
    aluno_id: aluno ? studentIdentifier(aluno) : "",
    aluno: aluno ? studentName(aluno) : "",
    aluno_login: aluno ? studentLogin(aluno) : "",
    aluno_email: aluno ? studentEmail(aluno) : "",
    aluno_telefone: aluno ? studentPhone(aluno) : "",
    descricao: "Boleto externo",
    valor: aluno ? studentMonthlyValue(aluno) : "",
    vencimento: text(aluno?.vencimento),
    categoria: "Mensalidade",
    enviar_whatsapp: false,
    enviar_email: false,
    observacoes: "",
  };
}

function whatsappUrl(phone: unknown, message: string) {
  return "";
}

function mailtoUrl(email: string, subject: string, body: string) {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function refreshKeepingPosition(router: ReturnType<typeof useRouter>) {
  const top = typeof window !== "undefined" ? window.scrollY : 0;
  router.refresh();
  if (typeof window !== "undefined") {
    window.setTimeout(() => window.scrollTo({ top, behavior: "auto" }), 30);
    window.setTimeout(() => window.scrollTo({ top, behavior: "auto" }), 180);
  }
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 45000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

function boletoMessage(lancamento: LancamentoData, origin = "") {
  const id = text(lancamento.id);
  const pdfUrl = text(lancamento.boleto_pdf_url);
  const link = pdfUrl
    ? (pdfUrl.startsWith("http") ? pdfUrl : `${origin}${pdfUrl}`)
    : (id ? `${origin}/api/financeiro/boleto?id=${id}` : origin);
  return [
    "Olá! Seu boleto/fatura da Active Educacional foi salvo.",
    "",
    `Aluno: ${text(lancamento.aluno || lancamento.nome)}`,
    `Referência: ${text(lancamento.descricao)}`,
    `Parcela: ${text(lancamento.parcela) || "1"}`,
    `Valor: ${formatBRL(parseMoney(lancamento.valor_parcela || lancamento.valor))}`,
    `Vencimento: ${text(lancamento.vencimento || lancamento.data_vencimento)}`,
    "",
    `Acesse o boleto: ${link}`,
  ].join("\n");
}

function baseForm(lancamento?: LancamentoData, tipoInicial?: "recebimentos" | "despesas"): Form {
  const total = text(lancamento?.valor_total || lancamento?.valor || "");
  return {
    tipo_lancamento: tipoInicial || (lancamento?.tipo_lancamento as "recebimentos" | "despesas") || "recebimentos",
    aluno_id: text(lancamento?.aluno_id),
    aluno: text(lancamento?.aluno || lancamento?.nome),
    aluno_login: text(lancamento?.aluno_login),
    aluno_email: text(lancamento?.email),
    aluno_telefone: text(lancamento?.telefone || lancamento?.whatsapp),
    data_lancamento: text(lancamento?.data_lancamento) || hoje(),
    descricao: text(lancamento?.descricao || "Mensalidade"),
    categoria: text(lancamento?.tipo_lancamento_detalhe || "Mensalidade"),
    valor_total: total,
    qtd_parcelas: "1",
    parcela_inicial: "1",
    valor_parcela: text(lancamento?.valor_parcela || lancamento?.valor || total),
    vencimento: text(lancamento?.vencimento || lancamento?.data_vencimento) || hoje(),
    status: text(lancamento?.status || "Pendente"),
    gerar_boleto: Boolean(lancamento?.boleto_pdf_url || lancamento?.boleto_status),
    enviar_whatsapp: false,
    enviar_email: false,
    observacoes: text(lancamento?.observacoes),
  };
}

function WhatsAppSendButton({ phone, message, label = "WhatsApp" }: { phone: string; message: string; label?: string }) {
  const [sending, setSending] = useState(false);
  const telefone = text(phone);

  async function send() {
    if (!telefone || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefone, mensagem: message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        alert(`WhatsApp nao enviado automaticamente: ${String(data.status || data.error || "verifique a WAPI")}`);
      } else {
        alert("Boleto enviado com sucesso por WhatsApp!");
      }
    } catch {
      alert("Erro ao enviar WhatsApp automatico.");
    } finally {
      setSending(false);
    }
  }

  return (
    <button className="btn btn-secondary btn-sm" type="button" onClick={send} disabled={!telefone || sending}>
      {sending ? "Enviando..." : label}
    </button>
  );
}

function LancamentoModal({
  lancamento,
  tipoInicial,
  alunos = [],
  onClose,
  onSaved
}: {
  lancamento?: LancamentoData;
  tipoInicial?: "recebimentos" | "despesas";
  alunos?: AlunoOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(lancamento?.id);
  const [form, setForm] = useState<Form>(baseForm(lancamento, tipoInicial));
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [savedLinks, setSavedLinks] = useState<{ whatsapp?: { phone: string; message: string }; email: string; label: string }[]>([]);
  const [boletoPdf, setBoletoPdf] = useState<File | null>(null);
  const isRecebimento = form.tipo_lancamento === "recebimentos";
  const isMensalidade = isRecebimento && form.categoria === "Mensalidade";

  const alunoSelecionado = useMemo(() => findStudentByIdentifier(alunos, form.aluno_id) || alunos.find((a) => studentName(a) === form.aluno), [alunos, form.aluno_id, form.aluno]);
  const total = parseMoney(form.valor_total);
  const qtdParcelas = isMensalidade ? 1 : Math.min(48, Math.max(1, Number.parseInt(form.qtd_parcelas) || 1));
  const valorParcelaCalc = qtdParcelas > 0 ? total / qtdParcelas : 0;

  function update<K extends keyof Form>(field: K, value: Form[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErro("");
    setSavedLinks([]);
  }

  function updateValorTotal(value: string) {
    const qtd = isMensalidade ? 1 : Math.min(48, Math.max(1, Number.parseInt(form.qtd_parcelas) || 1));
    const calc = parseMoney(value) / qtd;
    setForm((prev) => ({ ...prev, valor_total: value, valor_parcela: calc ? moneyInput(calc) : "" }));
    setErro("");
  }

  function updateParcelas(value: string) {
    const qtd = Math.min(48, Math.max(1, Number.parseInt(value) || 1));
    const calc = parseMoney(form.valor_total) / qtd;
    setForm((prev) => ({ ...prev, qtd_parcelas: String(qtd), valor_parcela: calc ? moneyInput(calc) : "" }));
    setErro("");
  }

  function selecionarAluno(id: string) {
    const aluno = findStudentByIdentifier(alunos, id);
    if (!aluno) {
      setForm((prev) => ({ ...prev, aluno_id: "", aluno: "", aluno_login: "", aluno_email: "", aluno_telefone: "" }));
      return;
    }
    const valor = studentMonthlyValue(aluno);
    const venc = text(aluno.vencimento) || form.vencimento;
    setForm((prev) => ({
      ...prev,
      aluno_id: studentIdentifier(aluno),
      aluno: studentName(aluno),
      aluno_login: studentLogin(aluno),
      aluno_email: studentEmail(aluno),
      aluno_telefone: studentPhone(aluno),
      valor_total: valor || prev.valor_total,
      valor_parcela: valor || prev.valor_parcela,
      vencimento: venc,
    }));
    setErro("");
  }

  async function excluir() {
    if (!confirm("Excluir este lancamento? Esta acao nao pode ser desfeita.")) return;
    setSaving(true);
    await fetch(`/api/financeiro?id=${lancamento!.id}&tipo=${form.tipo_lancamento}`, { method: "DELETE" });
    setSaving(false);
    onSaved();
  }

  async function salvar() {
    if (isRecebimento && !form.aluno.trim()) {
      setErro("Selecione ou informe o aluno.");
      return;
    }
    if (!form.vencimento) { setErro("Informe a data de vencimento."); return; }
    if (parseMoney(form.valor_total || form.valor_parcela) <= 0) { setErro("Informe o valor total."); return; }

    setSaving(true);
    const erros: string[] = [];
    const links: { whatsapp?: { phone: string; message: string }; email: string; label: string }[] = [];

    try {
      let boletoPdfData: Record<string, string> = {};
      if (boletoPdf) {
        const fd = new FormData();
        fd.set("arquivo_pdf", boletoPdf);
        const upRes = await fetchWithTimeout("/api/financeiro/upload-pdf", { method: "POST", body: fd });
        if (!upRes.ok) {
          const d = await upRes.json().catch(() => ({}));
          setErro(String(d.error || "Erro ao fazer upload do boleto PDF."));
          return;
        }
        const upData = await upRes.json();
        boletoPdfData = {
          boleto_pdf_url: text(upData.url),
          boleto_pdf_b64: text(upData.b64),
          boleto_pdf_mime: text(upData.mime || "application/pdf"),
          boleto_pdf_nome: text(upData.nome || boletoPdf.name),
        };
      }

    if (isEdit) {
      const payload = {
        id: lancamento!.id,
        tipo: form.tipo_lancamento,
        aluno_id: form.aluno_id,
        aluno: form.aluno,
        aluno_login: form.aluno_login,
        telefone: form.aluno_telefone,
        whatsapp: form.aluno_telefone,
        email: form.aluno_email,
        data_lancamento: form.data_lancamento,
        descricao: form.descricao,
        valor: form.valor_parcela || form.valor_total,
        valor_total: form.valor_total,
        valor_parcela: form.valor_parcela || form.valor_total,
        vencimento: form.vencimento,
        data_vencimento: form.vencimento,
        status: form.status,
        tipo_lancamento_detalhe: form.categoria,
        categoria: form.categoria,
        observacoes: form.observacoes,
        gerar_boleto: form.gerar_boleto,
        ...(boletoPdfData.boleto_pdf_b64 || boletoPdfData.boleto_pdf_url ? { ...boletoPdfData, boleto_status: "Importado", status: "Boleto importado" } : {}),
        enviar_whatsapp: form.enviar_whatsapp,
        enviar_email: form.enviar_email,
        notification_status: {
          email: form.enviar_email ? "link_gerado" : "nao_enviado",
          whatsapp: form.enviar_whatsapp ? "link_gerado" : "nao_enviado",
        },
      };
      const res = await fetchWithTimeout("/api/financeiro", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        const detail = text(d.detail);
        setErro(detail ? `${String(d.error || "Erro ao salvar.")} (${detail})` : String(d.error || "Erro ao salvar."));
        return;
      }
      const data = await res.json().catch(() => ({}));
      const item = data.lancamento || payload;
      const msg = financeMessage(item, window.location.origin);
      links.push({
        label: text(item.parcela) || "Parcela",
        whatsapp: form.enviar_whatsapp ? { phone: form.aluno_telefone, message: msg.body } : undefined,
        email: form.enviar_email ? mailtoUrl(text(item.email || form.aluno_email), msg.subject, msg.body) : "",
      });
      setSavedLinks(links);
      onSaved();
      return;
    }

    const valorParcela = isMensalidade ? parseMoney(form.valor_total || form.valor_parcela) : (parseMoney(form.valor_parcela) || valorParcelaCalc);
    for (let i = 0; i < qtdParcelas; i++) {
      const parcelaNumero = (Number.parseInt(form.parcela_inicial) || 1) + i;
      const vencStr = addMonths(form.vencimento, i);
      const parcelaTxt = qtdParcelas > 1 ? `${parcelaNumero}/${qtdParcelas}` : String(parcelaNumero);
      const desc = `${form.categoria}${form.descricao && form.descricao !== form.categoria ? ` - ${form.descricao}` : ""}${!isMensalidade && qtdParcelas > 1 ? ` - Parcela ${parcelaTxt}` : ""}`;
      const payload = {
        tipo: form.tipo_lancamento,
        aluno_id: form.aluno_id,
        aluno: form.aluno,
        aluno_login: form.aluno_login,
        telefone: form.aluno_telefone,
        whatsapp: form.aluno_telefone,
        email: form.aluno_email,
        data_lancamento: form.data_lancamento,
        descricao: desc,
        valor: moneyInput(valorParcela),
        valor_total: moneyInput(total || valorParcela * qtdParcelas),
        valor_parcela: moneyInput(valorParcela),
        vencimento: vencStr,
        data_vencimento: vencStr,
        status: form.status,
        tipo_lancamento_detalhe: form.categoria,
        categoria: form.categoria,
        ...(isMensalidade ? {
          competencia: vencStr.slice(0, 7),
          origem: "mensalidade_manual",
        } : {
          parcela_numero: parcelaNumero,
          parcela_total: qtdParcelas,
          parcela: parcelaTxt,
        }),
        observacoes: form.observacoes,
        gerar_boleto: form.gerar_boleto,
        ...(boletoPdfData.boleto_pdf_b64 || boletoPdfData.boleto_pdf_url ? { ...boletoPdfData, boleto_status: "Importado" } : {}),
        enviar_whatsapp: form.enviar_whatsapp,
        enviar_email: form.enviar_email,
        notification_status: {
          email: form.enviar_email ? "link_gerado" : "nao_enviado",
          whatsapp: form.enviar_whatsapp ? "link_gerado" : "nao_enviado",
        },
      };
      const res = await fetchWithTimeout("/api/financeiro", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        const detail = text(d.detail);
        erros.push(detail ? `${String(d.error || `Erro na parcela ${i + 1}.`)} (${detail})` : String(d.error || `Erro na parcela ${i + 1}.`));
      } else {
        const data = await res.json().catch(() => ({}));
        const item = data.lancamento || payload;
        const msg = financeMessage(item, window.location.origin);
        links.push({
          label: isMensalidade ? "Mensalidade" : `Parcela ${parcelaTxt}`,
          whatsapp: form.enviar_whatsapp ? { phone: form.aluno_telefone, message: msg.body } : undefined,
          email: form.enviar_email ? mailtoUrl(text(item.email || form.aluno_email), msg.subject, msg.body) : "",
        });
      }
    }

    setSaving(false);
    if (erros.length) { setErro(erros.join(" | ")); return; }
    setSavedLinks(links);
    onSaved();
    } catch (err) {
      setErro(err instanceof DOMException && err.name === "AbortError" ? "Tempo esgotado ao salvar. Verifique sua conexao e tente novamente." : "Erro de conexao ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 980 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{isEdit ? "Editar recebimento" : "Lancar recebimento de aluno"}</div>
            <div className="modal-subtitle">{isRecebimento ? "Matricula, mensalidade, material, renegociacao e boletos" : "Despesa / custo"}</div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
          </button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            {!isEdit && (
              <div className="form-group form-group-span2">
                <label className="form-label">Tipo de lancamento</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["recebimentos", "despesas"] as const).map((tipo) => (
                    <button key={tipo} type="button" className={form.tipo_lancamento === tipo ? "btn btn-primary" : "btn btn-secondary"} style={{ flex: 1 }} onClick={() => update("tipo_lancamento", tipo)}>
                      {tipo === "recebimentos" ? "Recebimento de aluno" : "Despesa"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isRecebimento ? (
              <>
                <div className="form-group form-group-span2">
                  <label className="form-label">Aluno *</label>
                  <select className="form-input" value={form.aluno_id} onChange={(e) => selecionarAluno(e.target.value)} autoFocus>
                    <option value="">Selecione o aluno</option>
                    {alunos.map((aluno, index) => (
                      <option key={studentIdentifier(aluno, index)} value={studentIdentifier(aluno, index)}>
                        {studentName(aluno) || "Aluno sem nome"}{text(aluno.turma || aluno.classe) ? ` - ${text(aluno.turma || aluno.classe)}` : ""}
                      </option>
                    ))}
                  </select>
                  <div className="form-help">Ao selecionar, o sistema puxa nome, login, telefone, e-mail e mensalidade cadastrada.</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Aluno selecionado</label>
                  <input className="form-input" value={form.aluno} onChange={(e) => update("aluno", e.target.value)} placeholder="Nome do aluno" />
                </div>
                <div className="form-group">
                  <label className="form-label">Login do aluno</label>
                  <input className="form-input" value={form.aluno_login} onChange={(e) => update("aluno_login", e.target.value)} placeholder="Opcional" />
                </div>
                <div className="form-group">
                  <label className="form-label">WhatsApp</label>
                  <input className="form-input" value={form.aluno_telefone} onChange={(e) => update("aluno_telefone", e.target.value)} placeholder="Telefone do responsavel/aluno" />
                </div>
                <div className="form-group">
                  <label className="form-label">E-mail</label>
                  <input className="form-input" type="email" value={form.aluno_email} onChange={(e) => update("aluno_email", e.target.value)} placeholder="E-mail do responsavel/aluno" />
                </div>
              </>
            ) : (
              <div className="form-group form-group-span2">
                <label className="form-label">Fornecedor / descricao</label>
                <input className="form-input" value={form.aluno} onChange={(e) => update("aluno", e.target.value)} autoFocus />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Data de lancamento *</label>
              <input className="form-input" type="date" value={form.data_lancamento} onChange={(e) => update("data_lancamento", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Primeiro vencimento *</label>
              <input className="form-input" type="date" value={form.vencimento} onChange={(e) => update("vencimento", e.target.value)} />
            </div>
            {isRecebimento && (
              <div className="form-group">
                <label className="form-label">Tipo de cobranca *</label>
                <select className="form-input" value={form.categoria} onChange={(e) => update("categoria", e.target.value)}>
                  {CATEGORIAS_RECEBIMENTO.map((cat) => <option key={cat}>{cat}</option>)}
                </select>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Referencia</label>
              <input className="form-input" placeholder="Ex: Maio/2026, Livro 3, acordo 01" value={form.descricao} onChange={(e) => update("descricao", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">{isMensalidade ? "Valor da mensalidade (R$) *" : "Valor total (R$) *"}</label>
              <input className="form-input" inputMode="decimal" placeholder="0,00" value={form.valor_total} onChange={(e) => updateValorTotal(e.target.value)} />
            </div>
            {!isEdit && !isMensalidade && (
              <>
                <div className="form-group">
                  <label className="form-label">Numero de parcelas *</label>
                  <input className="form-input" type="number" min={1} max={48} value={form.qtd_parcelas} onChange={(e) => updateParcelas(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Parcela inicial</label>
                  <input className="form-input" type="number" min={1} value={form.parcela_inicial} onChange={(e) => update("parcela_inicial", e.target.value)} />
                </div>
              </>
            )}
            <div className="form-group">
              <label className="form-label">{isMensalidade ? "Valor mensal" : "Valor da parcela"}</label>
              <input className="form-input" inputMode="decimal" value={form.valor_parcela} onChange={(e) => update("valor_parcela", e.target.value)} />
              <div className="form-help">
                {isMensalidade
                  ? "Mensalidade e lancada como uma cobranca unica por mes. A recorrencia automatica vem do cadastro do aluno."
                  : `Calculo automatico: ${qtdParcelas}x de ${formatBRL(valorParcelaCalc || parseMoney(form.valor_parcela))}`}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-input" value={form.status} onChange={(e) => update("status", e.target.value)}>
                <option>Pendente</option>
                <option>Boleto gerado</option>
                <option>Boleto importado</option>
                <option>Pago</option>
                <option>Atrasado</option>
                <option>Cancelado</option>
              </select>
            </div>
            {isRecebimento && (
              <>
                <div className="form-group form-group-span2">
                  <label className="form-label">Boleto PDF (opcional)</label>
                  <input
                    className="form-input"
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(e) => { setBoletoPdf(e.target.files?.[0] || null); setErro(""); }}
                  />
                  {boletoPdf && (
                    <div className="form-help" style={{ color: "var(--green-700)" }}>
                      Arquivo selecionado: {boletoPdf.name} — sera enviado por WhatsApp/e-mail e disponibilizado no painel do aluno.
                    </div>
                  )}
                </div>
                <div className="form-group form-group-span2">
                  <label className="form-label">Boleto e envio</label>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <label className="checkbox-row"><input type="checkbox" checked={form.gerar_boleto} onChange={(e) => update("gerar_boleto", e.target.checked)} /> Gerar boleto/fatura no sistema</label>
                    <label className="checkbox-row"><input type="checkbox" checked={form.enviar_whatsapp} onChange={(e) => update("enviar_whatsapp", e.target.checked)} /> Enviar por WhatsApp ao salvar</label>
                    <label className="checkbox-row"><input type="checkbox" checked={form.enviar_email} onChange={(e) => update("enviar_email", e.target.checked)} /> Enviar por e-mail ao salvar</label>
                  </div>
                </div>
              </>
            )}
            <div className="form-group form-group-span2">
              <label className="form-label">Observacoes</label>
              <textarea className="form-input form-textarea" rows={2} value={form.observacoes} onChange={(e) => update("observacoes", e.target.value)} />
            </div>
          </div>

          {alunoSelecionado && (
            <div className="alert alert-info" style={{ marginTop: 12 }}>
              Aluno puxado automaticamente: {studentName(alunoSelecionado)} | Turma: {text(alunoSelecionado.turma || alunoSelecionado.classe) || "-"} | Mensalidade: {text(alunoSelecionado.valor_mensalidade) || "-"}
            </div>
          )}
          {savedLinks.length > 0 && (
            <div className="alert alert-success" style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Lancamento salvo. Envie os boletos agora:</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {savedLinks.map((link, index) => (
                  <span key={`${link.label}-${index}`} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {link.whatsapp && <WhatsAppSendButton phone={link.whatsapp.phone} message={link.whatsapp.message} label={`WhatsApp ${link.label}`} />}
                    {link.email && <a className="btn btn-secondary btn-sm" href={link.email}>E-mail {link.label}</a>}
                  </span>
                ))}
              </div>
            </div>
          )}
          {erro && <div className="form-error">{erro}</div>}
        </div>
        <div className="modal-footer">
          {isEdit && <button className="btn btn-danger btn-sm" onClick={excluir} disabled={saving} style={{ marginRight: "auto" }}>Excluir</button>}
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={saving}>
            {saving ? "Salvando..." : isEdit ? "Salvar alteracoes" : isMensalidade ? "Salvar mensalidade" : "Salvar e gerar parcelas"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function NovoLancamentoBtn({ alunos = [] }: { alunos?: AlunoOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
        Novo recebimento
      </button>
      {open && (
        <LancamentoModal
          alunos={alunos}
          onClose={() => setOpen(false)}
          onSaved={() => { refreshKeepingPosition(router); }}
        />
      )}
    </>
  );
}

export function ImportarBoletoPdfBtn({
  alunos = [],
  alunoInicial,
  label = "Importar boleto PDF",
  className = "btn btn-secondary",
}: {
  alunos?: AlunoOption[];
  alunoInicial?: AlunoOption;
  label?: string;
  className?: string;
}) {
  const alunosDisponiveis = alunoInicial
    ? [alunoInicial, ...alunos.filter((aluno) => studentIdentifier(aluno) !== studentIdentifier(alunoInicial))]
    : alunos;
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [links, setLinks] = useState<{ whatsapp?: { phone: string; message: string }; email: string } | null>(null);
  const [form, setForm] = useState(() => boletoImportForm(alunoInicial));
  const router = useRouter();

  function abrir() {
    setForm(boletoImportForm(alunoInicial));
    setArquivo(null);
    setErro("");
    setLinks(null);
    setOpen(true);
  }

  function update<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErro("");
    setLinks(null);
  }

  function selecionarAluno(id: string) {
    const aluno = findStudentByIdentifier(alunosDisponiveis, id);
    if (!aluno) return;
    setForm((prev) => ({
      ...prev,
      aluno_id: studentIdentifier(aluno),
      aluno: studentName(aluno),
      aluno_login: studentLogin(aluno),
      aluno_email: studentEmail(aluno),
      aluno_telefone: studentPhone(aluno),
      valor: studentMonthlyValue(aluno) || prev.valor,
      vencimento: text(aluno.vencimento) || prev.vencimento,
    }));
  }

  async function importar() {
    if (!arquivo) { setErro("Selecione o arquivo PDF do boleto."); return; }
    if (!form.aluno.trim()) { setErro("Selecione ou informe o aluno."); return; }

    const payload = new FormData();
    payload.set("arquivo_pdf", arquivo);
    Object.entries(form).forEach(([key, value]) => payload.set(key, String(value)));

    setSaving(true);
    try {
      const res = await fetchWithTimeout("/api/financeiro/boleto-upload", { method: "POST", body: payload });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(String(data.error || "Erro ao importar boleto PDF."));
        return;
      }
      const item = data.lancamento as LancamentoData;
      const msg = financeMessage(item, window.location.origin);
      setLinks({
        whatsapp: form.enviar_whatsapp ? { phone: form.aluno_telefone, message: msg.body } : undefined,
        email: form.enviar_email ? mailtoUrl(text(form.aluno_email || item.email), msg.subject, msg.body) : "",
      });
      refreshKeepingPosition(router);
    } catch (err) {
      setErro(err instanceof DOMException && err.name === "AbortError" ? "Tempo esgotado ao importar boleto. Tente novamente." : "Erro de conexao ao importar boleto.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button className={className} onClick={abrir}>
        <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM10 2a1 1 0 011 1v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3A1 1 0 017.707 9.293L9 10.586V3a1 1 0 011-1z" clipRule="evenodd" /></svg>
        {label}
      </button>
      {open && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal-box" style={{ maxWidth: 920 }}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Importar boleto em PDF para aluno</div>
                <div className="modal-subtitle">Selecione o aluno, anexe o PDF e envie por WhatsApp/e-mail ao salvar</div>
              </div>
              <button className="modal-close" onClick={() => setOpen(false)}>
                <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group form-group-span2">
                  <label className="form-label">Aluno *</label>
                  <select className="form-input" value={form.aluno_id} onChange={(e) => selecionarAluno(e.target.value)} autoFocus>
                    <option value="">Selecione o aluno</option>
                    {alunosDisponiveis.map((aluno, index) => (
                      <option key={studentIdentifier(aluno, index)} value={studentIdentifier(aluno, index)}>
                        {studentName(aluno) || "Aluno sem nome"}{text(aluno.turma || aluno.classe) ? ` - ${text(aluno.turma || aluno.classe)}` : ""}
                      </option>
                    ))}
                  </select>
                  <div className="form-help">{alunosDisponiveis.length ? `${alunosDisponiveis.length} aluno(s) carregado(s) do cadastro.` : "Nenhum aluno carregado do cadastro. Os campos manuais continuam disponiveis."}</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Nome do aluno</label>
                  <input className="form-input" value={form.aluno} onChange={(e) => update("aluno", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Login</label>
                  <input className="form-input" value={form.aluno_login} onChange={(e) => update("aluno_login", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">WhatsApp</label>
                  <input className="form-input" value={form.aluno_telefone} onChange={(e) => update("aluno_telefone", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">E-mail</label>
                  <input className="form-input" type="email" value={form.aluno_email} onChange={(e) => update("aluno_email", e.target.value)} />
                </div>
                <div className="form-group form-group-span2">
                  <label className="form-label">Arquivo PDF do boleto *</label>
                  <input className="form-input" type="file" accept="application/pdf,.pdf" onChange={(e) => setArquivo(e.target.files?.[0] || null)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo</label>
                  <select className="form-input" value={form.categoria} onChange={(e) => update("categoria", e.target.value)}>
                    {CATEGORIAS_RECEBIMENTO.map((cat) => <option key={cat}>{cat}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Valor (R$)</label>
                  <input className="form-input" inputMode="decimal" value={form.valor} onChange={(e) => update("valor", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Vencimento</label>
                  <input className="form-input" type="date" value={form.vencimento} onChange={(e) => update("vencimento", e.target.value)} />
                  <div className="form-help">Opcional no anexo. Se o boleto ja tem vencimento no PDF, voce pode deixar em branco e ajustar depois.</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Descricao</label>
                  <input className="form-input" value={form.descricao} onChange={(e) => update("descricao", e.target.value)} />
                </div>
                <div className="form-group form-group-span2">
                  <label className="form-label">Envio</label>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <label className="checkbox-row"><input type="checkbox" checked={form.enviar_whatsapp} onChange={(e) => update("enviar_whatsapp", e.target.checked)} /> Enviar por WhatsApp ao salvar</label>
                    <label className="checkbox-row"><input type="checkbox" checked={form.enviar_email} onChange={(e) => update("enviar_email", e.target.checked)} /> Enviar por e-mail ao salvar</label>
                  </div>
                </div>
                <div className="form-group form-group-span2">
                  <label className="form-label">Observacoes</label>
                  <textarea className="form-input form-textarea" rows={2} value={form.observacoes} onChange={(e) => update("observacoes", e.target.value)} />
                </div>
              </div>
              {links && (
                <div className="alert alert-success" style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 800, marginBottom: 8 }}>Boleto salvo. Envie agora:</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {links.whatsapp && <WhatsAppSendButton phone={links.whatsapp.phone} message={links.whatsapp.message} label="WhatsApp" />}
                    {links.email && <a className="btn btn-secondary btn-sm" href={links.email}>Enviar por e-mail</a>}
                  </div>
                </div>
              )}
              {erro && <div className="form-error">{erro}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setOpen(false)} disabled={saving}>Cancelar</button>
              <button className="btn btn-primary" onClick={importar} disabled={saving}>{saving ? "Importando..." : "Salvar boleto e gerar envio"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function EditarLancamentoBtn({ lancamento, tipo }: { lancamento: LancamentoData; tipo: "recebimentos" | "despesas" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-ghost btn-sm btn-icon" title="Editar" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
      </button>
      {open && (
        <LancamentoModal
          lancamento={lancamento}
          tipoInicial={tipo}
          onClose={() => setOpen(false)}
          onSaved={() => { refreshKeepingPosition(router); }}
        />
      )}
    </>
  );
}

export function BaixaBtn({ lancamento, tipo }: { lancamento: LancamentoData; tipo: "recebimentos" | "despesas" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [aviso, setAviso] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    valor_pago: text(lancamento.valor_parcela || lancamento.valor),
    forma_pagamento: "PIX",
    data_baixa: hoje(),
    banco_destino: "",
    observacao_baixa: "",
  });
  const jaFoiBaixado = text(lancamento.status).toLowerCase().includes("pago") ||
    text(lancamento.status).toLowerCase().includes("baixado");

  if (jaFoiBaixado) return null;

  async function darBaixa() {
    setLoading(true);
    try {
      const res = await fetchWithTimeout("/api/financeiro", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: [lancamento.id],
          tipo,
          data_baixa: form.data_baixa,
          valor_pago: form.valor_pago,
          forma_pagamento: form.forma_pagamento,
          banco_destino: form.banco_destino,
          observacao_baixa: form.observacao_baixa,
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(String(data.error || "Erro ao registrar baixa."));
        return;
      }
      setOpen(false);
      setAviso(true);
      setTimeout(() => setAviso(false), 3500);
      refreshKeepingPosition(router);
    } catch (err) {
      alert(err instanceof DOMException && err.name === "AbortError" ? "Tempo esgotado ao registrar baixa." : "Erro de conexao ao registrar baixa.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button className="btn btn-ghost btn-sm" style={{ fontSize: "0.75rem", color: "var(--green-700)" }} onClick={() => setOpen(true)} disabled={loading} title="Registrar pagamento">
        {loading ? "..." : "Baixa"}
      </button>
      {aviso && <span className="badge badge-success"><span className="badge-dot" />Recibo automatico</span>}
      {open && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal-box" style={{ maxWidth: 540 }}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Registrar pagamento</div>
                <div className="modal-subtitle">Baixa com recibo automatico e log de auditoria</div>
              </div>
              <button className="modal-close" onClick={() => setOpen(false)}>
                <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group"><label className="form-label">Valor pago</label><input className="form-input" inputMode="decimal" value={form.valor_pago} onChange={(e) => setForm((p) => ({ ...p, valor_pago: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Data do pagamento</label><input className="form-input" type="date" value={form.data_baixa} onChange={(e) => setForm((p) => ({ ...p, data_baixa: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Forma</label><select className="form-input" value={form.forma_pagamento} onChange={(e) => setForm((p) => ({ ...p, forma_pagamento: e.target.value }))}><option>PIX</option><option>Boleto</option><option>Dinheiro</option><option>Cartao</option><option>TED</option><option>Cheque</option></select></div>
                <div className="form-group"><label className="form-label">Banco / conta</label><input className="form-input" value={form.banco_destino} onChange={(e) => setForm((p) => ({ ...p, banco_destino: e.target.value }))} /></div>
                <div className="form-group form-group-span2"><label className="form-label">Observacao</label><textarea className="form-input form-textarea" rows={3} value={form.observacao_baixa} onChange={(e) => setForm((p) => ({ ...p, observacao_baixa: e.target.value }))} /></div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setOpen(false)} disabled={loading}>Cancelar</button>
              <button className="btn btn-primary" onClick={darBaixa} disabled={loading}>{loading ? "Salvando..." : "Confirmar baixa"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function EstornoBtn({ lancamento, tipo, canReverse = true }: { lancamento: LancamentoData; tipo: "recebimentos" | "despesas"; canReverse?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const pago = text(lancamento.status).toLowerCase().includes("pago") ||
    text(lancamento.status).toLowerCase().includes("baixado");
  if (!pago || !canReverse) return null;

  async function estornar() {
    const motivo = prompt("Motivo do estorno (obrigatorio):");
    if (!motivo?.trim()) return;
    setLoading(true);
    const res = await fetch("/api/financeiro", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: lancamento.id, tipo, estorno: true, estorno_motivo: motivo })
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(String(data.error || "Erro ao estornar."));
      return;
    }
    refreshKeepingPosition(router);
  }

  return (
    <button className="btn btn-ghost btn-sm" style={{ fontSize: "0.72rem", color: "var(--red-700)" }} onClick={estornar} disabled={loading} title="Estornar baixa com auditoria">
      {loading ? "..." : "Estornar"}
    </button>
  );
}
