"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "@/components/locale-switcher";

const UNIDADES = ["Mister Wiz", "CondoJob"];

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations("login");
  const ts = useTranslations("shell");
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [unidade, setUnidade] = useState("Mister Wiz");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const features = [
    {
      icon: (
        <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
      ),
      title: t("feature1Title"),
      desc: t("feature1Desc"),
    },
    {
      icon: (
        <>
          <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
          <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
        </>
      ),
      title: t("feature2Title"),
      desc: t("feature2Desc"),
    },
    {
      icon: (
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      ),
      title: t("feature3Title"),
      desc: t("feature3Desc"),
    },
  ];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, senha, unit: unidade }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t("invalidCredentials"));
        return;
      }

      router.push(typeof data.redirectTo === "string" ? data.redirectTo : "/");
      router.refresh();
    } catch {
      setError(t("connectionError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-brand">
        <div style={{ position: "relative" }}>
          <div className="login-brand-logo">
            <div className="login-logo-ring">
              <img src="/logo.png" alt="Ativo Educacional Sistema" />
            </div>
            <div>
              <div className="login-brand-name">{ts("brandName")}</div>
              <div className="login-brand-tagline">{ts("brandTagline")}</div>
            </div>
          </div>

          <h2 className="login-headline">{t("headline")}</h2>

          <div className="login-features">
            {features.map((f, i) => (
              <div className="login-feature" key={i}>
                <div className="login-feature-icon">
                  <svg viewBox="0 0 20 20" fill="currentColor">{f.icon}</svg>
                </div>
                <div>
                  <div className="login-feature-title">{f.title}</div>
                  <div className="login-feature-desc">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: "relative" }}>
          <div className="login-stats-label">{t("statsLabel")}</div>
          <div className="login-stats">
            <div className="login-stat">
              <div className="login-stat-value">{t("statPortal")}</div>
              <div className="login-stat-label">{t("statPortalDesc")}</div>
            </div>
            <div className="login-stat">
              <div className="login-stat-value">{t("statFinance")}</div>
              <div className="login-stat-label">{t("statFinanceDesc")}</div>
            </div>
            <div className="login-stat">
              <div className="login-stat-value">{t("statWapi")}</div>
              <div className="login-stat-label">{t("statWapiDesc")}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="login-form-area">
        <div className="login-box">
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <LocaleSwitcher compact />
          </div>

          <div className="login-premium-badge">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            {t("badge")}
          </div>

          <h1 className="login-title">{t("title")}</h1>
          <p className="login-subtitle">{t("subtitle")}</p>

          <div className="login-divider" />

          <form className="login-form" onSubmit={handleSubmit}>
            {error && <div className="login-error">{error}</div>}

            <div className="form-group">
              <label className="form-label" htmlFor="unidade">{t("unit")}</label>
              <select
                id="unidade"
                className="form-select"
                value={unidade}
                onChange={(e) => setUnidade(e.target.value)}
              >
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="usuario">{t("user")}</label>
              <input
                id="usuario"
                type="text"
                className="form-input"
                placeholder={t("userPlaceholder")}
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                required
                autoComplete="username"
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="senha">{t("password")}</label>
              <input
                id="senha"
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            <button type="submit" className="btn-login" disabled={loading}>
              {loading ? (
                t("submitting")
              ) : (
                <>
                  {t("submit")}
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </>
              )}
            </button>
          </form>

          <div className="login-secure">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            {t("secure")}
          </div>

          <p style={{ marginTop: "28px", fontSize: "0.75rem", color: "var(--text-faint)", textAlign: "center" }}>
            {t("footer")}
          </p>
        </div>
      </div>
    </div>
  );
}
