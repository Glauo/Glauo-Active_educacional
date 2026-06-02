"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BOOK_LEVELS, COURSE_MODULES, formatModuleValue, isVipModule, isVipUnlimitedPlan, migrateModule, teacherClassValueByModule, VIP_DEFAULT_TOTAL, VIP_UNLIMITED, vipPlanTotal } from "@/lib/course-modules";
import { ModalPortal } from "@/components/modal-portal";

type AlunoData = {
  id?: string;
  nome?: string;
  name?: string;
  turma?: string;
  classe?: string;
  livro?: string;
  book?: string;
  modulo?: string;
  modalidade?: string;
  responsavel?: unknown;
  responsavel_nome?: string;
  responsavel_cpf?: string;
  responsavel_email?: string;
  responsavel_telefone?: string;
  telefone?: string;
  celular?: string;
  email?: string;
  matricula?: string;
  rg?: string;
  genero?: string;
  idade?: string | number;
  cidade_natal?: string;
  pais?: string;
  cep?: string;
  rua?: string;
  numero?: string | number;
  complemento?: string;
  cidade?: string;
  bairro?: string;
  data_nascimento?: string;
  nascimento?: string;
  cpf?: string;
  endereco?: string;
  dia_vencimento?: string | number;
  vencimento?: string;
  valor_mensalidade?: string | number;
  vip_tipo_plano?: string;
  vip_aulas_total?: string | number;
  vip_aulas_restantes?: string | number;
  observacoes?: string;
  login?: string;
  usuario?: string;
  senha?: string;
  status?: string;
  [k: string]: unknown;
};

type Form = {
  nome: string;
  turma: string;
  modulo: string;
  livro: string;
  matricula: string;
  rg: string;
  genero: string;
  idade: string;
  cidade_natal: string;
  pais: string;
  cep: string;
  rua: string;
  numero: string;
  complemento: string;
  cidade: string;
  bairro: string;
  data_nascimento: string;
  cpf: string;
  responsavel_nome: string;
  responsavel_cpf: string;
  responsavel_telefone: string;
  responsavel_email: string;
  telefone: string;
  email: string;
  endereco: string;
  dia_vencimento: string;
  vencimento: string;
  valor_mensalidade: string;
  vip_tipo_plano: string;
  vip_aulas_total: string;
  vip_aulas_restantes: string;
  vip_aulas_dadas: string;
  observacoes: string;
  login: string;
  senha: string;
  status: string;
};

type TurmaOption = {
  id?: string;
  nome?: string;
  name?: string;
  livro?: string;
  book?: string;
  modulo?: string;
  tipo_aula?: string;
  modalidade?: string;
  [k: string]: unknown;
};

function text(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const row = value as Record<string, unknown>;
    return String(row.nome || row.name || row.celular || row.telefone || row.email || "").trim();
  }
  return String(value || "").trim();
}

function objValue(value: unknown, key: string) {
  return value && typeof value === "object" && !Array.isArray(value) ? text((value as Record<string, unknown>)[key]) : "";
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function autoLogin(dateValue: string) {
  const raw = digits(dateValue);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    const [year, month, day] = dateValue.split("-");
    return `${day}${month}${year}`;
  }
  return raw;
}

function autoPassword(cpf: string) {
  return digits(cpf).slice(0, 5);
}

function numberValue(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function calcAge(dateValue: string) {
  const raw = text(dateValue);
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const year = match ? Number(match[3]) : iso ? Number(iso[1]) : 0;
  const month = match ? Number(match[2]) : iso ? Number(iso[2]) : 0;
  const day = match ? Number(match[1]) : iso ? Number(iso[3]) : 0;
  if (!year || !month || !day) return "";
  const today = new Date();
  let age = today.getFullYear() - year;
  const currentMonth = today.getMonth() + 1;
  if (currentMonth < month || (currentMonth === month && today.getDate() < day)) age -= 1;
  return age >= 0 && age < 130 ? String(age) : "";
}

function fromAluno(a?: AlunoData): Form {
  const nascimento = text(a?.data_nascimento || a?.nascimento);
  return {
    nome: text(a?.nome || a?.name),
    turma: text(a?.turma || a?.classe),
    modulo: migrateModule(a?.modulo || a?.modalidade || "Aula em Turma"),
    livro: text(a?.livro || a?.book),
    matricula: text(a?.matricula),
    rg: text(a?.rg),
    genero: text(a?.genero),
    idade: text(a?.idade) || calcAge(nascimento),
    cidade_natal: text(a?.cidade_natal),
    pais: text(a?.pais || "Brasil"),
    cep: text(a?.cep),
    rua: text(a?.rua),
    numero: text(a?.numero),
    complemento: text(a?.complemento),
    cidade: text(a?.cidade),
    bairro: text(a?.bairro),
    data_nascimento: nascimento,
    cpf: text(a?.cpf),
    responsavel_nome: text(a?.responsavel_nome) || objValue(a?.responsavel, "nome") || text(a?.responsavel),
    responsavel_cpf: text(a?.responsavel_cpf) || objValue(a?.responsavel, "cpf"),
    responsavel_telefone: text(a?.responsavel_telefone || a?.telefone) || objValue(a?.responsavel, "celular") || objValue(a?.responsavel, "telefone"),
    responsavel_email: text(a?.responsavel_email || a?.email) || objValue(a?.responsavel, "email"),
    telefone: text(a?.celular),
    email: text(a?.email),
    endereco: text(a?.endereco),
    dia_vencimento: text(a?.dia_vencimento),
    vencimento: text(a?.vencimento),
    valor_mensalidade: text(a?.valor_mensalidade),
    vip_tipo_plano: text(a?.vip_tipo_plano || "Pacote 10 aulas"),
    vip_aulas_total: text(a?.vip_aulas_total ?? ""),
    vip_aulas_restantes: text(a?.vip_aulas_restantes ?? ""),
    vip_aulas_dadas: text(a?.vip_aulas_dadas ?? a?.aulas_dadas_vip ?? "0"),
    observacoes: text(a?.observacoes),
    login: text(a?.login || a?.usuario),
    senha: text(a?.senha),
    status: text(a?.status || "Ativo"),
  };
}

function credentialMessage(form: Form) {
  return [
    `Olá! O acesso de ${form.nome || "aluno"} ao portal Active Educacional foi atualizado.`,
    "",
    `Login: ${form.login}`,
    `Senha: ${form.senha}`,
    "",
    "Portal: https://activeeducacional.tech/aluno/login",
  ].join("\n");
}

function whatsappUrl(phone: string, message: string) {
  return "";
}

function mailtoUrl(email: string, form: Form) {
  return `mailto:${email}?subject=${encodeURIComponent("Acesso ao portal Active Educacional")}&body=${encodeURIComponent(credentialMessage(form))}`;
}

async function sendWhatsAppAutomatico(phone: string, message: string) {
  const res = await fetch("/api/whatsapp/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telefone: phone, mensagem: message }),
  });
  return res.json().catch(() => ({})) as Promise<{ ok?: boolean; status?: string; error?: string }>;
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="form-section-heading form-group-span2">
      <div className="form-section-title">{title}</div>
      {subtitle && <div className="form-section-subtitle">{subtitle}</div>}
    </div>
  );
}

function AlunoModal({ aluno, onClose, onSaved }: { aluno?: AlunoData; onClose: () => void; onSaved: () => void }) {
  const registroId = text(aluno?.id || aluno?.nome || aluno?.name);
  const isEdit = Boolean(registroId);
  const [form, setForm] = useState<Form>(fromAluno(aluno));
  const [turmas, setTurmas] = useState<TurmaOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [savingCred, setSavingCred] = useState(false);
  const [credFeedback, setCredFeedback] = useState("");
  const [credWhatsappLink, setCredWhatsappLink] = useState("");
  const [vipFeedback, setVipFeedback] = useState("");
  const vip = isVipModule(form.modulo);
  const vipIndeterminado = isVipUnlimitedPlan(form.vip_tipo_plano);
  const planTotal = vipIndeterminado ? VIP_DEFAULT_TOTAL : (vipPlanTotal(form.vip_tipo_plano || "Pacote 10 aulas") || VIP_DEFAULT_TOTAL);
  const vipRenewAmount = Math.max(1, planTotal || VIP_DEFAULT_TOTAL);
  const vipTotalNumber = vipIndeterminado ? 0 : Math.max(0, Number(form.vip_aulas_total || planTotal) || planTotal);
  const vipRestantesNumber = vipIndeterminado ? 0 : Math.max(0, Number(form.vip_aulas_restantes || vipTotalNumber) || 0);
  const vipDadasNumber = vipIndeterminado ? Math.max(0, Number(form.vip_aulas_dadas || 0)) : Math.max(0, vipTotalNumber - vipRestantesNumber);
  const turmaOptions = useMemo(() => {
    const names = turmas.map((t) => text(t.nome || t.name)).filter(Boolean);
    const unique = Array.from(new Set(["Sem Turma", ...names, form.turma].filter(Boolean)));
    return unique;
  }, [turmas, form.turma]);
  const livroOptions = useMemo(() => Array.from(new Set([...BOOK_LEVELS, form.livro].filter(Boolean))), [form.livro]);

  useEffect(() => {
    fetch("/api/turmas")
      .then((res) => res.json())
      .then((data) => setTurmas(Array.isArray(data?.turmas) ? data.turmas : []))
      .catch(() => setTurmas([]));
  }, []);

  function update<K extends keyof Form>(field: K, value: Form[K]) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "data_nascimento") next.idade = calcAge(String(value));
      if (field === "modulo" && isVipModule(value) && !prev.vip_aulas_total && !prev.vip_aulas_restantes) {
        next.vip_tipo_plano = prev.vip_tipo_plano || "Pacote 10 aulas";
        next.vip_aulas_total = String(VIP_DEFAULT_TOTAL);
        next.vip_aulas_restantes = String(VIP_DEFAULT_TOTAL);
      }
      return next;
    });
    setErro("");
    setVipFeedback("");
  }

  function preencherAcessoAutomatico() {
    setForm((prev) => ({
      ...prev,
      login: autoLogin(prev.data_nascimento),
      senha: autoPassword(prev.cpf),
    }));
    setErro("");
  }

  function selecionarTurma(turmaNome: string) {
    const turma = turmas.find((t) => text(t.nome || t.name) === turmaNome);
    setForm((prev) => ({
      ...prev,
      turma: turmaNome,
      livro: text(turma?.livro || turma?.book) || prev.livro,
      modulo: migrateModule(turma?.modulo || turma?.tipo_aula || turma?.modalidade || prev.modulo),
    }));
    setErro("");
  }

  function renovarPacoteVip() {
    if (!vip || vipIndeterminado) return;
    const currentTotal = Math.max(vipTotalNumber, numberValue(form.vip_aulas_total), vipRenewAmount);
    const currentRestantes = Math.max(0, numberValue(form.vip_aulas_restantes || vipRestantesNumber));
    const nextTotal = currentTotal + vipRenewAmount;
    const nextRestantes = currentRestantes + vipRenewAmount;
    setForm((prev) => ({
      ...prev,
      vip_aulas_total: String(nextTotal),
      vip_aulas_restantes: String(nextRestantes),
    }));
    setVipFeedback(`Renovacao adicionada: +${vipRenewAmount} aula(s). Salve as alteracoes para confirmar.`);
    setErro("");
  }

  async function excluir() {
    if (!registroId) return;
    if (!confirm(`Excluir o aluno "${form.nome || text(aluno?.nome || aluno?.name)}"? Esta acao nao pode ser desfeita.`)) return;
    setSaving(true);
    await fetch(`/api/alunos?id=${encodeURIComponent(registroId)}`, { method: "DELETE" });
    setSaving(false);
    onSaved();
  }

  async function salvar() {
    if (!form.nome.trim()) {
      setErro("O nome do aluno e obrigatorio.");
      return;
    }
    setSaving(true);
    const payload = {
      ...(isEdit ? { id: registroId } : {}),
      ...form,
      nome: form.nome.trim(),
      turma: form.turma.trim(),
      classe: form.turma.trim(),
      livro: form.livro.trim(),
      book: form.livro.trim(),
      modulo: form.modulo,
      matricula: form.matricula.trim(),
      rg: form.rg.trim(),
      genero: form.genero,
      idade: form.idade,
      cidade_natal: form.cidade_natal.trim(),
      pais: form.pais.trim(),
      cep: form.cep.trim(),
      rua: form.rua.trim(),
      numero: form.numero.trim(),
      complemento: form.complemento.trim(),
      cidade: form.cidade.trim(),
      bairro: form.bairro.trim(),
      valor_professor_aula: teacherClassValueByModule(form.modulo),
      vip_tipo_plano: vip ? form.vip_tipo_plano : "",
      vip_aulas_total: vip ? (vipIndeterminado ? VIP_UNLIMITED : Number(form.vip_aulas_total || planTotal)) : 0,
      vip_aulas_restantes: vip ? (vipIndeterminado ? VIP_UNLIMITED : Number(form.vip_aulas_restantes === "" ? (form.vip_aulas_total || planTotal) : form.vip_aulas_restantes)) : 0,
      vip_aulas_dadas: vip ? vipDadasNumber : 0,
      aulas_dadas_vip: vip ? vipDadasNumber : 0,
      responsavel: {
        nome: form.responsavel_nome.trim(),
        cpf: form.responsavel_cpf.trim(),
        celular: form.responsavel_telefone.trim(),
        telefone: form.responsavel_telefone.trim(),
        email: form.responsavel_email.trim(),
      },
      responsavel_nome: form.responsavel_nome.trim(),
      responsavel_cpf: form.responsavel_cpf.trim(),
      responsavel_telefone: form.responsavel_telefone.trim(),
      responsavel_email: form.responsavel_email.trim(),
      telefone: form.responsavel_telefone.trim(),
      celular: form.telefone.trim(),
      email: form.email.trim(),
      login: form.login.trim().toLowerCase(),
      usuario: form.login.trim().toLowerCase(),
      senha: form.senha.trim(),
    };
    const res = await fetch("/api/alunos", {
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
    const data = await res.json().catch(() => ({}));
    const status = data.notification_status as { whatsapp?: string; email?: string; whatsapp_enviado?: boolean; email_enviado?: boolean } | undefined;
    if (status) {
      setCredFeedback(`Aluno salvo. WhatsApp: ${status.whatsapp || "nao enviado"}. E-mail: ${status.email || "nao enviado"}.`);
    }
    onSaved();
  }

  async function salvarCredenciais() {
    if (!isEdit || !registroId) return;
    if (!form.login.trim() || form.senha.trim().length < 4) {
      setCredFeedback("Informe login e senha com pelo menos 4 caracteres.");
      return;
    }
    setSavingCred(true);
    setCredFeedback("");
    const res = await fetch("/api/alunos/credenciais", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: registroId, login: form.login, senha: form.senha }),
    });
    setSavingCred(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setCredFeedback(String(data.error || "Erro ao salvar login/senha."));
      return;
    }
    const savedLogin = String(data.login || form.login).trim();
    update("login", savedLogin);
    setCredWhatsappLink("");
    setCredFeedback(data.whatsapp_enviado ? "Login e senha salvos e enviados automaticamente por WhatsApp." : `Login e senha salvos. WhatsApp nao enviado: ${String(data.whatsapp_status || "verifique a WAPI")}.`);
  }

  return (
    <ModalPortal>
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 920 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{isEdit ? "Editar aluno completo" : "Novo aluno"}</div>
            <div className="modal-subtitle">Cadastro academico, modulo, responsavel e financeiro do sistema antigo</div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
          </button>
        </div>

        <div className="modal-body">
          <div className="form-grid">
            <SectionHeading title="Dados do aluno" subtitle="Identificacao principal do cadastro." />
            <div className="form-group form-group-span2">
              <label className="form-label">Nome completo *</label>
              <input className="form-input" placeholder="Nome do aluno" value={form.nome} onChange={(e) => update("nome", e.target.value)} autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Matricula</label>
              <input className="form-input" placeholder="Automatica se vazio" value={form.matricula} onChange={(e) => update("matricula", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-input" value={form.status} onChange={(e) => update("status", e.target.value)}>
                <option>Ativo</option>
                <option>Inativo</option>
                <option>Em atencao</option>
              </select>
            </div>
            <SectionHeading title="Curso e turma" subtitle="A turma puxa modulo e livro quando essa informacao existir no cadastro da turma." />
            <div className="form-group">
              <label className="form-label">Turma</label>
              <select className="form-input" value={form.turma || "Sem Turma"} onChange={(e) => selecionarTurma(e.target.value)}>
                {turmaOptions.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Modulo *</label>
              <select className="form-input" value={form.modulo} onChange={(e) => update("modulo", e.target.value)}>
                {COURSE_MODULES.map((m) => <option key={m}>{m}</option>)}
              </select>
              <div className="form-help">Pagamento do professor: {formatModuleValue(form.modulo)} por aula.</div>
            </div>
            {vip && (
              <>
                <div className="form-group">
                  <label className="form-label">Tipo do plano VIP</label>
                  <select
                    className="form-input"
                    value={form.vip_tipo_plano}
                    onChange={(e) => {
                      const isUnlim = isVipUnlimitedPlan(e.target.value);
                      const total = isUnlim ? VIP_UNLIMITED : vipPlanTotal(e.target.value);
                      update("vip_tipo_plano", e.target.value);
                      update("vip_aulas_total", String(total));
                      update("vip_aulas_restantes", String(total));
                    }}
                  >
                    <option>Aula avulsa</option>
                    <option>Pacote 10 aulas</option>
                    <option>Aulas Indeterminadas</option>
                  </select>
                  {vipIndeterminado && (
                    <div className="form-help" style={{ color: "var(--blue-600)", fontWeight: 600 }}>
                      Aluno sem limite de aulas — o contador nao sera decrementado automaticamente.
                    </div>
                  )}
                </div>
                {!vipIndeterminado && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Aulas do pacote VIP</label>
                      <input className="form-input" type="number" min="0" value={form.vip_aulas_total || planTotal} onChange={(e) => update("vip_aulas_total", e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Aulas dadas</label>
                      <input
                        className="form-input"
                        type="number"
                        min="0"
                        max={vipTotalNumber || undefined}
                        value={vipDadasNumber}
                        onChange={(e) => {
                          const dadas = Math.max(0, Number(e.target.value) || 0);
                          const total = Math.max(vipTotalNumber, dadas);
                          update("vip_aulas_total", String(total));
                          update("vip_aulas_restantes", String(Math.max(0, total - dadas)));
                        }}
                      />
                      <div className="form-help">ADM e coordenador podem ajustar manualmente quando necessario.</div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Aulas restantes</label>
                      <input className="form-input" type="number" min="0" value={form.vip_aulas_restantes || form.vip_aulas_total || planTotal} onChange={(e) => update("vip_aulas_restantes", e.target.value)} />
                      <div className="form-help">Exemplo: pacote de 10 com 7 restantes significa 3 aulas dadas.</div>
                    </div>
                    <div className="form-group form-group-span2">
                      <div className="vip-renew-panel">
                        <div>
                          <strong>Renovacao de aulas particulares VIP</strong>
                          <span>
                            Adiciona +{vipRenewAmount} aula(s) ao pacote e ao saldo restante, preservando {vipDadasNumber} aula(s) ja dada(s).
                          </span>
                        </div>
                        <button className="btn btn-secondary btn-sm" type="button" onClick={renovarPacoteVip}>
                          Renovar pacote VIP
                        </button>
                      </div>
                      {vipFeedback && <div className="form-success">{vipFeedback}</div>}
                    </div>
                  </>
                )}
                {vipIndeterminado && (
                  <div className="form-group">
                    <label className="form-label">Aulas dadas (contador)</label>
                    <input
                      className="form-input"
                      type="number"
                      min="0"
                      value={vipDadasNumber}
                      onChange={(e) => update("vip_aulas_dadas", e.target.value)}
                    />
                    <div className="form-help">Apenas para registro historico. Nao ha limite.</div>
                  </div>
                )}
              </>
            )}
            <div className="form-group">
              <label className="form-label">Livro</label>
              <select className="form-input" value={form.livro || "Livro 1"} onChange={(e) => update("livro", e.target.value)}>
                {livroOptions.map((livro) => <option key={livro}>{livro}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Data de nascimento</label>
              <input className="form-input" placeholder="DD/MM/AAAA" value={form.data_nascimento} onChange={(e) => update("data_nascimento", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Idade</label>
              <input className="form-input" value={form.idade} onChange={(e) => update("idade", e.target.value)} placeholder="Calculada pela data" />
            </div>
            <div className="form-group">
              <label className="form-label">CPF do aluno</label>
              <input className="form-input" placeholder="000.000.000-00" value={form.cpf} onChange={(e) => update("cpf", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">RG</label>
              <input className="form-input" placeholder="RG do aluno" value={form.rg} onChange={(e) => update("rg", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Genero</label>
              <select className="form-input" value={form.genero} onChange={(e) => update("genero", e.target.value)}>
                <option value="">Nao informado</option>
                <option>Feminino</option>
                <option>Masculino</option>
                <option>Outro</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Cidade natal</label>
              <input className="form-input" value={form.cidade_natal} onChange={(e) => update("cidade_natal", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Pais</label>
              <input className="form-input" value={form.pais} onChange={(e) => update("pais", e.target.value)} />
            </div>
            <SectionHeading title="Responsavel financeiro" subtitle="Boletos, e-mails e WhatsApp usam estes dados como prioridade." />
            <div className="form-group">
              <label className="form-label">Responsavel</label>
              <input className="form-input" placeholder="Nome do responsavel" value={form.responsavel_nome} onChange={(e) => update("responsavel_nome", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">CPF do responsavel</label>
              <input className="form-input" placeholder="000.000.000-00" value={form.responsavel_cpf} onChange={(e) => update("responsavel_cpf", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Telefone do responsavel</label>
              <input className="form-input" placeholder="(11) 99999-0000" value={form.responsavel_telefone} onChange={(e) => update("responsavel_telefone", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">E-mail do responsavel</label>
              <input className="form-input" type="email" placeholder="responsavel@email.com" value={form.responsavel_email} onChange={(e) => update("responsavel_email", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Celular do aluno</label>
              <input className="form-input" placeholder="Opcional" value={form.telefone} onChange={(e) => update("telefone", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">E-mail do aluno</label>
              <input className="form-input" type="email" placeholder="Opcional" value={form.email} onChange={(e) => update("email", e.target.value)} />
            </div>
            <SectionHeading title="Endereco do pagador" subtitle="Usado automaticamente na geracao de boleto Mercado Pago." />
            <div className="form-group">
              <label className="form-label">CEP</label>
              <input className="form-input" placeholder="00000-000" value={form.cep} onChange={(e) => update("cep", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Rua</label>
              <input className="form-input" value={form.rua} onChange={(e) => update("rua", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Numero</label>
              <input className="form-input" value={form.numero} onChange={(e) => update("numero", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Complemento</label>
              <input className="form-input" value={form.complemento} onChange={(e) => update("complemento", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Bairro</label>
              <input className="form-input" value={form.bairro} onChange={(e) => update("bairro", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Cidade</label>
              <input className="form-input" value={form.cidade} onChange={(e) => update("cidade", e.target.value)} />
            </div>
            <div className="form-group form-group-span2">
              <label className="form-label">Endereco completo / observacao de endereco</label>
              <input className="form-input" placeholder="Complemento livre do endereco antigo" value={form.endereco} onChange={(e) => update("endereco", e.target.value)} />
            </div>
            <SectionHeading title="Cobranca escolar" subtitle="A mensalidade gera cobrancas automaticamente por ciclo de 6 meses." />
            <div className="form-group">
              <label className="form-label">Dia de vencimento</label>
              <input className="form-input" type="number" min="1" max="31" placeholder="Ex: 10" value={form.dia_vencimento} onChange={(e) => update("dia_vencimento", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Primeiro vencimento / fatura</label>
              <input className="form-input" placeholder="DD/MM/AAAA" value={form.vencimento} onChange={(e) => update("vencimento", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Valor da mensalidade</label>
              <input className="form-input" inputMode="decimal" placeholder="Ex: 350,00" value={form.valor_mensalidade} onChange={(e) => update("valor_mensalidade", e.target.value)} />
            </div>
            <div className="form-group form-group-span2">
              <label className="form-label">Observacoes</label>
              <textarea className="form-input form-textarea" rows={3} value={form.observacoes} onChange={(e) => update("observacoes", e.target.value)} />
            </div>
            <SectionHeading title="Acesso do aluno" subtitle="Credenciais para o portal do aluno e envio ao responsavel." />
            <>
                <div className="form-group">
                  <label className="form-label">Login do aluno</label>
                  <input className="form-input" placeholder="login do portal" value={form.login} onChange={(e) => update("login", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Senha do aluno</label>
                  <input className="form-input" placeholder="senha do portal" value={form.senha} onChange={(e) => update("senha", e.target.value)} />
                </div>
                <div className="form-group form-group-span2">
                  <label className="form-label">Enviar acesso ao responsavel</label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn btn-secondary btn-sm" type="button" onClick={preencherAcessoAutomatico}>
                      Gerar login/senha automatico
                    </button>
                    {isEdit && <button className="btn btn-primary btn-sm" type="button" onClick={salvarCredenciais} disabled={savingCred}>
                      {savingCred ? "Salvando..." : "Salvar login/senha"}
                    </button>}
                  <button
                    type="button"
                  className={`btn btn-secondary btn-sm${!form.login || !form.senha || !form.responsavel_telefone ? " disabled" : ""}`}
                    onClick={async () => {
                      if (!form.login || !form.senha || !form.responsavel_telefone) return;
                      setSavingCred(true);
                      const result = await sendWhatsAppAutomatico(form.responsavel_telefone, credentialMessage(form));
                      setSavingCred(false);
                      setCredFeedback(result.ok ? "Login e senha enviados automaticamente por WhatsApp." : `WhatsApp nao enviado: ${result.status || result.error || "verifique a WAPI"}.`);
                      setCredWhatsappLink("");
                    }}
                    disabled={!form.login || !form.senha || !form.responsavel_telefone || savingCred}
                    >
                    {savingCred ? "Enviando..." : "Enviar login e senha por WhatsApp"}
                  </button>
                    <a
                      className={`btn btn-secondary btn-sm${!form.login || !form.senha || !form.responsavel_email ? " disabled" : ""}`}
                      href={form.login && form.senha && form.responsavel_email ? mailtoUrl(form.responsavel_email, form) : "#"}
                    >
                      Enviar login e senha por e-mail
                    </a>
                  </div>
                  <div className="form-help">{credFeedback || "Ao salvar cadastro com WhatsApp preenchido, o sistema envia automaticamente pela WAPI."}</div>
                </div>
            </>
          </div>
          {erro && <div className="form-error">{erro}</div>}
        </div>

        <div className="modal-footer">
          {isEdit && <button className="btn btn-danger btn-sm" onClick={excluir} disabled={saving} style={{ marginRight: "auto" }}>Excluir aluno</button>}
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={saving}>{saving ? "Salvando..." : isEdit ? "Salvar alteracoes" : "Cadastrar aluno"}</button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}

export function NovoAlunoBtn() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
        Novo aluno
      </button>
      {open && <AlunoModal onClose={() => setOpen(false)} onSaved={() => { setOpen(false); router.refresh(); }} />}
    </>
  );
}

export function EditarAlunoBtn({ aluno }: { aluno: AlunoData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-ghost btn-sm btn-icon" title="Editar" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
      </button>
      {open && <AlunoModal aluno={aluno} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); router.refresh(); }} />}
    </>
  );
}
