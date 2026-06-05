import { AppShell } from "@/components/app-shell";
import { dbListWithoutKeys } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { NovoAlunoBtn } from "@/components/aluno-modal";
import { AlunosSearchTable } from "@/components/alunos-search-table";
import { isAdmin, isAdminOrCoordinator } from "@/lib/roles";
import { reconcileMercadoPagoPendingReceivables } from "@/lib/mercadopago-sync";

type Aluno = { id?: string; nome?: string; name?: string; login?: string; cpf?: string; turma?: string; classe?: string; livro?: string; book?: string; status?: string; situacao?: string; status_financeiro?: string; situacao_financeira?: string; responsavel?: string; [k: string]: unknown };
type Recebimento = { id?: string; aluno?: string; nome?: string; aluno_id?: string; aluno_login?: string; descricao?: string; valor?: string | number; vencimento?: string; data_vencimento?: string; data_baixa?: string; status?: string; situacao?: string; boleto_pdf_url?: string; boleto_status?: string; categoria?: string; [k: string]: unknown };

const HEAVY_KEYS = [
  "boleto_pdf_b64",
  "file_b64",
  "pdf_b64",
  "base64",
  "arquivo_b64",
  "foto_b64",
  "imagem_b64",
  "documento_b64",
  "anexo_b64",
];

function text(value: unknown) {
  return String(value || "").trim();
}

function normalize(value: unknown) {
  return text(value).toLowerCase();
}

function isPaid(value: unknown) {
  const status = normalize(value);
  return status.includes("pago") || status.includes("baixado") || status.includes("liquidado");
}

function dateValue(value: unknown) {
  const raw = text(value);
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1])).getTime();
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? Number.MAX_SAFE_INTEGER : date.getTime();
}

function faturaKeys(aluno: Aluno) {
  return [
    `id:${normalize(aluno.id)}`,
    `cpf:${normalize(aluno.cpf)}`,
    `nome:${normalize(aluno.nome || aluno.name)}`,
    `login:${normalize(aluno.login)}`,
  ].filter((key) => !key.endsWith(":"));
}

function slimRecebimentos(alunos: Aluno[], recebimentos: Recebimento[]) {
  const alunoKeys = new Set(alunos.flatMap(faturaKeys));
  const byKey = new Map<string, Recebimento[]>();

  for (const item of recebimentos) {
    const keys = [
      `id:${normalize(item.aluno_id)}`,
      `nome:${normalize(item.aluno || item.nome)}`,
      `login:${normalize(item.aluno_login)}`,
    ].filter((key) => alunoKeys.has(key));

    const slim: Recebimento = {
      id: item.id,
      aluno_id: text(item.aluno_id),
      aluno: item.aluno,
      nome: item.nome,
      aluno_login: text(item.aluno_login),
      descricao: item.descricao,
      valor: text(item.valor_parcela ?? item.valor),
      vencimento: item.vencimento || item.data_vencimento,
      data_vencimento: item.data_vencimento || item.vencimento,
      data_baixa: item.data_baixa,
      status: item.status,
      situacao: item.situacao,
      boleto_pdf_url: item.boleto_pdf_url,
      boleto_status: item.boleto_status,
      categoria: item.categoria,
    };

    for (const key of keys) {
      byKey.set(key, [...(byKey.get(key) || []), slim]);
    }
  }

  const result = new Map<string, Recebimento>();
  for (const list of byKey.values()) {
    const sorted = [...list].sort((a, b) => {
      const paidDiff = Number(isPaid(a.status || a.situacao)) - Number(isPaid(b.status || b.situacao));
      if (paidDiff !== 0) return paidDiff;
      return dateValue(a.vencimento || a.data_vencimento) - dateValue(b.vencimento || b.data_vencimento);
    });
    const abertas = sorted.filter((item) => !isPaid(item.status || item.situacao));
    const recentes = sorted.filter((item) => isPaid(item.status || item.situacao)).slice(0, 6);
    for (const item of [...abertas, ...recentes].slice(0, 20)) {
      result.set(text(item.id) || `${text(item.aluno || item.nome)}-${text(item.descricao)}-${text(item.vencimento)}-${text(item.valor)}`, item);
    }
  }

  return Array.from(result.values());
}

export default async function AlunosPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (isAdminOrCoordinator(session)) {
    await reconcileMercadoPagoPendingReceivables(8);
  }

  const [alunos, recebimentos, todasFrequencias] = await Promise.all([
    dbListWithoutKeys<Aluno>("students.json", HEAVY_KEYS),
    dbListWithoutKeys<Recebimento>("receivables.json", HEAVY_KEYS),
    dbListWithoutKeys<Record<string, unknown>>("attendance.json", HEAVY_KEYS),
  ]);
  const recebimentosLeves = slimRecebimentos(alunos, recebimentos);
  const frequencias = todasFrequencias.map((f) => ({
    id: f.id as string | undefined,
    aluno: f.aluno as string | undefined,
    aluno_id: f.aluno_id as string | undefined,
    turma: f.turma as string | undefined,
    presente: f.presente as boolean | undefined,
    falta: f.falta as boolean | undefined,
    data: f.data as string | undefined,
    materia: f.materia as string | undefined,
    licao_inicio: f.licao_inicio as string | undefined,
    licao_fim: f.licao_fim as string | undefined,
  }));

  const ativos = alunos.filter((a) => {
    const s = String(a.status || a.situacao || "ativo").toLowerCase();
    return !s.includes("inativ") && !s.includes("cancel");
  });

  const inadimplentes = alunos.filter((a) => {
    const f = String(a.status_financeiro || a.situacao_financeira || "").toLowerCase();
    return f.includes("atraso") || f.includes("vencido") || f.includes("inadim");
  });

  return (
    <AppShell breadcrumb="Alunos" userName={session.pessoa || session.usuario} userRole={session.perfil}>
      <div className="page-header">
        <div className="page-title-block">
          <div className="page-eyebrow"><span className="page-eyebrow-dot" />Módulo Acadêmico</div>
          <h1 className="page-title">Alunos</h1>
          <p className="page-description">Gestão completa de alunos — cadastro, acompanhamento pedagógico e financeiro.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            Exportar
          </button>
          <a href="/alunos/credenciais" className="btn btn-secondary">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
            Gerenciar Acessos
          </a>
          {isAdminOrCoordinator(session) && <NovoAlunoBtn />}
        </div>
      </div>

      <div className="metric-grid metric-grid-3">
        <div className="metric-card metric-card-blue">
          <div className="metric-icon metric-icon-blue">
            <svg viewBox="0 0 20 20" fill="currentColor"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" /></svg>
          </div>
          <div className="metric-label">Total de alunos</div>
          <div className="metric-value">{alunos.length}</div>
          <div className="metric-note">{ativos.length} ativos no momento</div>
        </div>
        <div className="metric-card metric-card-green">
          <div className="metric-icon metric-icon-green">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
          </div>
          <div className="metric-label">Situação regular</div>
          <div className="metric-value">{Math.max(0, ativos.length - inadimplentes.length)}</div>
          <div className="metric-note">Financeiro em dia</div>
        </div>
        <div className="metric-card metric-card-red">
          <div className="metric-icon metric-icon-red">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
          </div>
          <div className="metric-label">Inadimplentes</div>
          <div className="metric-value">{inadimplentes.length}</div>
          <div className="metric-note">Requerem atenção financeira</div>
        </div>
      </div>

      {alunos.length === 0 ? (
        <div className="card">
          <div className="card-body">
            <div className="empty-state">
              <div className="empty-icon"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" /></svg></div>
              <div className="empty-title">Nenhum aluno cadastrado</div>
              <p className="empty-desc">Os dados dos alunos são carregados automaticamente do banco PostgreSQL.</p>
            </div>
          </div>
        </div>
      ) : (
        <AlunosSearchTable alunos={alunos} recebimentos={recebimentosLeves} frequencias={frequencias} canManageAccess={isAdminOrCoordinator(session)} canReversePayments={isAdmin(session)} />
      )}
    </AppShell>
  );
}
