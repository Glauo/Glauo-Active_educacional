import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dbList, dbSet } from "@/lib/db";
import { isAdminOrCoordinator } from "@/lib/roles";
import { ensureAutomaticBackup } from "@/lib/auto-backup";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return String(value || "").trim();
}

function norm(value: unknown) {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function money(value: unknown) {
  const raw = text(value).replace(/[^\d,.-]/g, "");
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

function isPaid(row: Row) {
  const status = norm(row.status || row.situacao);
  return status.includes("pago") || status.includes("baixado") || status.includes("liquidado");
}

function hasMercadoPago(row: Row) {
  return [
    row.mercado_pago_payment_id,
    row.mp_payment_id,
    row.pix_codigo,
    row.pix_qr_code,
    row.pix_ticket_url,
    row.boleto_codigo,
    row.mercado_pago_ticket_url,
  ].some((value) => text(value));
}

function duplicateKey(row: Row) {
  return [
    norm(row.aluno || row.nome),
    norm(row.descricao || row.categoria || row.tipo_lancamento_detalhe || "mensalidade"),
    text(row.vencimento || row.data_vencimento),
    money(row.valor_parcela ?? row.valor),
  ].join("|");
}

function canRunBySecret(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return text(new URL(req.url).searchParams.get("secret")) === secret;
}

async function canRunBySession() {
  const session = await getSession();
  return Boolean(session && isAdminOrCoordinator(session));
}

function findDuplicates(receivables: Row[]) {
  const groups = new Map<string, { key: string; items: { index: number; row: Row }[] }>();
  receivables.forEach((row, index) => {
    const key = duplicateKey(row);
    const current = groups.get(key) || { key, items: [] };
    current.items.push({ index, row });
    groups.set(key, current);
  });

  const safeIndexes = new Set<number>();
  const preserved: Row[] = [];
  for (const group of groups.values()) {
    if (group.items.length <= 1) continue;
    const blocked = group.items.some(({ row }) => isPaid(row) || hasMercadoPago(row));
    if (blocked) {
      preserved.push({
        key: group.key,
        total: group.items.length,
        motivo: "pago_ou_mercado_pago",
      });
      continue;
    }
    for (const item of group.items.slice(1)) safeIndexes.add(item.index);
  }
  return { safeIndexes, preserved };
}

export async function POST(req: NextRequest) {
  if (!canRunBySecret(req) && !(await canRunBySession())) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const dryRun = new URL(req.url).searchParams.get("dry_run") === "true";
  const receivables = await dbList<Row>("receivables.json");
  const { safeIndexes, preserved } = findDuplicates(receivables);
  const removed = receivables.filter((_, index) => safeIndexes.has(index));

  if (!dryRun && removed.length > 0) {
    await ensureAutomaticBackup("financeiro_dedupe");
    const next = receivables.filter((_, index) => !safeIndexes.has(index));
    await dbSet("receivables.json", next);
    const audit = await dbList<Row>("finance_audit.json");
    await dbSet("finance_audit.json", [
      {
        id: crypto.randomUUID(),
        data: new Date().toISOString(),
        acao: "dedupe_recebimentos",
        removidos: removed.length,
        preservados: preserved,
        criterio: "aluno_descricao_vencimento_valor_sem_pago_sem_mp",
      },
      ...audit,
    ].slice(0, 500));
  }

  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    total: receivables.length,
    removiveis: removed.length,
    preservados: preserved.length,
    depois: dryRun ? receivables.length : receivables.length - removed.length,
    removidos: removed.map((row) => ({
      aluno: text(row.aluno || row.nome),
      descricao: text(row.descricao || row.categoria),
      vencimento: text(row.vencimento || row.data_vencimento),
      valor: text(row.valor_parcela ?? row.valor),
    })),
  });
}
