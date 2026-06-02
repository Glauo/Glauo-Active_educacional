import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getSession } from "@/lib/auth";
import { dbList, dbSet } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { financeMessage } from "@/lib/finance-message";

function text(value: unknown) {
  return String(value || "").trim();
}

function safeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function runNotification(task: Promise<unknown>, label: string) {
  void task.catch((err) => {
    console.error(`[boleto-upload notificacao ${label}]`, err);
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });

  try {
    const form = await req.formData();
    const file = form.get("arquivo_pdf");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Selecione um boleto em PDF." }, { status: 400 });
    }
    if (file.type && file.type !== "application/pdf") {
      return NextResponse.json({ error: "Envie apenas arquivo PDF." }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadsDir = path.join(process.cwd(), "public", "uploads", "boletos");
    const base = safeFileName(file.name || `${id}.pdf`) || `${id}.pdf`;
    const filename = `${Date.now()}-${base.endsWith(".pdf") ? base : `${base}.pdf`}`;
    let publicUrl = "";
    try {
      await mkdir(uploadsDir, { recursive: true });
      await writeFile(path.join(uploadsDir, filename), buffer);
      publicUrl = `/uploads/boletos/${filename}`;
    } catch (err) {
      console.warn("[boleto-upload] arquivo publico nao persistiu; usando base64 no lancamento", err);
    }

    const boletoUrl = `/api/financeiro/boleto-pdf?id=${encodeURIComponent(id)}`;
    const vencimento = text(form.get("vencimento"));
    const novo = {
      id,
      aluno_id: text(form.get("aluno_id")),
      aluno: text(form.get("aluno")),
      aluno_login: text(form.get("aluno_login")),
      telefone: text(form.get("aluno_telefone")),
      whatsapp: text(form.get("aluno_telefone")),
      email: text(form.get("aluno_email")),
      descricao: text(form.get("descricao")) || `Boleto importado - ${file.name}`,
      valor: text(form.get("valor")),
      valor_parcela: text(form.get("valor")),
      valor_total: text(form.get("valor")),
      vencimento,
      data_vencimento: vencimento,
      data_lancamento: new Date().toISOString().slice(0, 10),
      status: text(form.get("status")) || "Boleto importado",
      tipo_lancamento_detalhe: text(form.get("categoria")) || "Boleto externo",
      categoria: text(form.get("categoria")) || "Boleto externo",
      parcela: "1",
      parcela_numero: 1,
      parcela_total: 1,
      boleto_status: "Importado",
      boleto_pdf_url: boletoUrl,
      boleto_pdf_public_url: publicUrl,
      boleto_pdf_b64: buffer.toString("base64"),
      boleto_pdf_mime: "application/pdf",
      boleto_pdf_nome: file.name || filename,
      boleto_importado_em: new Date().toISOString(),
      notification_status: {
        email: text(form.get("enviar_email")) === "true" ? "link_gerado" : "nao_enviado",
        whatsapp: text(form.get("enviar_whatsapp")) === "true" ? "link_gerado" : "nao_enviado",
      },
      created_at: new Date().toISOString(),
      created_by: session.pessoa || session.usuario,
      observacoes: text(form.get("observacoes")),
    };

    const recebimentos = await dbList<Record<string, unknown>>("receivables.json");
    await dbSet("receivables.json", [...recebimentos, novo]);

    const origin = new URL(req.url).origin;
    if (text(form.get("enviar_email")) === "true") {
      runNotification((async () => {
        const message = financeMessage(novo, origin);
        const result = await sendEmail(novo.email, message.subject, message.body, session);
        const atualizados = await dbList<Record<string, unknown>>("receivables.json");
        const current = atualizados.find((item) => item.id === id) || novo;
        await dbSet("receivables.json", atualizados.map((item) => item.id === id ? {
          ...item,
          notification_status: { ...(current.notification_status as Record<string, unknown> | undefined), email: result.ok ? "enviado_smtp" : result.status },
        } : item));
      })(), "email");
    }

    const log = await dbList<Record<string, unknown>>("finance_audit.json");
    await dbSet("finance_audit.json", [
      ...log,
      {
        id: crypto.randomUUID(),
        data: new Date().toISOString(),
        acao: "importar_boleto_pdf",
        tipo: "recebimentos",
        lancamento_id: id,
        usuario: session.pessoa || session.usuario,
        perfil: session.perfil,
        depois: novo,
      },
    ]);

    return NextResponse.json({ ok: true, lancamento: novo }, { status: 201 });
  } catch (err) {
    console.error("[boleto-upload POST]", err);
    return NextResponse.json({ error: "Erro ao importar boleto PDF." }, { status: 500 });
  }
}
