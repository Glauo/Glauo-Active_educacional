import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isAdminOrCoordinator } from "@/lib/roles";
import { ensureAutomaticBackup } from "@/lib/auto-backup";

function text(value: unknown) {
  return String(value || "").trim();
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

export async function GET(req: NextRequest) {
  if (!canRunBySecret(req) && !(await canRunBySession())) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const result = await ensureAutomaticBackup("endpoint");
  return NextResponse.json(result);
}
