"use client";

import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useRef, useState } from "react";

const navSections = [
  {
    section: "Principal",
    items: [
      {
        href: "/",
        label: "Dashboard",
        icon: (
          <svg className="nav-icon" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
          </svg>
        )
      }
    ]
  },
  {
    section: "Acadêmico",
    items: [
      {
        href: "/alunos",
        label: "Alunos",
        icon: (
          <svg className="nav-icon" viewBox="0 0 20 20" fill="currentColor">
            <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
          </svg>
        )
      },
      {
        href: "/professores",
        label: "Professores",
        icon: (
          <svg className="nav-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
          </svg>
        )
      },
      {
        href: "/turmas",
        label: "Turmas",
        icon: (
          <svg className="nav-icon" viewBox="0 0 20 20" fill="currentColor">
            <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
          </svg>
        )
      },
      {
        href: "/agenda",
        label: "Agenda",
        icon: (
          <svg className="nav-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
          </svg>
        )
      },
      {
        href: "/mural",
        label: "Mural",
        icon: (
          <svg className="nav-icon" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H7l-4 3v-3H4a2 2 0 01-2-2V5zm4 2a1 1 0 000 2h8a1 1 0 100-2H6zm0 4a1 1 0 100 2h5a1 1 0 100-2H6z" />
          </svg>
        )
      },
      {
        href: "/licoes",
        label: "Licoes de Casa",
        icon: (
          <svg className="nav-icon" viewBox="0 0 20 20" fill="currentColor">
            <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
            <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm4 5a1 1 0 011-1h5a1 1 0 110 2H9a1 1 0 01-1-1zm-1 4a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
        )
      },
      {
        href: "/correcao-licoes",
        label: "Correcao de Licoes",
        icon: (
          <svg className="nav-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0l-3.25-3.25a1 1 0 111.414-1.414l2.543 2.543 6.543-6.543a1 1 0 011.414 0z" clipRule="evenodd" />
            <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2v-3a1 1 0 10-2 0v3H4V5h8a1 1 0 100-2H4z" />
          </svg>
        )
      },
      {
        href: "/desafios",
        label: "Desafios",
        icon: (
          <svg className="nav-icon" viewBox="0 0 20 20" fill="currentColor">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        )
      },
      {
        href: "/notas",
        label: "Notas",
        icon: (
          <svg className="nav-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V7.414A2 2 0 0017.414 6L14 2.586A2 2 0 0012.586 2H4zm2 5a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm0 3a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm0 3a1 1 0 011-1h3a1 1 0 110 2H7a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
        )
      },
      {
        href: "/biblioteca",
        label: "Biblioteca",
        icon: (
          <svg className="nav-icon" viewBox="0 0 20 20" fill="currentColor">
            <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
          </svg>
        )
      }
    ]
  },
  {
    section: "Gestão",
    items: [
      {
        href: "/financeiro",
        label: "Financeiro",
        icon: (
          <svg className="nav-icon" viewBox="0 0 20 20" fill="currentColor">
            <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
            <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
          </svg>
        )
      },
      {
        href: "/comercial",
        label: "Comercial",
        icon: (
          <svg className="nav-icon" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3 2a1 1 0 000 2h7a1 1 0 100-2H5zm0 4a1 1 0 100 2h4a1 1 0 100-2H5z" />
          </svg>
        )
      },
      {
        href: "/atendimento",
        label: "Atendimento",
        icon: (
          <svg className="nav-icon" viewBox="0 0 20 20" fill="currentColor">
            <path d="M18 10c0 3.314-3.582 6-8 6a9.77 9.77 0 01-3.468-.616L2 17l1.42-3.314C2.521 12.65 2 11.38 2 10c0-3.314 3.582-6 8-6s8 2.686 8 6z" />
          </svg>
        )
      },
      {
        href: "/estoque",
        label: "Estoque",
        icon: (
          <svg className="nav-icon" viewBox="0 0 20 20" fill="currentColor">
            <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM14 11a1 1 0 011 1v1h1a1 1 0 110 2h-1v1a1 1 0 11-2 0v-1h-1a1 1 0 110-2h1v-1a1 1 0 011-1z" />
          </svg>
        )
      },
      {
        href: "/wiz",
        label: "Wiz IA",
        icon: (
          <svg className="nav-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
        )
      },
      {
        href: "/condojob",
        label: "CondoJob",
        icon: (
          <svg className="nav-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h5v-4h2v4h5a2 2 0 002-2V5a2 2 0 00-2-2H4zm1 3h2v2H5V6zm3 0h2v2H8V6zm3 0h2v2h-2V6zm3 0h1v2h-1V6zM5 10h2v2H5v-2zm3 0h2v2H8v-2zm3 0h2v2h-2v-2zm3 0h1v2h-1v-2z" clipRule="evenodd" />
          </svg>
        )
      },
      {
        href: "/configuracoes",
        label: "Configurações",
        icon: (
          <svg className="nav-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
          </svg>
        )
      },
      {
        href: "/usuarios/credenciais",
        label: "Acessos",
        icon: (
          <svg className="nav-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L7 17H4v-3l3.257-3.257A6 6 0 1118 8zm-6-2a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
          </svg>
        )
      }
    ]
  }
];

type AppShellProps = {
  children: ReactNode;
  breadcrumb?: string;
  userName?: string;
  userRole?: string;
  userUnit?: string;
};

function routeBlocked(href: string, blockedRoutes: string[]) {
  const target = href === "/" ? "/" : href.replace(/\/+$/, "");
  return blockedRoutes.some((blocked) => {
    const item = blocked === "/" ? "/" : blocked.replace(/\/+$/, "");
    if (item === "/") return target === "/";
    return target === item || target.startsWith(`${item}/`);
  });
}

function canSeeNavItem(userRole: string, href: string, blockedRoutes: string[] = []) {
  const role = userRole.toLowerCase();
  if (routeBlocked(href, blockedRoutes)) return false;
  if (role.includes("admin") || role.includes("coord") || role.includes("dire")) return true;
  if (role.includes("comercial")) {
    return ["/", "/alunos", "/financeiro", "/agenda", "/condojob", "/comercial", "/atendimento", "/wiz"].includes(href);
  }
  if (role.includes("prof")) {
    return ["/", "/agenda", "/turmas", "/mural", "/licoes", "/desafios", "/notas", "/biblioteca"].includes(href);
  }
  return href === "/";
}

export function AppShell({
  children,
  breadcrumb,
  userName = "Administrador",
  userRole = "Admin",
  userUnit
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [blockedRoutes, setBlockedRoutes] = useState<string[]>([]);

  const initials = userName.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
  const canManageAccess = userRole.toLowerCase().includes("admin") || userRole.toLowerCase().includes("coord");

  useEffect(() => {
    let alive = true;
    fetch("/api/me/access")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!alive || !data) return;
        const blocked = Array.isArray(data.blockedRoutes) ? data.blockedRoutes : [];
        setBlockedRoutes((prev) => {
          const same = prev.length === blocked.length && prev.every((r, i) => r === blocked[i]);
          return same ? prev : blocked;
        });
        if (routeBlocked(pathname, blocked)) {
          const modules = Array.isArray(data.modules) ? data.modules : [];
          const firstAllowed = modules.find((item: { allowed?: boolean; path?: string }) => item.allowed && item.path)?.path;
          routerRef.current.replace(firstAllowed || "/login");
        }
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [pathname]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth", { method: "DELETE" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <div className="app-shell">
      {/* Backdrop mobile */}
      <div
        className={`sidebar-backdrop${mobileOpen ? " open" : ""}`}
        onClick={() => setMobileOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`sidebar${mobileOpen ? " mobile-open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-logo-row">
            <div className="brand-icon">
              <img src="/logo.png" alt="Ativo Educacional Sistema" />
            </div>
            <div>
              <div className="brand-name">Ativo Educacional</div>
              <div className="brand-tagline">Sistema Educacional</div>
            </div>
          </div>
          <div className="brand-status">
            <div className="brand-status-dot" />
            <span className="brand-status-text">Sistema operacional</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navSections.map((section) => (
            <div key={section.section}>
              <div className="nav-section-label">{section.section}</div>
              {section.items.filter((item) => canSeeNavItem(userRole, item.href, blockedRoutes) && (item.href !== "/usuarios/credenciais" || canManageAccess)).map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`nav-item${isActive ? " active" : ""}`}
                    onClick={() => setMobileOpen(false)}
                  >
                    {item.icon}
                    <span className="nav-label">{item.label}</span>
                  </a>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user-card">
            <div className="user-avatar">{initials}</div>
            <div className="user-info">
              <div className="user-greeting">Olá, {userName.split(" ")[0]}</div>
              <div className="user-name">{userName}</div>
              <div className="user-role">{userRole}{userUnit ? ` · ${userUnit}` : ""}</div>
            </div>
          </div>
          <button
            className="sidebar-logout-btn"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h7a1 1 0 100-2H4V5h6a1 1 0 100-2H3zm11.707 4.293a1 1 0 010 1.414L13.414 10l1.293 1.293a1 1 0 01-1.414 1.414l-2-2a1 1 0 010-1.414l2-2a1 1 0 011.414 0z" clipRule="evenodd" />
              <path fillRule="evenodd" d="M13 10a1 1 0 011-1h3a1 1 0 110 2h-3a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
            {loggingOut ? "Saindo..." : "Sair do sistema"}
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-menu-btn"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menu"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div className="topbar-breadcrumb">
              <span>Ativo Educacional</span>
              {breadcrumb && (
                <>
                  <span className="breadcrumb-sep">/</span>
                  <span className="breadcrumb-current">{breadcrumb}</span>
                </>
              )}
            </div>
          </div>
          <div className="topbar-right">
            <button className="topbar-action-btn" title="Notificações">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
              </svg>
              <div className="notif-dot" />
            </button>
            <div className="topbar-user-pill" title={userName}>
              <div className="topbar-avatar">{initials}</div>
              <span className="topbar-user-name">{userName.split(" ")[0]}</span>
            </div>
          </div>
        </header>

        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
