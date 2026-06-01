import { AppShell } from "@/components/app-shell";
import { MuralCreateButton, MuralPostActions } from "@/components/school-modules-client";
import { getSession } from "@/lib/auth";
import { dbList } from "@/lib/db";
import { getSchoolClasses } from "@/lib/school-data";
import { canManageAllSchoolContent, canManageSchoolContent, tagBadge, text, type WallPost } from "@/lib/school-modules";
import { redirect } from "next/navigation";

function sortPosts(posts: WallPost[]) {
  return [...posts].sort((a, b) => {
    if (Boolean(a.fixado) !== Boolean(b.fixado)) return Boolean(a.fixado) ? -1 : 1;
    return text(b.publicado_em || b.data).localeCompare(text(a.publicado_em || a.data));
  });
}

export default async function MuralPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const posts = await dbList<WallPost>("messages.json");
  const turmas = await getSchoolClasses();
  const active = posts.filter((post) => !text(post.status).toLowerCase().includes("expir"));
  const needRead = posts.reduce((sum, post) => sum + (post.requer_confirmacao ? 1 : 0), 0);
  const confirmations = posts.reduce((sum, post) => sum + (Array.isArray(post.confirmacoes) ? post.confirmacoes.length : 0), 0);
  const canCreate = canManageSchoolContent(session);

  return (
    <AppShell breadcrumb="Mural" userName={session.pessoa || session.usuario} userRole={session.perfil}>
      <div className="page-header">
        <div className="page-title-block">
          <div className="page-eyebrow"><span className="page-eyebrow-dot" />Comunicacao Escolar</div>
          <h1 className="page-title">Mural de noticias e comunicados</h1>
          <p className="page-description">Canal oficial para comunicados, eventos, enquetes e confirmacoes de leitura no portal do aluno.</p>
        </div>
        <div className="page-actions">{canCreate && <MuralCreateButton canPin={canManageAllSchoolContent(session)} turmas={turmas} />}</div>
      </div>

      <div className="metric-grid metric-grid-4">
        <div className="metric-card metric-card-blue"><div className="metric-label">Posts publicados</div><div className="metric-value">{posts.length}</div><div className="metric-note">{active.length} ativos no mural</div></div>
        <div className="metric-card metric-card-gold"><div className="metric-label">Fixados</div><div className="metric-value">{posts.filter((post) => post.fixado).length}</div><div className="metric-note">Com destaque no topo</div></div>
        <div className="metric-card metric-card-green"><div className="metric-label">Confirmacoes</div><div className="metric-value">{confirmations}</div><div className="metric-note">{needRead} posts exigem leitura</div></div>
        <div className="metric-card metric-card-red"><div className="metric-label">Urgentes</div><div className="metric-value">{posts.filter((post) => text(post.tipo_post || post.tipo).toLowerCase().includes("urgent")).length}</div><div className="metric-note">Envio prioritario registrado</div></div>
      </div>

      <div className="content-grid grid-2-1">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="section-eyebrow">Feed institucional</div>
              <h3 className="section-title">Publicacoes recentes</h3>
            </div>
            <div className="tab-bar"><button className="tab-btn active">Todos</button><button className="tab-btn">Comunicados</button><button className="tab-btn">Eventos</button><button className="tab-btn">Urgentes</button></div>
          </div>
          <div className="card-body" style={{ display: "grid", gap: 14 }}>
            {posts.length === 0 ? (
              <div className="empty-state"><div className="empty-title">Nenhum comunicado publicado</div><p className="empty-desc">Crie o primeiro post para liberar o feed do mural no portal do aluno.</p></div>
            ) : sortPosts(posts).map((post) => {
              const tipo = text(post.tipo_post || post.tipo || "Aviso Geral");
              const confirmacoes = Array.isArray(post.confirmacoes) ? post.confirmacoes.length : 0;
              const votos = Array.isArray(post.votos) ? post.votos.length : 0;
              const turmaDestino = [text(post.turma || "Todas"), ...(Array.isArray(post.turmas) ? post.turmas.map(text) : [])].filter(Boolean).join(", ");
              return (
                <article className="entity-card" key={text(post.id || post.titulo)} style={{ cursor: "default" }}>
                  <div className="entity-card-top">
                    <div className="entity-card-info">
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                        <span className={`badge badge-${tagBadge(tipo)}`}><span className="badge-dot" />{tipo}</span>
                        {post.fixado && <span className="badge badge-gold"><span className="badge-dot" />Fixado</span>}
                        {post.requer_confirmacao && <span className="badge badge-warning"><span className="badge-dot" />Leitura obrigatoria</span>}
                      </div>
                      <div className="entity-card-name">{text(post.titulo || "Comunicado")}</div>
                      <div className="entity-card-sub">{text(post.autor || "Sistema")} | {text(post.data || post.publicado_em || "-")} | {turmaDestino}</div>
                    </div>
                    {canCreate && <MuralPostActions post={post} canPin={canManageAllSchoolContent(session)} turmas={turmas} />}
                  </div>
                  <p style={{ color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 12 }}>{text(post.mensagem).slice(0, 260)}{text(post.mensagem).length > 260 ? "..." : ""}</p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span className="badge badge-neutral"><span className="badge-dot" />{confirmacoes} confirmacoes</span>
                    <span className="badge badge-neutral"><span className="badge-dot" />{votos} votos</span>
                    <span className="badge badge-info"><span className="badge-dot" />WhatsApp/e-mail pendente</span>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card card-hero">
            <div className="card-body">
              <div className="section-eyebrow">Alcance</div>
              <h3 className="section-title" style={{ marginBottom: 14 }}>Controle de leitura</h3>
              <div className="spotlight-list">
                {sortPosts(posts).filter((post) => post.requer_confirmacao).slice(0, 5).map((post) => (
                  <div className="spotlight-row" key={text(post.id)}>
                    <span className="spotlight-label">{text(post.titulo)}</span>
                    <span className="spotlight-value">{Array.isArray(post.confirmacoes) ? post.confirmacoes.length : 0}</span>
                  </div>
                ))}
                {posts.filter((post) => post.requer_confirmacao).length === 0 && <p className="text-muted text-sm">Nenhum post exige confirmacao no momento.</p>}
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <div className="section-eyebrow">Permissoes</div>
              <h3 className="section-title" style={{ marginBottom: 14 }}>Operacao segura</h3>
              <div className="pipeline">
                <div className="pipeline-step"><div className="pipeline-num">01</div><div className="pipeline-title">Aluno e responsavel apenas visualizam e confirmam leitura.</div></div>
                <div className="pipeline-step"><div className="pipeline-num">02</div><div className="pipeline-title">Professor publica para suas turmas e acompanha alcance.</div></div>
                <div className="pipeline-step"><div className="pipeline-num">03</div><div className="pipeline-title">Coordenacao e direcao podem fixar comunicados criticos.</div></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
