import { AppShell } from "@/components/app-shell";
import { WizAssistantClient } from "@/components/wiz-assistant-client";
import { getSession } from "@/lib/auth";
import { dbList } from "@/lib/db";
import { redirect } from "next/navigation";

type Row = Record<string, unknown>;

export default async function WizPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const isCommercial = String(session.perfil || "").toLowerCase().includes("comercial");

  const [logs, alunos, turmas, professores] = await Promise.all([
    dbList<Row>("wiz_action_audit.json"),
    dbList<Row>("students.json"),
    dbList<Row>("classes.json"),
    dbList<Row>("teachers.json"),
  ]);

  return (
    <AppShell breadcrumb="Wiz IA" userName={session.pessoa || session.usuario} userRole={session.perfil}>
      <div className="page-header">
        <div className="page-title-block">
          <div className="page-eyebrow"><span className="page-eyebrow-dot" />Assistente do sistema</div>
          <h1 className="page-title">Wiz IA</h1>
          <p className="page-description">
            {isCommercial
              ? "Assistente comercial do Active Educacional para prospeccao, leads, matriculas, agenda e cobrancas."
              : "Assistente operacional focado apenas no Active Educacional: cadastros, envios, tarefas, trabalhos, agenda e financeiro."}
          </p>
        </div>
        <div className="page-actions">
          <span className="badge badge-success"><span className="badge-dot" />{isCommercial ? "Comercial" : "Operacional"}</span>
        </div>
      </div>

      <WizAssistantClient logs={logs} alunos={alunos} turmas={turmas} professores={professores} userRole={session.perfil} />
    </AppShell>
  );
}
