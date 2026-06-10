"use client";

export function StudentLogoutBtn() {
  async function handleLogout() {
    await fetch("/api/auth", { method: "DELETE" });
    window.location.href = "/aluno/login";
  }

  return (
    <button
      onClick={handleLogout}
      className="student-logout-btn"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" width={16} height={16}>
        <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1v-2a1 1 0 10-2 0v1H4V5h6v1a1 1 0 102 0V4a1 1 0 00-1-1H3z" clipRule="evenodd" />
        <path d="M13.293 7.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L14.586 12H8a1 1 0 110-2h6.586l-1.293-1.293a1 1 0 010-1.414z" />
      </svg>
      Sair da conta
    </button>
  );
}
