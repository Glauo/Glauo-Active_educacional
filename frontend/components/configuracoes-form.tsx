"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { DEFAULT_LOCALE, type AppLocale } from "@/lib/locale";

type SistemaConfig = {
  display_language?: string;
  nome_escola?: string; cnpj?: string; telefone?: string; email_contato?: string; endereco?: string; cidade?: string; estado?: string; cep?: string; [k: string]: unknown };
type SmtpConfig = { host?: string; port?: number | string; user?: string; from_name?: string; from_email?: string; tls?: string | boolean; enabled?: boolean; [k: string]: unknown };
type BoletoConfig = { banco?: string; agencia?: string; conta?: string; cedente?: string; carteira?: string; instrucoes?: string; dias_vencimento?: number | string; mp_access_token?: string; mp_public_key?: string; mp_client_id?: string; [k: string]: unknown };

type Props = { sistema: SistemaConfig; smtp: SmtpConfig; boleto: BoletoConfig };

async function salvarSecao(secao: string, dados: Record<string, unknown>): Promise<string | null> {
  const res = await fetch("/api/configuracoes", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secao, dados }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    return (d as { error?: string }).error || "Erro ao salvar.";
  }
  return null;
}

export function ConfiguracoesForm({ sistema: s0, smtp: m0, boleto: b0 }: Props) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const tl = useTranslations("locale");
  const [sistema, setSistema] = useState<SistemaConfig>({
    ...s0,
    display_language: (s0.display_language as AppLocale) || DEFAULT_LOCALE,
  });
  const [smtp, setSmtp] = useState<SmtpConfig>(m0);
  const [boleto, setBoleto] = useState<BoletoConfig>(b0);
  const [smtpSenha, setSmtpSenha] = useState("");
  const [saving, setSaving] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: "ok" | "erro"; msg: string } | null>(null);
  const backupInputRef = useRef<HTMLInputElement | null>(null);

  function sys(field: keyof SistemaConfig, value: string) { setSistema((p) => ({ ...p, [field]: value })); }
  function mtp(field: keyof SmtpConfig, value: string | boolean) { setSmtp((p) => ({ ...p, [field]: value })); }
  function bol(field: keyof BoletoConfig, value: string) { setBoleto((p) => ({ ...p, [field]: value })); }

  async function salvarTudo() {
    setSaving(true);
    setFeedback(null);
    const smtpPayload = smtpSenha ? { ...smtp, senha: smtpSenha } : smtp;
    const erros = await Promise.all([
      salvarSecao("sistema", sistema as Record<string, unknown>),
      salvarSecao("smtp", smtpPayload as Record<string, unknown>),
      salvarSecao("boleto", boleto as Record<string, unknown>),
    ]);
    setSaving(false);
    const erro = erros.find(Boolean);
    setFeedback(erro ? { tipo: "erro", msg: erro } : { tipo: "ok", msg: tc("savedSuccess") });
    setTimeout(() => setFeedback(null), 4000);
  }

  function baixarBackup() {
    window.location.href = "/api/backup";
  }

  async function importarBackup(file: File | null) {
    if (!file) return;
    if (!confirm("Importar este bkup vai substituir os dados atuais do sistema pelas informacoes do arquivo. Deseja continuar?")) {
      if (backupInputRef.current) backupInputRef.current.value = "";
      return;
    }

    setBackupLoading(true);
    setFeedback(null);
    const formData = new FormData();
    formData.append("backup", file);
    const res = await fetch("/api/backup", { method: "POST", body: formData });
    const data = await res.json().catch(() => ({}));
    setBackupLoading(false);
    if (backupInputRef.current) backupInputRef.current.value = "";
    if (!res.ok) {
      setFeedback({ tipo: "erro", msg: String((data as { error?: string }).error || "Erro ao importar bkup.") });
      return;
    }
    setFeedback({ tipo: "ok", msg: `Bkup importado com sucesso. ${String((data as { restored?: number }).restored || 0)} bases restauradas.` });
    setTimeout(() => window.location.reload(), 1200);
  }

  async function repararSistema() {
    if (!confirm("Executar reparo agora? Isso remove parcelas duplicadas, limpa dados pesados de PDF do banco e tenta recriar turmas sumidas sem apagar alunos.")) return;
    setBackupLoading(true);
    setFeedback(null);
    const res = await fetch("/api/admin/repair", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBackupLoading(false);
    if (!res.ok) {
      setFeedback({ tipo: "erro", msg: String((data as { error?: string }).error || "Erro ao reparar sistema.") });
      return;
    }
    const actions = Array.isArray((data as { actions?: unknown[] }).actions) ? (data as { actions: unknown[] }).actions : [];
    setFeedback({ tipo: "ok", msg: actions.length ? `Reparo concluido: ${actions.join(", ")}` : "Reparo concluido. Nenhum ajuste pendente encontrado." });
    setTimeout(() => window.location.reload(), 1500);
  }

  return (
    <>
      {/* Header fixo com botão salvar */}
      <div className="page-header">
        <div className="page-title-block">
          <div className="page-eyebrow"><span className="page-eyebrow-dot" />{t("eyebrow")}</div>
          <h1 className="page-title">{t("title")}</h1>
          <p className="page-description">{t("description")}</p>
        </div>
        <div className="page-actions">
          <input
            ref={backupInputRef}
            type="file"
            accept=".json,.zip,application/json,application/zip"
            style={{ display: "none" }}
            onChange={(e) => void importarBackup(e.target.files?.[0] || null)}
          />
          {feedback && (
            <div style={{
              padding: "10px 16px", borderRadius: "var(--radius-md)", fontSize: "0.875rem", fontWeight: 600,
              background: feedback.tipo === "ok" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
              color: feedback.tipo === "ok" ? "var(--green-700)" : "var(--red-700)",
              border: `1px solid ${feedback.tipo === "ok" ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
            }}>
              {feedback.tipo === "ok" ? "✓ " : "✗ "}{feedback.msg}
            </div>
          )}
          <button className="btn btn-secondary" type="button" onClick={baixarBackup} disabled={backupLoading}>
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            Fazer bkup
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => backupInputRef.current?.click()} disabled={backupLoading}>
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a2 2 0 012-2h7.586A2 2 0 0114 1.586L17.414 5A2 2 0 0118 6.414V17a2 2 0 01-2 2H5a2 2 0 01-2-2V3zm8 0H5v14h11V8h-5V3zm-1 7a1 1 0 011 1v2.586l.293-.293a1 1 0 111.414 1.414l-2 2a1 1 0 01-1.414 0l-2-2a1 1 0 111.414-1.414l.293.293V11a1 1 0 011-1z" clipRule="evenodd" /></svg>
            {backupLoading ? "Importando..." : "Importar bkup"}
          </button>
          <button className="btn btn-danger" type="button" onClick={repararSistema} disabled={backupLoading}>
            Reparar sistema
          </button>
          <button className="btn btn-primary" onClick={salvarTudo} disabled={saving}>
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
            {saving ? tc("saving") : tc("save")}
          </button>
        </div>
      </div>

      <div className="content-grid grid-2">
        {/* Idioma de exibição */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="section-eyebrow">{t("displayLanguage.eyebrow")}</div>
              <h3 className="section-title">{t("displayLanguage.title")}</h3>
            </div>
          </div>
          <div className="card-body">
            <div className="form-grid">
              <div className="form-group form-group-span2">
                <label className="form-label">{t("displayLanguage.label")}</label>
                <select
                  className="form-input"
                  value={String(sistema.display_language || DEFAULT_LOCALE)}
                  onChange={(e) => sys("display_language", e.target.value)}
                >
                  <option value="pt-BR">{tl("ptBR")}</option>
                  <option value="en-US">{tl("enUS")}</option>
                </select>
                <div className="form-help">{t("displayLanguage.help")}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Dados da escola */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="section-eyebrow">Identidade</div>
              <h3 className="section-title">Dados da escola</h3>
            </div>
          </div>
          <div className="card-body">
            <div className="form-grid">
              <div className="form-group form-group-span2">
                <label className="form-label">Nome da escola</label>
                <input className="form-input" value={String(sistema.nome_escola || "")} onChange={(e) => sys("nome_escola", e.target.value)} placeholder="Ex: Active Educacional Ltda." />
              </div>
              <div className="form-group">
                <label className="form-label">CNPJ</label>
                <input className="form-input" value={String(sistema.cnpj || "")} onChange={(e) => sys("cnpj", e.target.value)} placeholder="00.000.000/0001-00" />
              </div>
              <div className="form-group">
                <label className="form-label">Telefone</label>
                <input className="form-input" value={String(sistema.telefone || "")} onChange={(e) => sys("telefone", e.target.value)} placeholder="(11) 99999-0000" />
              </div>
              <div className="form-group form-group-span2">
                <label className="form-label">E-mail de contato</label>
                <input className="form-input" type="email" value={String(sistema.email_contato || "")} onChange={(e) => sys("email_contato", e.target.value)} placeholder="contato@active.edu.br" />
              </div>
              <div className="form-group form-group-span2">
                <label className="form-label">Endereço</label>
                <input className="form-input" value={String(sistema.endereco || "")} onChange={(e) => sys("endereco", e.target.value)} placeholder="Rua, número, bairro" />
              </div>
              <div className="form-group">
                <label className="form-label">Cidade</label>
                <input className="form-input" value={String(sistema.cidade || "")} onChange={(e) => sys("cidade", e.target.value)} placeholder="São Paulo" />
              </div>
              <div className="form-group">
                <label className="form-label">Estado</label>
                <input className="form-input" value={String(sistema.estado || "")} onChange={(e) => sys("estado", e.target.value)} placeholder="SP" maxLength={2} />
              </div>
              <div className="form-group">
                <label className="form-label">CEP</label>
                <input className="form-input" value={String(sistema.cep || "")} onChange={(e) => sys("cep", e.target.value)} placeholder="00000-000" />
              </div>
            </div>
          </div>
        </div>

        {/* SMTP */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="section-eyebrow">Integração</div>
              <h3 className="section-title">Configuração de e-mail (SMTP)</h3>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span className={`badge badge-${smtp.enabled ? "success" : "neutral"}`}>
                <span className="badge-dot" />{smtp.enabled ? "Ativo" : "Inativo"}
              </span>
              <button
                type="button"
                className={`btn btn-sm ${smtp.enabled ? "btn-secondary" : "btn-primary"}`}
                onClick={() => mtp("enabled", !smtp.enabled)}
              >
                {smtp.enabled ? "Desativar" : "Ativar"}
              </button>
            </div>
          </div>
          <div className="card-body">
            <div className="form-grid">
              <div className="form-group form-group-span2">
                <label className="form-label">Servidor SMTP</label>
                <input className="form-input" value={String(smtp.host || "")} onChange={(e) => mtp("host", e.target.value)} placeholder="smtp.gmail.com" />
              </div>
              <div className="form-group">
                <label className="form-label">Porta</label>
                <input className="form-input" type="number" value={String(smtp.port || "587")} onChange={(e) => mtp("port", e.target.value)} placeholder="587" />
              </div>
              <div className="form-group">
                <label className="form-label">Usuário</label>
                <input className="form-input" value={String(smtp.user || "")} onChange={(e) => mtp("user", e.target.value)} placeholder="email@dominio.com" />
              </div>
              <div className="form-group form-group-span2">
                <label className="form-label">Nova senha</label>
                <input className="form-input" type="password" value={smtpSenha} onChange={(e) => setSmtpSenha(e.target.value)} placeholder="Deixe em branco para manter a atual" />
              </div>
              <div className="form-group form-group-span2">
                <label className="form-label">Nome do remetente</label>
                <input className="form-input" value={String(smtp.from_name || "")} onChange={(e) => mtp("from_name", e.target.value)} placeholder="Active Educacional" />
              </div>
              <div className="form-group">
                <label className="form-label">E-mail remetente</label>
                <input className="form-input" type="email" value={String(smtp.from_email || smtp.from || "")} onChange={(e) => mtp("from_email", e.target.value)} placeholder="financeiro@active.edu.br" />
              </div>
              <div className="form-group">
                <label className="form-label">Segurança</label>
                <select className="form-input" value={String(smtp.tls ?? "1")} onChange={(e) => mtp("tls", e.target.value)}>
                  <option value="1">STARTTLS / TLS ativo</option>
                  <option value="0">Sem TLS</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* WhatsApp W-API */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="section-eyebrow">Integração</div>
              <h3 className="section-title">WhatsApp W-API</h3>
            </div>
            <span className={`badge badge-${sistema.WAPI_BASE_URL && sistema.WAPI_TOKEN && sistema.WAPI_INSTANCE_ID ? "success" : "warning"}`}>
              <span className="badge-dot" />{sistema.WAPI_BASE_URL && sistema.WAPI_TOKEN && sistema.WAPI_INSTANCE_ID ? "Configurado" : "Pendente"}
            </span>
          </div>
          <div className="card-body">
            <div className="form-grid">
              <div className="form-group form-group-span2">
                <label className="form-label">URL base da W-API</label>
                <input className="form-input" value={String(sistema.WAPI_BASE_URL || "")} onChange={(e) => sys("WAPI_BASE_URL", e.target.value)} placeholder="https://sua-wapi.com.br" />
              </div>
              <div className="form-group">
                <label className="form-label">Token / API Key</label>
                <input className="form-input" type="password" value={String(sistema.WAPI_TOKEN || "")} onChange={(e) => sys("WAPI_TOKEN", e.target.value)} placeholder="Token da W-API" />
              </div>
              <div className="form-group">
                <label className="form-label">Instância</label>
                <input className="form-input" value={String(sistema.WAPI_INSTANCE_ID || "")} onChange={(e) => sys("WAPI_INSTANCE_ID", e.target.value)} placeholder="ID/nome da instancia" />
              </div>
              <div className="form-group form-group-span2">
                <div className="form-help">Preencha URL, token e instância. Ao salvar, boletos, credenciais, respostas e envios em massa disparam automaticamente pelo backend. O link manual continua aparecendo como fallback.</div>
              </div>
            </div>
          </div>
        </div>

        {/* Controle de acessos */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="section-eyebrow">Seguranca</div>
              <h3 className="section-title">Controle de acessos</h3>
            </div>
            <a className="btn btn-primary btn-sm" href="/usuarios/credenciais#permissoes">
              Controlar acessos
            </a>
          </div>
          <div className="card-body">
            <p className="section-subtitle" style={{ margin: 0 }}>
              Defina por usuario quais modulos aparecem no menu e quais acessos ficam bloqueados no painel.
            </p>
          </div>
        </div>

        {/* Boleto */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="section-eyebrow">Financeiro</div>
              <h3 className="section-title">Configuração de boleto</h3>
            </div>
          </div>
          <div className="card-body">
            <div className="form-grid">
              <div className="form-group form-group-span2">
                <label className="form-label">Cedente</label>
                <input className="form-input" value={String(boleto.cedente || "")} onChange={(e) => bol("cedente", e.target.value)} placeholder="Nome do cedente" />
              </div>
              <div className="form-group">
                <label className="form-label">Banco</label>
                <input className="form-input" value={String(boleto.banco || "")} onChange={(e) => bol("banco", e.target.value)} placeholder="237 - Bradesco" />
              </div>
              <div className="form-group">
                <label className="form-label">Carteira</label>
                <input className="form-input" value={String(boleto.carteira || "")} onChange={(e) => bol("carteira", e.target.value)} placeholder="09" />
              </div>
              <div className="form-group">
                <label className="form-label">Agência</label>
                <input className="form-input" value={String(boleto.agencia || "")} onChange={(e) => bol("agencia", e.target.value)} placeholder="0000-0" />
              </div>
              <div className="form-group">
                <label className="form-label">Conta</label>
                <input className="form-input" value={String(boleto.conta || "")} onChange={(e) => bol("conta", e.target.value)} placeholder="00000-0" />
              </div>
              <div className="form-group">
                <label className="form-label">Dias para vencimento</label>
                <input className="form-input" type="number" value={String(boleto.dias_vencimento || "5")} onChange={(e) => bol("dias_vencimento", e.target.value)} />
              </div>
              <div className="form-group form-group-span2">
                <label className="form-label">Instruções do boleto</label>
                <textarea className="form-input form-textarea" rows={3} value={String(boleto.instrucoes || "")} onChange={(e) => bol("instrucoes", e.target.value)} placeholder="Não receber após o vencimento. Multa de 2% e juros de 1% ao mês." />
              </div>
            </div>
            <div style={{ marginTop: 20, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
              <div className="section-eyebrow" style={{ marginBottom: 12, fontSize: "0.7rem", color: "var(--text-muted)" }}>Mercado Pago — Boleto Bancário</div>
              <div className="form-grid">
                <div className="form-group form-group-span2">
                  <label className="form-label">Access Token (MP)</label>
                  <input className="form-input" type="password" value={String(boleto.mp_access_token || "")} onChange={(e) => bol("mp_access_token", e.target.value)} placeholder="APP_USR-..." />
                  <div className="form-help">Token de acesso do Mercado Pago. Obtenha em mercadopago.com.br/developers. Se preenchido, sobrescreve a chave padrão do sistema.</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Public Key (MP)</label>
                  <input className="form-input" value={String(boleto.mp_public_key || "")} onChange={(e) => bol("mp_public_key", e.target.value)} placeholder="APP_USR-..." />
                </div>
                <div className="form-group">
                  <label className="form-label">Client ID (MP)</label>
                  <input className="form-input" value={String(boleto.mp_client_id || "")} onChange={(e) => bol("mp_client_id", e.target.value)} placeholder="4713753450558393" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Zona de perigo */}
        <div className="card" style={{ borderColor: "rgba(239,68,68,0.2)" }}>
          <div className="card-header">
            <div>
              <div className="section-eyebrow" style={{ color: "var(--red-600)" }}>Zona de perigo</div>
              <h3 className="section-title">Operações críticas</h3>
            </div>
          </div>
          <div className="card-body">
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <a href="/api/alunos" target="_blank" className="btn btn-secondary btn-sm">
                <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                Exportar alunos
              </a>
              <button className="btn btn-danger btn-sm" style={{ marginLeft: "auto" }}
                onClick={() => { if (confirm("Limpar todos os logs do Wiz? Esta ação não pode ser desfeita.")) alert("Funcionalidade disponível via API: DELETE /api/wiz"); }}>
                <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                Limpar logs Wiz
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
