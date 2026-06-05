"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";

type ManagedUser = {
  source: "internal" | "teacher" | "student";
  id: string;
  nome: string;
  usuario: string;
  perfil: string;
  email: string;
  telefone: string;
  cpf: string;
  status: string;
  is_active: boolean;
  tem_acesso: boolean;
  created_at?: string;
  last_login_at?: string;
  deleted_at?: string;
};

type AccessModule = { key: string; label: string; path: string; allowed: boolean };
type UsuarioPermissao = { id: string; nome: string; usuario: string; perfil: string; blocked_routes: string[]; modules: AccessModule[] };

type EditState = {
  source: ManagedUser["source"];
  id: string;
  nome: string;
  usuario: string;
  perfil: string;
  email: string;
  telefone: string;
  cpf: string;
  is_active: boolean;
};

function text(value: unknown) {
  return String(value || "").trim();
}

function lower(value: unknown) {
  return text(value).toLowerCase();
}

function sourceLabel(source: ManagedUser["source"]) {
  if (source === "student") return "Aluno";
  if (source === "teacher") return "Professor";
  return "Interno";
}

function dateLabel(value?: string) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("pt-BR");
}

export default function CredenciaisUsuariosPage() {
  const [usuarios, setUsuarios] = useState<ManagedUser[]>([]);
  const [permissoes, setPermissoes] = useState<UsuarioPermissao[]>([]);
  const [savingPermissao, setSavingPermissao] = useState("");
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [perfilFiltro, setPerfilFiltro] = useState("Todos");
  const [origemFiltro, setOrigemFiltro] = useState("Todos");
  const [edit, setEdit] = useState<EditState | null>(null);

  useEffect(() => {
    void carregarTudo();
  }, []);

  async function carregarTudo() {
    setLoading(true);
    const [usuariosRes, permissoesRes] = await Promise.all([
      fetch("/api/usuarios/gestao", { cache: "no-store" }),
      fetch("/api/acessos/permissoes", { cache: "no-store" }),
    ]);

    const usuariosData = await usuariosRes.json().catch(() => ({}));
    const permissoesData = await permissoesRes.json().catch(() => ({}));

    setUsuarios(Array.isArray(usuariosData.usuarios) ? usuariosData.usuarios : []);
    setPermissoes(Array.isArray(permissoesData.usuarios) ? permissoesData.usuarios : []);
    setLoading(false);
  }

  const perfis = useMemo(() => ["Todos", ...Array.from(new Set(usuarios.map((user) => text(user.perfil)).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"))], [usuarios]);
  const filtrados = useMemo(() => usuarios.filter((user) => {
    const haystack = [
      user.nome,
      user.usuario,
      user.perfil,
      user.email,
      user.telefone,
      user.cpf,
    ].map(lower).join(" ");
    const matchBusca = !busca || haystack.includes(lower(busca));
    const matchPerfil = perfilFiltro === "Todos" || text(user.perfil) === perfilFiltro;
    const matchOrigem = origemFiltro === "Todos" || user.source === origemFiltro;
    return matchBusca && matchPerfil && matchOrigem;
  }), [usuarios, busca, perfilFiltro, origemFiltro]);

  function abrirEdicao(user: ManagedUser) {
    setEdit({
      source: user.source,
      id: user.id,
      nome: user.nome,
      usuario: user.usuario,
      perfil: user.perfil,
      email: user.email,
      telefone: user.telefone,
      cpf: user.cpf,
      is_active: user.is_active,
    });
    setFeedback("");
  }

  async function salvarEdicao() {
    if (!edit) return;
    const res = await fetch("/api/usuarios/gestao", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(edit),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFeedback(text(data.error || "Erro ao salvar cadastro."));
      return;
    }
    setEdit(null);
    setFeedback("Cadastro atualizado com sucesso.");
    await carregarTudo();
  }

  async function resetarSenha(user: ManagedUser) {
    if (!confirm(`Redefinir a senha de ${user.nome}?`)) return;
    const res = await fetch("/api/usuarios/gestao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset_password", source: user.source, id: user.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFeedback(text(data.error || "Erro ao redefinir senha."));
      return;
    }
    alert(`Senha temporaria de ${user.nome}: ${text(data.senha_temporaria)}`);
    setFeedback(`Senha redefinida para ${user.nome}.`);
    await carregarTudo();
  }

  async function excluirUsuario(user: ManagedUser) {
    if (!confirm(`Excluir ${user.nome}? Esta acao pode inativar ou remover o cadastro.`)) return;
    const res = await fetch(`/api/usuarios/gestao?source=${encodeURIComponent(user.source)}&id=${encodeURIComponent(user.id)}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFeedback(text(data.error || "Erro ao excluir usuario."));
      return;
    }
    setFeedback(`${user.nome} removido(a) com sucesso.`);
    await carregarTudo();
  }

  async function alternarPermissao(usuario: UsuarioPermissao, module: AccessModule, liberado: boolean) {
    const atual = new Set(usuario.blocked_routes || []);
    if (liberado) atual.delete(module.path);
    else atual.add(module.path);

    const blocked_routes = Array.from(atual);
    setSavingPermissao(`${usuario.usuario}:${module.path}`);
    const res = await fetch("/api/acessos/permissoes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario: usuario.usuario, blocked_routes }),
    });
    const data = await res.json().catch(() => ({}));
    setSavingPermissao("");
    if (!res.ok) {
      setFeedback(text(data.error || "Erro ao salvar permissao."));
      return;
    }
    setPermissoes((prev) => prev.map((item) =>
      item.usuario === usuario.usuario
        ? {
            ...item,
            blocked_routes,
            modules: item.modules.map((m) => m.path === module.path ? { ...m, allowed: liberado } : m),
          }
        : item
    ));
    setFeedback("Permissao atualizada com sucesso.");
  }

  return (
    <AppShell breadcrumb="Acessos">
      <div className="page-header">
        <div className="page-title-block">
          <div className="page-eyebrow"><span className="page-eyebrow-dot" />Administracao</div>
          <h1 className="page-title">Usuarios e acessos</h1>
          <p className="page-description">Central do ADM para alunos, professores, coordenadores, comercial e administradores, com edicao, exclusao e redefinicao de senha.</p>
        </div>
        <div className="page-actions">
          <a className="btn btn-secondary" href="/alunos">Alunos</a>
          <a className="btn btn-secondary" href="/professores">Professores</a>
        </div>
      </div>

      {feedback && <div className={feedback.toLowerCase().includes("erro") ? "form-error" : "form-success"} style={{ marginBottom: 16 }}>{feedback}</div>}

      <div className="card">
        <div className="toolbar">
          <div className="toolbar-left">
            <div className="search-bar">
              <span className="search-icon">
                <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg>
              </span>
              <input className="search-input" placeholder="Buscar por nome, email, CPF, telefone ou login..." value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
          </div>
          <div className="toolbar-right">
            <select className="filter-select" value={origemFiltro} onChange={(e) => setOrigemFiltro(e.target.value)}>
              <option value="Todos">Todos os tipos</option>
              <option value="internal">Internos</option>
              <option value="teacher">Professores</option>
              <option value="student">Alunos</option>
            </select>
            <select className="filter-select" value={perfilFiltro} onChange={(e) => setPerfilFiltro(e.target.value)}>
              {perfis.map((perfil) => <option key={perfil} value={perfil}>{perfil}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="section-eyebrow">Gestao</div>
            <h3 className="section-title">Cadastros do sistema</h3>
            <p className="section-subtitle">{filtrados.length} usuario(s) no filtro atual</p>
          </div>
        </div>
        <div className="card-body" style={{ paddingTop: 12 }}>
          {loading ? (
            <div className="empty-state"><div className="empty-title">Carregando usuarios...</div></div>
          ) : filtrados.length === 0 ? (
            <div className="empty-state"><div className="empty-title">Nenhum usuario encontrado</div><p className="empty-desc">Ajuste os filtros para localizar outro cadastro.</p></div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Perfil</th>
                  <th>Origem</th>
                  <th>Contato</th>
                  <th>Status</th>
                  <th>Ultimo acesso</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((user) => (
                  <tr key={`${user.source}:${user.id}`}>
                    <td>
                      <div className="table-name-cell">
                        <span className="table-name-primary">{user.nome}</span>
                        <span className="table-name-secondary">{user.usuario || "Sem login"} {user.cpf ? `· CPF ${user.cpf}` : ""}</span>
                      </div>
                    </td>
                    <td>{user.perfil}</td>
                    <td>{sourceLabel(user.source)}</td>
                    <td>
                      <div className="table-name-cell">
                        <span className="table-name-primary">{user.email || "-"}</span>
                        <span className="table-name-secondary">{user.telefone || "-"}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge badge-${user.is_active ? "success" : "neutral"}`}>
                        <span className="badge-dot" />{user.status}
                      </span>
                    </td>
                    <td>{dateLabel(user.last_login_at)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => abrirEdicao(user)}>Editar</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => resetarSenha(user)}>Redefinir senha</button>
                        <button className="btn btn-danger btn-sm" onClick={() => excluirUsuario(user)}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card" id="permissoes" style={{ marginTop: 18 }}>
        <div className="card-header">
          <div>
            <div className="section-eyebrow">Permissoes</div>
            <h3 className="section-title">Controle por usuario interno</h3>
            <p className="section-subtitle">Disponivel para usuarios internos com login no painel administrativo.</p>
          </div>
        </div>
        <div className="card-body" style={{ paddingTop: 12 }}>
          {permissoes.length === 0 ? (
            <div className="empty-state"><div className="empty-title">Sem usuarios internos com permissoes</div></div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Usuario</th><th>Perfil</th><th>Modulos liberados</th></tr></thead>
              <tbody>
                {permissoes.map((u) => (
                  <tr key={u.usuario}>
                    <td>
                      <div style={{ fontWeight: 800 }}>{u.nome || u.usuario}</div>
                      <div className="muted" style={{ fontSize: "0.78rem" }}>{u.usuario}</div>
                    </td>
                    <td>{u.perfil}</td>
                    <td>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {u.modules.map((m) => {
                          const id = `${u.usuario}:${m.path}`;
                          return (
                            <label key={m.path} className={`badge badge-${m.allowed ? "success" : "neutral"}`} style={{ cursor: "pointer" }}>
                              <input
                                type="checkbox"
                                checked={m.allowed}
                                disabled={savingPermissao === id}
                                onChange={(e) => alternarPermissao(u, m, e.target.checked)}
                                style={{ marginRight: 6 }}
                              />
                              {m.label}
                            </label>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {edit && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setEdit(null)}>
          <div className="modal-box" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <div className="modal-title">Editar cadastro</div>
              <button className="modal-close" onClick={() => setEdit(null)}>x</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group"><label className="form-label">Nome</label><input className="form-input" value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} /></div>
                <div className="form-group"><label className="form-label">Login</label><input className="form-input" value={edit.usuario} onChange={(e) => setEdit({ ...edit, usuario: e.target.value })} /></div>
                <div className="form-group"><label className="form-label">Perfil</label><input className="form-input" value={edit.perfil} onChange={(e) => setEdit({ ...edit, perfil: e.target.value })} disabled={edit.source !== "internal"} /></div>
                <div className="form-group"><label className="form-label">CPF</label><input className="form-input" value={edit.cpf} onChange={(e) => setEdit({ ...edit, cpf: e.target.value })} /></div>
                <div className="form-group"><label className="form-label">E-mail</label><input className="form-input" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></div>
                <div className="form-group"><label className="form-label">Telefone</label><input className="form-input" value={edit.telefone} onChange={(e) => setEdit({ ...edit, telefone: e.target.value })} /></div>
                <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                  <label className="checkbox-row">
                    <input type="checkbox" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} />
                    Usuario ativo
                  </label>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEdit(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={salvarEdicao}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
