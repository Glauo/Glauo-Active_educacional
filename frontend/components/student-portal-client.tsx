"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HomeworkSubmitForm, MuralConfirmButton } from "@/components/school-modules-client";
import { tagBadge, text, type Homework, type HomeworkSubmission, type WallPost } from "@/lib/school-modules";
import { StudentLogoutBtn } from "@/components/student-logout-btn";
import { vipPackageStats } from "@/lib/course-modules";
import { boletoAccessUrl } from "@/lib/finance-boleto-links";

type Row = Record<string, unknown>;

type Props = {
  session: { usuario: string; pessoa: string; unit?: string };
  perfil?: Row | null;
  muralPosts: WallPost[];
  licoes: Homework[];
  entregas: HomeworkSubmission[];
  notas: Row[];
  faturas: Row[];
  desafios: Row[];
  conclusoes: Row[];
  agenda: Row[];
  faltas: number;
  biblioteca: {
    livros: Row[];
    materiais: Row[];
    videos: Row[];
  };
};

type Tab = "inicio" | "mural" | "agenda" | "financeiro" | "notas" | "licoes" | "desafios" | "biblioteca" | "chat" | "wiz";
const TABS: Tab[] = ["inicio", "mural", "agenda", "financeiro", "notas", "licoes", "desafios", "biblioteca", "chat", "wiz"];

function parseMoney(value: unknown) {
  return Number.parseFloat(text(value).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
}

function money(value: unknown) {
  return parseMoney(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateLabel(value: unknown) {
  const raw = text(value);
  if (!raw) return "-";
  if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString("pt-BR");
}

function dateTimeLabel(value: unknown) {
  const raw = text(value);
  if (!raw) return "-";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function valueOfInstallment(row: Row) {
  return row.valor_parcela ?? row.valor ?? row.valor_total ?? 0;
}

function statusBadge(status: unknown) {
  const s = text(status).toLowerCase();
  if (s.includes("pago") || s.includes("baixado") || s.includes("corrig")) return "success";
  if (s.includes("atras") || s.includes("venc")) return "danger";
  if (s.includes("pend") || s.includes("aguard")) return "warning";
  return "neutral";
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "AL";
}

function isOpenInvoice(row: Row) {
  const s = text(row.status || row.situacao).toLowerCase();
  return !s.includes("pago") && !s.includes("baixado") && !s.includes("liquidado");
}

function boletoHref(row: Row) {
  return boletoAccessUrl(row);
}

function libraryHref(row: Row, tipo: "livros" | "materiais" | "videos") {
  const direct = text(row.url || row.file_path || row.link);
  if (direct) return direct;
  const id = text(row.id);
  if (tipo === "videos" || !id) return "";
  return `/api/biblioteca/pdf?tipo=${tipo}&id=${encodeURIComponent(id)}`;
}

function Empty({ title, desc }: { title: string; desc: string }) {
  return <div className="student-empty"><strong>{title}</strong><span>{desc}</span></div>;
}

type ChallengeQuestion = {
  id?: string;
  tipo?: string;
  enunciado?: string;
  opcoes?: string[];
  pontos?: number | string;
};

function challengeTypeLabel(value: unknown) {
  const raw = text(value).toLowerCase();
  if (raw.includes("multipla")) return "Multipla escolha";
  if (raw.includes("verdadeiro") || raw.includes("falso")) return "Verdadeiro/Falso";
  if (raw.includes("upload") || raw.includes("arquivo") || raw.includes("link")) return "Arquivo ou link";
  return "Pergunta";
}

function challengeQuestions(desafio: Row): ChallengeQuestion[] {
  if (Array.isArray(desafio.questions) && desafio.questions.length > 0) {
    return desafio.questions.map((question) => (question || {}) as ChallengeQuestion);
  }
  if (text(desafio.descricao) || Array.isArray(desafio.opcoes)) {
    return [{
      id: text(desafio.id) || "legacy",
      tipo: text(desafio.tipo) || "aberta",
      enunciado: text(desafio.descricao),
      opcoes: Array.isArray(desafio.opcoes) ? desafio.opcoes.map(text).filter(Boolean) : [],
      pontos: desafio.pontos as number | string | undefined,
    }];
  }
  return [];
}

function StudentChat() {
  const [messages, setMessages] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [status, setStatus] = useState("");

  async function load() {
    const res = await fetch("/api/aluno/chat", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    setMessages(Array.isArray(data.messages) ? data.messages : []);
    setLoaded(true);
  }

  async function send() {
    if (!mensagem.trim()) return;
    setStatus("Enviando...");
    const res = await fetch("/api/aluno/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensagem }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(text(data.error) || "Erro ao enviar mensagem.");
      return;
    }
    setMensagem("");
    setStatus("Mensagem enviada para o professor/coordenação.");
    setMessages(Array.isArray(data.messages) ? data.messages : []);
  }

  if (!loaded) {
    void load();
  }

  return (
    <div className="student-panel">
      <div className="student-section-head"><div><span>Atendimento</span><h2>Chat com professor</h2></div></div>
      <div className="student-chat-list">
        {messages.length === 0 ? <Empty title="Nenhuma mensagem ainda" desc="Envie sua dúvida para o professor ou coordenação." /> : messages.map((msg, index) => (
          <div className={`student-chat-msg ${text(msg.origem) === "aluno" ? "student-chat-own" : ""}`} key={text(msg.id) || index}>
            <strong>{text(msg.autor || msg.aluno || "Mensagem")}</strong>
            <p>{text(msg.mensagem)}</p>
            <small>{dateTimeLabel(msg.data)}</small>
          </div>
        ))}
      </div>
      <div className="student-chat-compose">
        <textarea className="form-input form-textarea" rows={3} value={mensagem} onChange={(e) => setMensagem(e.target.value)} placeholder="Digite sua dúvida para o professor..." />
        <button className="btn btn-primary" onClick={send}>Enviar mensagem</button>
      </div>
      {status && <div className={status.includes("Erro") ? "form-error" : "form-success"}>{status}</div>}
    </div>
  );
}

function StudentWiz() {
  const [pergunta, setPergunta] = useState("");
  const [resposta, setResposta] = useState("");
  const [loading, setLoading] = useState(false);

  async function ask() {
    if (!pergunta.trim()) return;
    setLoading(true);
    const res = await fetch("/api/aluno/wiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pergunta }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    setResposta(text(data.resposta || data.error || "Não consegui responder agora."));
  }

  return (
    <div className="student-panel">
      <div className="student-section-head"><div><span>IA Wiz</span><h2>Pesquisa de inglês</h2></div></div>
      <div className="student-wiz-box">
        <p>Use a Wiz apenas para tirar dúvidas de inglês: vocabulário, gramática, frases, pronúncia, tradução e exercícios.</p>
        <textarea className="form-input form-textarea" rows={4} value={pergunta} onChange={(e) => setPergunta(e.target.value)} placeholder="Ex: Qual a diferença entre simple past e present perfect?" />
        <button className="btn btn-primary" onClick={ask} disabled={loading}>{loading ? "Pesquisando..." : "Perguntar para Wiz"}</button>
        {resposta && <div className="student-wiz-answer">{resposta}</div>}
      </div>
    </div>
  );
}

export function StudentPortalClient({ session, perfil, muralPosts, licoes, entregas, notas, faturas, desafios, conclusoes, agenda, faltas, biblioteca }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = text(searchParams.get("tab")) as Tab;
  const [tab, setTab] = useState<Tab>(TABS.includes(requestedTab) ? requestedTab : "inicio");
  const entregasPorLicao = useMemo(() => new Map(entregas.map((entrega) => [text(entrega.activity_id), entrega])), [entregas]);
  const licoesOrdenadas = useMemo(() => [...licoes].sort((a, b) => {
    const aDone = entregasPorLicao.has(text(a.id)) ? 1 : 0;
    const bDone = entregasPorLicao.has(text(b.id)) ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return (Number(a.sequencia || 9999) - Number(b.sequencia || 9999)) || text(a.titulo).localeCompare(text(b.titulo));
  }), [licoes, entregasPorLicao]);
  const debitos = faturas.filter(isOpenInvoice);
  const totalDebitos = debitos.reduce((sum, item) => sum + parseMoney(valueOfInstallment(item)), 0);
  const pendentes = licoes.filter((licao) => !entregasPorLicao.has(text(licao.id))).length;
  const muralNaoLido = muralPosts.filter((post) => post.requer_confirmacao && !(post.confirmacoes || []).some((item) => item.usuario === session.usuario)).length;
  const desafiosPendentes = desafios.filter((d) => !conclusoes.some((c) => text(c.desafio_id) === text(d.id || d.titulo || d.title))).length;
  const totalBiblioteca = biblioteca.livros.length + biblioteca.materiais.length + biblioteca.videos.length;
  const totalNotificacoes = muralNaoLido + pendentes + desafiosPendentes;
  const pontos = conclusoes.reduce((sum, item) => sum + (Number(item.pontos) || 0), 0);
  const nome = text(session.pessoa || perfil?.nome || perfil?.name || session.usuario);
  const turma = text(perfil?.turma || perfil?.classe || session.unit);
  const pacoteVip = perfil ? vipPackageStats(perfil) : null;
  const menu: { id: Tab; label: string; badge?: number }[] = [
    { id: "inicio", label: "Início" },
    { id: "mural", label: "Comunicados", badge: muralNaoLido },
    { id: "agenda", label: "Agenda de aulas" },
    { id: "financeiro", label: "Financeiro", badge: debitos.length },
    { id: "notas", label: "Notas" },
    { id: "licoes", label: "Tarefas", badge: pendentes },
    { id: "desafios", label: "Desafios", badge: desafiosPendentes },
    { id: "biblioteca", label: "Biblioteca", badge: totalBiblioteca },
    { id: "chat", label: "Chat" },
    { id: "wiz", label: "IA Wiz" },
  ];

  return (
    <div className="student-shell">
      <aside className="student-sidebar">
        <div className="student-brand">
          <img src="/logo.png" alt="Ativo Educacional" />
          <div><strong>Ativo Educacional</strong><span>Portal do aluno</span></div>
        </div>
        <div className="student-profile">
          <div className="student-avatar">{initials(nome)}</div>
          <strong>{nome}</strong>
          <span>{turma || "Aluno"}</span>
          {pacoteVip && <small>{pacoteVip.unlimited ? `${pacoteVip.dadas} aulas VIP dadas | Sem limite` : `${pacoteVip.dadas}/${pacoteVip.total} aulas VIP dadas | ${pacoteVip.restantes} restantes`}</small>}
        </div>
        <nav className="student-nav">
          {menu.map((item) => (
            <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>
              <span>{item.label}</span>
              {Boolean(item.badge) && <small>{item.badge}</small>}
            </button>
          ))}
        </nav>
        <StudentLogoutBtn />
      </aside>

      <main className="student-main">
        <header className="student-top">
          <div><span>Bem-vindo(a)</span><h1>{nome}</h1></div>
          <div className="student-top-actions">
            <button className="student-bell" title="Notificações" onClick={() => setTab("inicio")}>
              <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
                <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6.5V11a7 7 0 0 0-5-6.7V3a2 2 0 1 0-4 0v1.3A7 7 0 0 0 5 11v4.5L3.4 17.1A1.2 1.2 0 0 0 4.2 19h15.6a1.2 1.2 0 0 0 .8-1.9L19 15.5Z" fill="currentColor" />
              </svg>
              {totalNotificacoes > 0 && <small>{totalNotificacoes}</small>}
            </button>
            <button className="btn btn-secondary" onClick={() => router.refresh()}>Atualizar dados</button>
          </div>
        </header>

        {tab === "inicio" && (
          <>
            <section className="student-metrics">
              <div><span>Comunicados não lidos</span><strong>{muralNaoLido}</strong></div>
              <div><span>Tarefas pendentes</span><strong>{pendentes}</strong></div>
              <div><span>Desafios pendentes</span><strong>{desafiosPendentes}</strong></div>
              <div><span>Débitos em aberto</span><strong>{totalDebitos.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></div>
              <div><span>{pacoteVip ? "Aulas VIP" : "Pontos em desafios"}</span><strong>{pacoteVip ? (pacoteVip.unlimited ? `${pacoteVip.dadas} dadas · Ilimitado` : `${pacoteVip.restantes}/${pacoteVip.total} restantes`) : pontos}</strong></div>
            </section>
            <section className="student-grid">
              <div className="student-panel"><div className="student-section-head"><div><span>Hoje</span><h2>Próximas aulas</h2></div></div>{agenda.slice(0, 4).length ? agenda.slice(0, 4).map((a, i) => <div className="student-list-row" key={text(a.id) || i}><strong>{text(a.titulo || a.descricao || "Aula")}</strong><span>{dateLabel(a.data || a.date)} {text(a.horario || a.hora)}</span></div>) : <Empty title="Nenhuma aula na agenda" desc="Quando houver aula/evento, aparece aqui." />}</div>
              <div className="student-panel"><div className="student-section-head"><div><span>Financeiro</span><h2>Parcelas abertas</h2></div></div>{debitos.slice(0, 4).length ? debitos.slice(0, 4).map((f, i) => <div className="student-list-row" key={text(f.id) || i}><strong>{text(f.descricao || "Mensalidade")}</strong><span>{money(valueOfInstallment(f))} - vence {dateLabel(f.vencimento || f.data_vencimento)}</span></div>) : <Empty title="Nada em aberto" desc="Você não tem parcelas pendentes." />}</div>
              <div className="student-panel"><div className="student-section-head"><div><span>Lições</span><h2>Lições de casa</h2></div></div>{licoesOrdenadas.slice(0, 4).length ? licoesOrdenadas.slice(0, 4).map((licao) => <div className="student-list-row" key={text(licao.id)}><strong>{text(licao.titulo || "Lição de casa")}</strong><span>{text(licao.disciplina || "Inglês")} - prazo {dateTimeLabel(licao.due_date)}</span></div>) : <Empty title="Não há lições de casa no momento" desc="Quando uma lição for lançada, ela aparecerá aqui." />}</div>
              <div className="student-panel"><div className="student-section-head"><div><span>Desafios</span><h2>Desafios lançados</h2></div></div>{desafios.slice(0, 4).length ? desafios.slice(0, 4).map((d, i) => <div className="student-list-row" key={text(d.id || d.titulo || d.title) || i}><strong>{text(d.titulo || d.title || "Desafio")}</strong><span>{Number(d.pontos || 0)} pts</span></div>) : <Empty title="Não há desafios no momento" desc="Quando um desafio for lançado, ele aparecerá aqui." />}</div>
            </section>
          </>
        )}

        {tab === "mural" && <section className="student-panel"><div className="student-section-head"><div><span>Mural</span><h2>Comunicados</h2></div></div>{muralPosts.length ? muralPosts.map((post) => <article className="student-card" key={text(post.id || post.titulo)}><div className="student-card-tags"><span className={`badge badge-${tagBadge(text(post.tipo_post || post.tipo))}`}><span className="badge-dot" />{text(post.tipo_post || post.tipo || "Aviso")}</span>{post.fixado && <span className="badge badge-gold">Fixado</span>}</div><h3>{text(post.titulo || "Comunicado")}</h3><p>{text(post.mensagem)}</p><small>{text(post.autor || "Escola")} - {dateLabel(post.publicado_em || post.data)}</small>{(post.requer_confirmacao || (post.enquete_opcoes || []).length > 0) && <MuralConfirmButton post={post} compact />}</article>) : <Empty title="Sem comunicados" desc="Nenhum comunicado publicado para você." />}</section>}

        {tab === "agenda" && <section className="student-panel"><div className="student-section-head"><div><span>Agenda</span><h2>Aulas e eventos</h2></div></div>{agenda.length ? <table className="data-table"><thead><tr><th>Data</th><th>Horário</th><th>Aula/evento</th><th>Professor</th></tr></thead><tbody>{agenda.map((a, i) => <tr key={text(a.id) || i}><td>{dateLabel(a.data || a.date)}</td><td>{text(a.horario || a.hora || "-")}</td><td>{text(a.titulo || a.descricao || "Aula")}</td><td>{text(a.professor || "-")}</td></tr>)}</tbody></table> : <Empty title="Sem agenda" desc="Nenhuma aula ou evento encontrado para sua turma." />}</section>}

        {tab === "financeiro" && <section className="student-panel"><div className="student-section-head"><div><span>Financeiro</span><h2>Boletos e mensalidades</h2></div></div>{faturas.length ? <table className="data-table"><thead><tr><th>Descrição</th><th>Vencimento</th><th>Valor</th><th>Status</th><th>Boleto</th></tr></thead><tbody>{faturas.map((f, i) => { const href = boletoHref(f); return <tr key={text(f.id) || i}><td>{text(f.descricao || f.categoria || "Mensalidade")}</td><td>{dateLabel(f.vencimento || f.data_vencimento)}</td><td>{money(valueOfInstallment(f))}</td><td><span className={`badge badge-${statusBadge(f.status || f.situacao)}`}><span className="badge-dot" />{text(f.status || "Pendente")}</span></td><td>{href ? <a className="btn btn-secondary btn-sm" href={href} target="_blank" rel="noreferrer">Baixar boleto</a> : "-"}</td></tr>; })}</tbody></table> : <Empty title="Sem faturas" desc="Nenhuma mensalidade encontrada para seu cadastro." />}</section>}

        {tab === "notas" && <section className="student-panel"><div className="student-section-head"><div><span>Boletim</span><h2>Notas e frequência</h2></div><span className="badge badge-warning">{faltas} faltas</span></div>{notas.length ? <table className="data-table"><thead><tr><th>Atividade</th><th>Nota</th><th>Status</th><th>Data</th></tr></thead><tbody>{notas.map((n, i) => <tr key={text(n.id) || i}><td>{text(n.titulo || n.desafio || "Atividade")}</td><td><span className="badge badge-gold">{Number(n.nota || n.score || 0).toFixed(1)}</span></td><td>{text(n.status || "Corrigido")}</td><td>{dateLabel(n.data || n.created_at)}</td></tr>)}</tbody></table> : <Empty title="Sem notas publicadas" desc="As notas aparecem após correção do professor." />}</section>}

        {tab === "licoes" && <section className="student-panel"><div className="student-section-head"><div><span>Tarefas</span><h2>Lições de casa</h2></div></div>{licoesOrdenadas.length ? licoesOrdenadas.map((licao) => <article className="student-card" key={text(licao.id)}><div className="student-card-tags"><span className="badge badge-info">{text(licao.disciplina || "Inglês")}</span><span className={`badge badge-${statusBadge(entregasPorLicao.get(text(licao.id))?.status || "Pendente")}`}>{text(entregasPorLicao.get(text(licao.id))?.status || "Pendente")}</span></div><h3>{text(licao.titulo)}</h3><p>{text(licao.descricao)}</p><small>Prazo: {dateTimeLabel(licao.due_date)}</small><HomeworkSubmitForm homework={licao} submission={entregasPorLicao.get(text(licao.id))} /></article>) : <Empty title="Não há lições de casa no momento" desc="Quando uma lição for lançada, ela aparecerá aqui." />}</section>}

        {tab === "desafios" && (
          <section className="student-panel">
            <div className="student-section-head"><div><span>Desafios</span><h2>Desafios lancados</h2></div></div>
            {desafios.length ? desafios.map((desafio, index) => {
              const id = text(desafio.id || desafio.titulo || desafio.title);
              const done = conclusoes.some((conclusao) => text(conclusao.desafio_id) === id);
              const questions = challengeQuestions(desafio);
              return (
                <article className="student-card" key={id || index}>
                  <div className="student-card-tags">
                    <span className="badge badge-gold">{Number(desafio.pontos || 0)} pts</span>
                    <span className={`badge badge-${done ? "success" : "neutral"}`}>{done ? "Concluido" : "Pendente"}</span>
                    {questions.length > 0 && <span className="badge badge-info">{questions.length} questao(oes)</span>}
                  </div>
                  <h3>{text(desafio.titulo || desafio.title || "Desafio")}</h3>
                  {Array.isArray(desafio.questions) && text(desafio.descricao) && <p>{text(desafio.descricao)}</p>}
                  {questions.length > 0 ? (
                    <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                      {questions.map((question, questionIndex) => (
                        <div className="card" key={text(question.id) || questionIndex}>
                          <div className="card-body">
                            <div className="section-eyebrow">Questao {questionIndex + 1} | {challengeTypeLabel(question.tipo)} | {Number(question.pontos || 0)} pts</div>
                            <h4 className="section-title" style={{ fontSize: "1rem", marginTop: 6 }}>{text(question.enunciado) || "Questao do desafio"}</h4>
                            {Array.isArray(question.opcoes) && question.opcoes.length > 0 && (
                              <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
                                {question.opcoes.map((opcao, optionIndex) => <span className="attendance-item" key={`${text(question.id)}_${optionIndex}`}>{String.fromCharCode(65 + optionIndex)}) {opcao}</span>)}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <p>Consulte a orientacao do professor para realizar este desafio.</p>}
                </article>
              );
            }) : <Empty title="Nao ha desafios no momento" desc="Quando um desafio for lancado, ele aparecera aqui." />}
          </section>
        )}

        {tab === "biblioteca" && (
          <section className="student-panel">
            <div className="student-section-head">
              <div><span>Biblioteca</span><h2>Livros e materiais</h2></div>
              <span className="badge badge-info">{totalBiblioteca} itens</span>
            </div>

            <div style={{ display: "grid", gap: 16 }}>
              <div>
                <div className="student-section-head" style={{ marginBottom: 10 }}>
                  <div><span>PDF</span><h2>Livros para download</h2></div>
                </div>
                {biblioteca.livros.length ? (
                  <div className="student-grid">
                    {biblioteca.livros.map((livro, index) => {
                      const href = libraryHref(livro, "livros");
                      return (
                        <article className="student-card" key={text(livro.id) || index}>
                          <div className="student-card-tags">
                            <span className="badge badge-info">{text(livro.nivel || livro.nivel_livro || livro.categoria || "Livro")}</span>
                            <span className="badge badge-neutral">{text(livro.turma || "Todas")}</span>
                          </div>
                          <h3>{text(livro.titulo || livro.title || `Livro ${index + 1}`)}</h3>
                          <p>{text(livro.autor || livro.author || livro.tipo || "Material didatico")}</p>
                          {href ? <a className="btn btn-primary btn-sm" href={href} target="_blank" rel="noreferrer">Baixar material</a> : <span className="text-muted text-sm">Arquivo indisponivel</span>}
                        </article>
                      );
                    })}
                  </div>
                ) : <Empty title="Sem livros liberados" desc="Quando a escola liberar livros para sua turma, eles aparecem aqui." />}
              </div>

              <div>
                <div className="student-section-head" style={{ marginBottom: 10 }}>
                  <div><span>Apoio</span><h2>Apostilas e materiais</h2></div>
                </div>
                {biblioteca.materiais.length ? (
                  <table className="data-table">
                    <thead><tr><th>Material</th><th>Tipo</th><th>Turma</th><th>Download</th></tr></thead>
                    <tbody>
                      {biblioteca.materiais.map((material, index) => {
                        const href = libraryHref(material, "materiais");
                        return (
                          <tr key={text(material.id) || index}>
                            <td><div className="table-name-cell"><span className="table-name-primary">{text(material.titulo || material.title || `Material ${index + 1}`)}</span>{text(material.descricao) && <span className="table-name-secondary">{text(material.descricao).slice(0, 80)}</span>}</div></td>
                            <td>{text(material.tipo || material.categoria || "Apostila")}</td>
                            <td>{text(material.turma || "Todas")}</td>
                            <td>{href ? <a className="btn btn-secondary btn-sm" href={href} target="_blank" rel="noreferrer">Baixar</a> : "-"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : <Empty title="Sem materiais de apoio" desc="Apostilas e arquivos liberados pela escola aparecem aqui." />}
              </div>

              <div>
                <div className="student-section-head" style={{ marginBottom: 10 }}>
                  <div><span>Videos</span><h2>Aulas gravadas</h2></div>
                </div>
                {biblioteca.videos.length ? (
                  <table className="data-table">
                    <thead><tr><th>Video</th><th>Turma</th><th>Acesso</th></tr></thead>
                    <tbody>
                      {biblioteca.videos.map((video, index) => {
                        const href = libraryHref(video, "videos");
                        return (
                          <tr key={text(video.id) || index}>
                            <td><div className="table-name-cell"><span className="table-name-primary">{text(video.titulo || video.title || `Video ${index + 1}`)}</span>{text(video.descricao) && <span className="table-name-secondary">{text(video.descricao).slice(0, 80)}</span>}</div></td>
                            <td>{text(video.turma || "Todas")}</td>
                            <td>{href ? <a className="btn btn-secondary btn-sm" href={href} target="_blank" rel="noreferrer">Abrir</a> : "-"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : <Empty title="Sem videos liberados" desc="Aulas gravadas liberadas para sua turma aparecem aqui." />}
              </div>
            </div>
          </section>
        )}

        {tab === "chat" && <StudentChat />}
        {tab === "wiz" && <StudentWiz />}
      </main>
    </div>
  );
}
