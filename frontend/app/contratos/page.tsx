import { AppShell } from "@/components/app-shell";
import { ContratosClient } from "@/components/contratos-client";
import { getSession } from "@/lib/auth";
import { dbList } from "@/lib/db";
import { isAdmin, isAdminOrCoordinator } from "@/lib/roles";
import { redirect } from "next/navigation";

export default async function ContratosPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isAdminOrCoordinator(session)) redirect("/");

  const [alunos, contratos] = await Promise.all([
    dbList<Record<string, unknown>>("students.json"),
    dbList<Record<string, unknown>>("contracts.json"),
  ]);

  return (
    <AppShell breadcrumb="Contratos" userName={session.pessoa || session.usuario} userRole={session.perfil}>
      <ContratosClient alunos={alunos} contratos={contratos} isAdmin={isAdmin(session)} />
    </AppShell>
  );
}
