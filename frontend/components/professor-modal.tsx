"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ModalPortal } from "@/components/modal-portal";
import { manualWhatsAppUrl } from "@/lib/manual-whatsapp";

type ProfessorData = {
  id?: string;
  nome?: string;
  name?: string;
  email?: string;
  telefone?: string;
  celular?: string;
  whatsapp?: string;
  area?: string;
  especialidade?: string;
  data_nascimento?: string;
  cpf?: string;
  usuario?: string;
  login?: string;
  senha?: string;
  carga_horaria?: string | number;
  valor_aula?: string | number;
  status?: string;
  tipo_contrato?: string;
  pix?: string;
  banco?: string;
  agencia?: string;
  conta?: string;
  disponibilidade?: string;
  endereco?: string;
  observacoes?: string;
  [k: string]: unknown;
};

type Form = {
  nome: string;
  area: string;
  email: string;
  celular: string;
  data_nascimento: string;
  cpf: string;
  carga_horaria: string;
  valor_aula: string;
  tipo_contrato: string;
  pix: string;
  banco: string;
  agencia: string;
  conta: string;
  disponibilidade: string;
  endereco: string;
  observacoes: string;
  status: string;
  login: string;
  senha: string;
};

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function toInputDate(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function toPtDate(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function autoLogin(dateValue: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    const [year, month, day] = dateValue.split("-");
    return `${day}${month}${year}`;
  }
  return digits(dateValue);
}

function autoPassword(cpf: string) {
  return digits(cpf).slice(0, 5);
}

function text(value: unknown) {
  return String(value || "").trim();
}

function whatsappUrl(phone: string, message: string) {
  return manualWhatsAppUrl(phone, message);
}

function accessMessage(form: Form) {
  return [
    `Ola, ${form.nome || "professor"}!`,
    "Seu acesso ao painel do professor Active Educacional foi atualizado.",
    "",
    `Login: ${form.login}`,
    `Senha: ${form.senha}`,
    "",
    "Portal: https://activeeducacional.tech/login",
  ].join("\n");
}

function mailtoUrl(email: string, form: Form) {
  return `mailto:${email}?subject=${encodeURIComponent("Acesso ao painel do professor")}&body=${encodeURIComponent(accessMessage(form))}`;
}

function fromProf(p?: ProfessorData): Form {
  return {
    nome: String(p?.nome || p?.name || ""),
    area: String(p?.area || p?.especialidade || ""),
    email: String(p?.email || ""),
    celular: String(p?.celular || p?.telefone || p?.whatsapp || ""),
    data_nascimento: toInputDate(p?.data_nascimento),
    cpf: String(p?.cpf || ""),
    carga_horaria: String(p?.carga_horaria || ""),
    valor_aula: String(p?.valor_aula || ""),
    tipo_contrato: String(p?.tipo_contrato || "Hora-aula"),
    pix: String(p?.pix || ""),
    banco: String(p?.banco || ""),
    agencia: String(p?.agencia || ""),
    conta: String(p?.conta || ""),
    disponibilidade: String(p?.disponibilidade || ""),
    endereco: String(p?.endereco || ""),
    observacoes: String(p?.observacoes || ""),
    status: String(p?.status || "Ativo"),
    login: String(p?.usuario || p?.login || autoLogin(toInputDate(p?.data_nascimento))),
    senha: String(p?.senha || autoPassword(String(p?.cpf || ""))),
  };
}

function ProfessorModal({ professor, onClose, onSaved }: { professor?: ProfessorData; onClose: () => void; onSaved: () => void }) {
  const registroId = text(professor?.id || professor?.nome || professor?.name);
  const isEdit = Boolean(registroId);
  const [form, setForm] = useState<Form>(fromProf(professor));
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [sendFeedback, setSendFeedback] = useState("");
  const [sendWhatsappLink, setSendWhatsappLink] = useState("");

  function update<K extends keyof Form>(field: K, value: Form[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErro("");
  }

  async function excluir() {
    if (!registroId) return;
    if (!confirm(`Excluir o professor "${form.nome || professor?.nome}"? As turmas dele ficarao como Sem Professor.`)) return;
    setSaving(true);
    await fetch(`/api/professores?id=${encodeURIComponent(registroId)}`, { method: "DELETE" });
    setSaving(false);
    onSaved();
  }

  function preencherAcessoAutomatico() {
    setForm((prev) => ({
      ...prev,
      login: autoLogin(prev.data_nascimento),
      senha: autoPassword(prev.cpf),
    }));
    setErro("");
  }

  async function salvar() {
    if (!form.nome.trim()) {
      setErro("O nome do professor e obrigatorio.");
      return;
    }
    if (!form.login.trim()) {
      setErro("Informe o login do professor.");
      return;
    }
    if (form.senha.trim().length < 4) {
      setErro("Senha precisa ter pelo menos 4 caracteres.");
      return;
    }
    setSaving(true);
    setSendFeedback("");
    const payload = {
      ...(isEdit ? { id: registroId } : {}),
      ...form,
      nome: form.nome.trim(),
      area: form.area,
      especialidade: form.area,
      email: form.email.trim().toLowerCase(),
      celular: form.celular.trim(),
      telefone: form.celular.trim(),
      whatsapp: form.celular.trim(),
      data_nascimento: toPtDate(form.data_nascimento),
      cpf: form.cpf.trim(),
      usuario: form.login.trim().toLowerCase(),
      login: form.login.trim().toLowerCase(),
      senha: form.senha.trim(),
    };
    const res = await fetch("/api/professores", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErro((d as { error?: string }).error || "Erro ao salvar.");
      return;
    }
    const nextForm = { ...form, login: payload.login, senha: payload.senha };
    setSendWhatsappLink("");
    if (form.celular) {
      setSendWhatsappLink(whatsappUrl(form.celular, accessMessage(nextForm)));
      setSendFeedback("Professor salvo. Abra o WhatsApp manual para enviar login e senha.");
    } else {
      setSendFeedback("Professor salvo. Cadastre um WhatsApp para gerar o envio manual do acesso.");
    }
    setTimeout(() => onSaved(), 900);
  }

  const accessWhatsappHref = form.login && form.senha && form.celular ? whatsappUrl(form.celular, accessMessage(form)) : "";

  return (
    <ModalPortal>
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 900 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{isEdit ? "Editar professor completo" : "Novo professor completo"}</div>
            <div className="modal-subtitle">Dados, acesso, contato, pagamento e disponibilidade como no sistema anterior</div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
          </button>
        </div>

        <div className="modal-body">
          <div className="form-grid">
            <div className="form-group form-group-span2">
              <label className="form-label">Nome completo *</label>
              <input className="form-input" placeholder="Nome do professor" value={form.nome} onChange={(e) => update("nome", e.target.value)} autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Area / Especialidade</label>
              <input className="form-input" placeholder="Ingles, Conversacao, Teens..." value={form.area} onChange={(e) => update("area", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-input" value={form.status} onChange={(e) => update("status", e.target.value)}>
                <option>Ativo</option>
                <option>Inativo</option>
                <option>Afastado</option>
                <option>Ferias</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">E-mail</label>
              <input className="form-input" type="email" placeholder="email@exemplo.com" value={form.email} onChange={(e) => update("email", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Celular / WhatsApp</label>
              <input className="form-input" placeholder="(11) 99999-0000" value={form.celular} onChange={(e) => update("celular", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Data de nascimento *</label>
              <input className="form-input" type="date" value={form.data_nascimento} onChange={(e) => update("data_nascimento", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">CPF *</label>
              <input className="form-input" placeholder="CPF" value={form.cpf} onChange={(e) => update("cpf", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Login do professor</label>
              <input className="form-input" value={form.login} onChange={(e) => update("login", e.target.value)} placeholder="login manual" />
            </div>
            <div className="form-group">
              <label className="form-label">Senha do professor</label>
              <input className="form-input" value={form.senha} onChange={(e) => update("senha", e.target.value)} placeholder="senha manual" />
              <div className="form-help">O ADM pode digitar manualmente ou gerar pela data/CPF.</div>
            </div>
            <div className="form-group form-group-span2">
              <label className="form-label">Envio de acesso</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-secondary btn-sm" type="button" onClick={preencherAcessoAutomatico}>
                  Gerar login/senha automatico
                </button>
                <a
                  className={`btn btn-secondary btn-sm${!accessWhatsappHref ? " disabled" : ""}`}
                  href={accessWhatsappHref || "#"}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => accessWhatsappHref && setSendFeedback("WhatsApp manual aberto com a mensagem preparada.")}
                >
                  Abrir WhatsApp manual
                </a>
                <a
                  className={`btn btn-secondary btn-sm${!form.login || !form.senha || !form.email ? " disabled" : ""}`}
                  href={form.login && form.senha && form.email ? mailtoUrl(form.email, form) : "#"}
                >
                  Enviar por e-mail
                </a>
              </div>
              <div className="form-help">{sendFeedback || "Ao salvar, o sistema gera um link para envio manual pelo WhatsApp."}</div>
              {sendWhatsappLink && <a className="btn btn-secondary btn-sm" href={sendWhatsappLink} target="_blank" rel="noreferrer" style={{ marginTop: 8 }}>Abrir WhatsApp preparado</a>}
            </div>
            <div className="form-group">
              <label className="form-label">Tipo de contrato</label>
              <select className="form-input" value={form.tipo_contrato} onChange={(e) => update("tipo_contrato", e.target.value)}>
                <option>Hora-aula</option>
                <option>Mensalista</option>
                <option>CLT</option>
                <option>MEI/PJ</option>
                <option>Freelancer</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Carga horaria semanal</label>
              <input className="form-input" type="number" min="0" placeholder="Horas/semana" value={form.carga_horaria} onChange={(e) => update("carga_horaria", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Valor por aula</label>
              <input className="form-input" inputMode="decimal" placeholder="Ex: 50,00" value={form.valor_aula} onChange={(e) => update("valor_aula", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Chave PIX</label>
              <input className="form-input" value={form.pix} onChange={(e) => update("pix", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Banco</label>
              <input className="form-input" value={form.banco} onChange={(e) => update("banco", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Agencia</label>
              <input className="form-input" value={form.agencia} onChange={(e) => update("agencia", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Conta</label>
              <input className="form-input" value={form.conta} onChange={(e) => update("conta", e.target.value)} />
            </div>
            <div className="form-group form-group-span2">
              <label className="form-label">Disponibilidade</label>
              <input className="form-input" placeholder="Ex: Seg/Qua 19h, Sabado manha" value={form.disponibilidade} onChange={(e) => update("disponibilidade", e.target.value)} />
            </div>
            <div className="form-group form-group-span2">
              <label className="form-label">Endereco</label>
              <input className="form-input" value={form.endereco} onChange={(e) => update("endereco", e.target.value)} />
            </div>
            <div className="form-group form-group-span2">
              <label className="form-label">Observacoes internas</label>
              <textarea className="form-input form-textarea" rows={3} value={form.observacoes} onChange={(e) => update("observacoes", e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: 12 }} className="form-success">Login e senha podem ser preenchidos manualmente pelo ADM. Use o botao automatico quando quiser seguir o padrao antigo.</div>
          {erro && <div className="form-error">{erro}</div>}
        </div>

        <div className="modal-footer">
          {isEdit && <button className="btn btn-danger btn-sm" onClick={excluir} disabled={saving} style={{ marginRight: "auto" }}>Excluir</button>}
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={saving}>{saving ? "Salvando..." : isEdit ? "Salvar alteracoes" : "Cadastrar professor"}</button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}

export function NovoProfessorBtn() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
        Novo professor
      </button>
      {open && <ProfessorModal onClose={() => setOpen(false)} onSaved={() => { setOpen(false); router.refresh(); }} />}
    </>
  );
}

export function EditarProfessorBtn({ professor }: { professor: ProfessorData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-ghost btn-sm btn-icon" title="Editar" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
      </button>
      {open && <ProfessorModal professor={professor} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); router.refresh(); }} />}
    </>
  );
}
