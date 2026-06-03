import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { dbGet, dbList, dbSet } from "@/lib/db";

type Row = Record<string, unknown>;

const AUTO_BACKUP_KEYS = [
  "students.json",
  "classes.json",
  "teachers.json",
  "users.json",
  "receivables.json",
  "payables.json",
  "professor_fechamentos.json",
  "fornecedores.json",
  "finance_audit.json",
  "agenda.json",
  "messages.json",
  "activities.json",
  "activity_submissions.json",
  "homework_submissions.json",
  "grades.json",
  "challenges.json",
  "challenge_completions.json",
  "certificates.json",
  "books.json",
  "videos.json",
  "materials.json",
  "library_files.json",
  "fee_templates.json",
  "inventory.json",
  "inventory_moves.json",
  "material_orders.json",
  "stock.json",
  "sales_leads.json",
  "sales_agenda.json",
  "sales_payments.json",
  "class_sessions.json",
  "sistema_config.json",
  "smtp_config.json",
  "boleto_config.json",
  "meta.json",
  "wiz_action_audit.json",
  "wiz_reference_docs.json",
  "email_log.json",
  "chatbot_active_log.json",
  "backup_audit.json",
];

const RETENTION = 30;

function backupDir() {
  return path.join(process.cwd(), "data", "backups", "automaticos");
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function timestamp() {
  return new Date().toISOString().replace(/\D/g, "").slice(0, 14);
}

async function pruneBackups(dir: string) {
  const files = (await readdir(dir).catch(() => []))
    .filter((file) => file.startsWith("active_auto_backup_") && file.endsWith(".json"))
    .sort()
    .reverse();
  for (const file of files.slice(RETENTION)) {
    await unlink(path.join(dir, file)).catch(() => undefined);
  }
}

export async function ensureAutomaticBackup(reason = "auto") {
  const audit = await dbList<Row>("backup_audit.json");
  const today = todayKey();
  const existing = audit.find((item) =>
    String(item.tipo || "") === "automatico" &&
    String(item.created_at || "").startsWith(today)
  );
  if (existing) {
    return { ok: true, created: false, file: String(existing.arquivo || ""), audit: existing };
  }

  const data: Row = {};
  for (const key of AUTO_BACKUP_KEYS) {
    const value = await dbGet(key);
    if (value !== null && value !== undefined) data[key] = value as unknown;
  }

  const dir = backupDir();
  await mkdir(dir, { recursive: true });
  const file = `active_auto_backup_${timestamp()}.json`;
  const fullPath = path.join(dir, file);
  const payload = {
    version: "active-educacional-auto-backup-v1",
    generated_at: new Date().toISOString(),
    reason,
    retention_days: RETENTION,
    data,
  };
  await writeFile(fullPath, JSON.stringify(payload, null, 2), "utf-8");
  await pruneBackups(dir);

  const entry = {
    id: `auto_backup_${Date.now()}`,
    tipo: "automatico",
    arquivo: fullPath,
    motivo: reason,
    total_chaves: Object.keys(data).length,
    created_at: new Date().toISOString(),
  };
  await dbSet("backup_audit.json", [entry, ...audit].slice(0, 300));
  return { ok: true, created: true, file: fullPath, audit: entry };
}
