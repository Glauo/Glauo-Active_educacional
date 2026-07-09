import { NextRequest, NextResponse } from "next/server";
import { dbGet, dbSet } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isEmailConfigurationValid } from "@/lib/email";

const KEYS = ["sistema_config.json", "smtp_config.json", "boleto_config.json"] as const;

function text(value: unknown) {
  return String(value || "").trim();
}

export async function GET() {
  const session = await getSession();
  if (!session || session.perfil === "Aluno") {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }
  const [sistema, smtp, boleto] = await Promise.all(KEYS.map((k) => dbGet(k)));
  return NextResponse.json({ sistema: sistema || {}, smtp: smtp || {}, boleto: boleto || {} });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || session.perfil === "Aluno") {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const body = await req.json() as { secao: string; dados: Record<string, unknown> };
  const keyMap: Record<string, string> = {
    sistema: "sistema_config.json",
    smtp: "smtp_config.json",
    boleto: "boleto_config.json",
  };
  const key = keyMap[body.secao];
  if (!key) {
    return NextResponse.json({ error: "Secao invalida." }, { status: 400 });
  }

  const atual = await dbGet<Record<string, unknown>>(key) || {};
  const merged = { ...atual, ...body.dados };

  if (body.secao === "smtp") {
    const sistema = await dbGet<Record<string, unknown>>("sistema_config.json") || {};
    const enabled = text(merged.enabled ?? "true").toLowerCase();
    const wantsEnabled = enabled !== "false" && enabled !== "0" && enabled !== "inativo";
    if (wantsEnabled && !isEmailConfigurationValid(merged, sistema)) {
      return NextResponse.json({
        error: "SMTP invalido. Informe host, usuario com e-mail valido, senha e e-mail remetente valido.",
      }, { status: 400 });
    }
  }

  await dbSet(key, merged);
  return NextResponse.json({ ok: true });
}
