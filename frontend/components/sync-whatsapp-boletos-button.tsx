"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncWhatsappBoletosButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function sync() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/financeiro/sync-whatsapp-boletos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: false }),
      });
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (!res.ok) {
        alert(String(data.error || "Nao foi possivel sincronizar WhatsApps dos boletos."));
        return;
      }

      const atualizados = Number(data.boletos_atualizados || 0);
      const semAluno = Number(data.sem_aluno || 0);
      const semWhatsapp = Number(data.sem_whatsapp || 0);
      alert(`${atualizados} boleto(s) atualizado(s).\nSem aluno vinculado: ${semAluno}.\nSem WhatsApp no cadastro: ${semWhatsapp}.`);
      router.refresh();
    } catch {
      alert("Erro de conexao ao sincronizar WhatsApps dos boletos.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button className="btn btn-secondary" type="button" onClick={sync} disabled={loading}>
      {loading ? "Sincronizando..." : "Sincronizar WhatsApp dos boletos"}
    </button>
  );
}
