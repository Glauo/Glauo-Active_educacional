import { AppShell } from "@/components/app-shell";
import { dbList, dbListWithoutKeys } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ImportarBoletoPdfBtn, NovoLancamentoBtn } from "@/components/financeiro-modal";
import { FinanceiroTable } from "@/components/financeiro-table";
import { FinanceiroCommandCenter, FinanceiroExportButton } from "@/components/financeiro-command-center";
import { SyncWhatsappBoletosButton } from "@/components/sync-whatsapp-boletos-button";
import { isAdmin, isAdminOrCoordinator } from "@/lib/roles";
import { ensureStudentsMonthlyBilling } from "@/lib/monthly-billing";

type Lancamento = { id?: string; aluno?: string; nome?: string; descricao?: string; valor?: number | string; vencimento?: string; data_vencimento?: string; status?: string; situacao?: string; tipo?: string; codigo?: string; [k: string]: unknown };
const HEAVY_KEYS = ["boleto_pdf_b64", "file_b64", "pdf_b64", "base64", "arquivo_b64", "foto_b64", "imagem_b64", "documento_b64", "anexo_b64"];

function parseValor(v: unknown): number {
  return parseFloat(String(v || "0").replace(/[^\d.,]/g, "").replace(",", ".")) || 0;
}

function formatBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function valorParcela(lancamento: Lancamento) {
  return parseValor(lancamento.valor_parcela ?? lancamento.valor ?? 0);
}

export default async function FinanceiroPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  let [recebimentos, despesas, alunos, professores, fornecedores, fechamentos] = await Promise.all([
    dbListWithoutKeys<Lancamento>("receivables.json", HEAVY_KEYS),
    dbList<Lancamento>("payables.json"),
    dbListWithoutKeys<Record<string, unknown>>("students.json", HEAVY_KEYS),
    dbList<Record<string, unknown>>("teachers.json"),
    dbList<Record<string, unknown>>("fornecedores.json"),
    dbList<Record<string, unknown>>("professor_fechamentos.json"),
  ]);
  if (isAdminOrCoordinator(session)) {
    const criadas = await ensureStudentsMonthlyBilling(alunos, session);
    if (criadas.length > 0) {
      recebimentos = await dbListWithoutKeys<Lancamento>("receivables.json", HEAVY_KEYS);
    }
  }

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  let totalAberto = 0;
  let totalPago = 0;
  let vencemHoje = 0;

  for (const r of recebimentos) {
    const s = String(r.status || r.situacao || "").toLowerCase();
    const val = valorParcela(r);
    if (s.includes("pago") || s.includes("baixado") || s.includes("liquidado")) {
      totalPago += val;
    } else {
      totalAberto += val;
      const venc = r.vencimento || r.data_vencimento;
      if (venc) {
        const d = new Date(String(venc));
        if (d.toDateString() === hoje.toDateString()) vencemHoje++;
      }
    }
  }

  const totalDespesas = despesas.reduce((acc, d) => {
    const s = String(d.status || "").toLowerCase();
    if (!s.includes("pago") && !s.includes("baixado")) return acc + parseValor(d.valor);
    return acc;
  }, 0);

  const pendentes = recebimentos.filter((r) => {
    const s = String(r.status || r.situacao || "").toLowerCase();
    return !s.includes("pago") && !s.includes("baixado") && !s.includes("liquidado");
  });

  // Alunos inadimplentes (alunos unicos com parcelas em atraso)
  const alunosInadimplentes = new Set<string>();
  for (const r of recebimentos) {
    const s = String(r.status || r.situacao || "").toLowerCase();
    if (s.includes("pago") || s.includes("baixado") || s.includes("liquidado")) continue;
    const venc = r.vencimento || r.data_vencimento;
    if (!venc) continue;
    const d = new Date(String(venc));
    if (!isNaN(d.getTime()) && d < hoje) {
      const aluno = String(r.aluno || r.nome || "");
      if (aluno) alunosInadimplentes.add(aluno);
    }
  }

  // Parcelas vencendo nos proximos 7 dias
  const em7dias = new Date(hoje);
  em7dias.setDate(em7dias.getDate() + 7);
  let vencemEm7Dias = 0;
  for (const r of recebimentos) {
    const s = String(r.status || r.situacao || "").toLowerCase();
    if (s.includes("pago") || s.includes("baixado") || s.includes("liquidado")) continue;
    const venc = r.vencimento || r.data_vencimento;
    if (!venc) continue;
    const d = new Date(String(venc));
    d.setHours(0, 0, 0, 0);
    if (!isNaN(d.getTime()) && d > hoje && d <= em7dias) vencemEm7Dias++;
  }

  return (
    <AppShell breadcrumb="Financeiro" userName={session.pessoa || session.usuario} userRole={session.perfil}>
      <div className="page-header">
        <div className="page-title-block">
          <div className="page-eyebrow"><span className="page-eyebrow-dot" />Modulo Administrativo</div>
          <h1 className="page-title">Financeiro</h1>
          <p className="page-description">Recebimentos, despesas, cobrancas e baixas em um unico painel.</p>
        </div>
        <div className="page-actions">
          <ImportarBoletoPdfBtn alunos={alunos} />
          {isAdminOrCoordinator(session) && <SyncWhatsappBoletosButton />}
          <FinanceiroExportButton recebimentos={recebimentos} despesas={despesas} />
          <NovoLancamentoBtn alunos={alunos} />
        </div>
      </div>

      <FinanceiroCommandCenter recebimentos={recebimentos} despesas={despesas} alunos={alunos} professores={professores} />

      <div className="metric-grid metric-grid-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <div className="metric-card metric-card-gold">
          <div className="metric-icon metric-icon-gold">
            <svg viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" /><path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" /></svg>
          </div>
          <div className="metric-label">A receber</div>
          <div className="metric-value" style={{ fontSize: "1.5rem" }}>{formatBRL(totalAberto)}</div>
          <div className="metric-note">{pendentes.length} lancamentos em aberto</div>
        </div>
        <div className="metric-card metric-card-green">
          <div className="metric-icon metric-icon-green">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
          </div>
          <div className="metric-label">Recebido</div>
          <div className="metric-value" style={{ fontSize: "1.5rem" }}>{formatBRL(totalPago)}</div>
          <div className="metric-note">Baixas confirmadas</div>
        </div>
        <div className="metric-card metric-card-red">
          <div className="metric-icon metric-icon-red">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
          </div>
          <div className="metric-label">Despesas abertas</div>
          <div className="metric-value" style={{ fontSize: "1.5rem" }}>{formatBRL(totalDespesas)}</div>
          <div className="metric-note">{despesas.length} lancamentos</div>
        </div>
        <div className="metric-card metric-card-blue">
          <div className="metric-icon metric-icon-blue">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg>
          </div>
          <div className="metric-label">Vencem hoje</div>
          <div className="metric-value">{vencemHoje}</div>
          <div className="metric-note">Requerem acao imediata</div>
        </div>
        <div className="metric-card metric-card-red">
          <div className="metric-icon metric-icon-red">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
          </div>
          <div className="metric-label">Alunos inadimplentes</div>
          <div className="metric-value">{alunosInadimplentes.size}</div>
          <div className="metric-note">Com parcelas em atraso</div>
        </div>
        <div className="metric-card metric-card-gold">
          <div className="metric-icon metric-icon-gold">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>
          </div>
          <div className="metric-label">Vencem em 7 dias</div>
          <div className="metric-value">{vencemEm7Dias}</div>
          <div className="metric-note">Parcelas proximas do vencimento</div>
        </div>
      </div>

      <FinanceiroTable recebimentos={recebimentos} despesas={despesas} canSeeProfessorReports={isAdminOrCoordinator(session)} canReversePayments={isAdmin(session)} professores={professores} fornecedores={fornecedores} fechamentos={fechamentos} />
    </AppShell>
  );
}
