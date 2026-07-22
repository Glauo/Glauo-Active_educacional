"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function AlunoLoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/aluno", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: login.trim().toLowerCase(), senha })
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Login ou senha incorretos.");
        setLoading(false);
        return;
      }

      router.push(typeof data.redirectTo === "string" ? data.redirectTo : "/aluno");
      router.refresh();
    } catch {
      setErro("Erro de conexão. Tente novamente.");
      setLoading(false);
    }
  }

  return (
    <div className="login-shell" style={{ background: "var(--bg-base)" }}>
      {/* Painel esquerdo — visual */}
      <div className="login-brand" style={{
        background: "linear-gradient(160deg, #0f2044 0%, #1a3a6e 60%, #1a4fa8 100%)"
      }}>
        <div className="login-brand-content">
          <div className="login-brand-icon" style={{
            background: "rgba(255,255,255,0.12)",
            borderRadius: "20px",
            width: "72px",
            height: "72px",
            display: "grid",
            placeItems: "center",
            marginBottom: "28px"
          }}>
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c3 3 9 3 12 0v-5" />
            </svg>
          </div>
          <h1 style={{ fontSize: "2rem", fontWeight: 800, color: "#fff", lineHeight: 1.15, marginBottom: "12px" }}>
            Área do Aluno
          </h1>
          <p style={{ color: "rgba(255,255,255,0.65)", fontSize: "1rem", lineHeight: 1.6, maxWidth: "320px" }}>
            Acesse seus desafios, materiais e acompanhe seu progresso na Ativo Educacional.
          </p>

          <div style={{ marginTop: "48px", display: "flex", flexDirection: "column", gap: "16px" }}>
            {[
              { icon: "⭐", label: "Desafios e pontuação" },
              { icon: "📚", label: "Material didatico" },
              { icon: "📊", label: "Seu progresso e histórico" }
            ].map(({ icon, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ fontSize: "1.2rem" }}>{icon}</span>
                <span style={{ color: "rgba(255,255,255,0.75)", fontSize: "0.9rem" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Painel direito — formulário */}
      <div className="login-form-panel">
        <div className="login-form-box">
          <div style={{ marginBottom: "32px" }}>
            <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--blue-500)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
              Ativo Educacional
            </div>
            <h2 style={{ fontSize: "1.625rem", fontWeight: 800, color: "var(--text-primary)", marginBottom: "6px" }}>
              Bem-vindo de volta
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
              Use o login e a senha fornecidos pela escola.
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div className="form-group">
              <label className="form-label">Login</label>
              <input
                className="form-input"
                type="text"
                autoComplete="username"
                placeholder="Seu login de acesso"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Senha</label>
              <input
                className="form-input"
                type="password"
                autoComplete="current-password"
                placeholder="Sua senha"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            {erro && (
              <div style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
                borderRadius: "var(--radius-md)",
                padding: "12px 16px",
                color: "var(--red-700)",
                fontSize: "0.875rem",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {erro}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ width: "100%", justifyContent: "center", padding: "14px", fontSize: "1rem", marginTop: "4px" }}
            >
              {loading ? "Entrando…" : "Entrar na minha área"}
            </button>
          </form>

          <div style={{ marginTop: "32px", borderTop: "1px solid var(--border)", paddingTop: "20px", textAlign: "center" }}>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-faint)" }}>
              Problemas com seu acesso? Fale com a secretaria.
            </p>
            <a href="/login" style={{ fontSize: "0.8125rem", color: "var(--blue-500)", marginTop: "8px", display: "block" }}>
              Acesso administrativo →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
