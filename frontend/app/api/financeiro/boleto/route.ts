import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { dbGet, dbList, dbSet } from "@/lib/db";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return String(value || "").trim();
}

function money(value: unknown) {
  const n = parseFloat(String(value || "0").replace(/[^\d.,-]/g, "").replace(",", "."));
  return (Number.isFinite(n) ? n : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function moneyNumber(value: unknown) {
  const n = parseFloat(String(value || "0").replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Number(n.toFixed(2)) : 0;
}

function digits(value: unknown) {
  return text(value).replace(/\D/g, "");
}

function firstName(fullName: string) {
  return fullName.split(/\s+/).filter(Boolean)[0] || "Aluno";
}

function lastName(fullName: string) {
  const parts = fullName.split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(" ") : "Active";
}

function firstPresent(...values: unknown[]) {
  return values.map(text).find(Boolean) || "";
}

function boletoToken(config: Row | null) {
  return text(
    process.env.ACTIVE_MERCADO_PAGO_ACCESS_TOKEN ||
    process.env.MERCADO_PAGO_ACCESS_TOKEN ||
    config?.mercado_pago_access_token ||
    config?.MERCADO_PAGO_ACCESS_TOKEN ||
    config?.access_token ||
    config?.api_key
  );
}

function payerEmail(lancamento: Row, aluno: Row | null, config: Row | null) {
  return text(
    lancamento.email ||
    lancamento.aluno_email ||
    lancamento.responsavel_email ||
    lancamento.email_responsavel ||
    aluno?.responsavel_email ||
    aluno?.email_responsavel ||
    aluno?.emailResponsavel ||
    aluno?.aluno_email ||
    aluno?.email ||
    config?.payer_email ||
    process.env.ACTIVE_MERCADO_PAGO_PAYER_EMAIL ||
    process.env.MERCADO_PAGO_PAYER_EMAIL
  );
}

function splitAddress(value: unknown) {
  const parts = text(value).split(",").map((item) => item.trim()).filter(Boolean);
  return {
    street_name: parts[0] || "",
    street_number: parts[1] || "",
    neighborhood: parts[2] || "",
    city: parts[3] || "",
  };
}

function payerAddress(lancamento: Row, aluno: Row | null, sistema: Row | null) {
  const parsedLancamento = splitAddress(lancamento.endereco || lancamento.address);
  const parsedAluno = splitAddress(aluno?.endereco || aluno?.address);
  const parsedSistema = splitAddress(sistema?.endereco || sistema?.address);
  return {
    zip_code: digits(firstPresent(lancamento.cep, lancamento.zip_code, aluno?.cep, aluno?.zip_code, sistema?.cep, sistema?.zip_code)),
    street_name: firstPresent(lancamento.rua, lancamento.street_name, parsedLancamento.street_name, aluno?.rua, aluno?.street_name, parsedAluno.street_name, sistema?.rua, sistema?.street_name, parsedSistema.street_name, "Rua nao informada"),
    street_number: firstPresent(lancamento.numero, lancamento.number, lancamento.street_number, parsedLancamento.street_number, aluno?.numero, aluno?.number, aluno?.street_number, parsedAluno.street_number, sistema?.numero, sistema?.street_number, parsedSistema.street_number, "S/N"),
    neighborhood: firstPresent(lancamento.bairro, lancamento.neighborhood, parsedLancamento.neighborhood, aluno?.bairro, aluno?.neighborhood, parsedAluno.neighborhood, sistema?.bairro, sistema?.neighborhood, parsedSistema.neighborhood, "Centro"),
    city: firstPresent(lancamento.cidade, lancamento.city, parsedLancamento.city, aluno?.cidade, aluno?.city, parsedAluno.city, sistema?.cidade, sistema?.city, "Sao Paulo"),
    federal_unit: firstPresent(lancamento.estado, lancamento.uf, lancamento.federal_unit, aluno?.estado, aluno?.uf, aluno?.federal_unit, sistema?.estado, sistema?.uf, sistema?.federal_unit, "SP").slice(0, 2).toUpperCase(),
  };
}

function findStudent(students: Row[], lancamento: Row) {
  const id = text(lancamento.aluno_id);
  const login = text(lancamento.aluno_login || lancamento.login);
  const nome = text(lancamento.aluno || lancamento.nome);
  return students.find((student) =>
    (id && text(student.id || student._id || student.uuid || student.codigo) === id) ||
    (login && text(student.login || student.usuario) === login) ||
    (nome && text(student.nome || student.name) === nome)
  ) || null;
}

function expirationDate(value: unknown) {
  const parsed = new Date(text(value));
  let date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  // Se a data for no passado, usar 3 dias a partir de hoje
  if (date < now) {
    date = new Date();
    date.setDate(date.getDate() + 3);
  }
  
  // Garantir que não ultrapassa 29 dias a partir de hoje (limite do Mercado Pago)
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 29);
  if (date > maxDate) {
    date = new Date(maxDate);
  }
  
  date.setHours(23, 59, 0, 0);
  return date.toISOString();
}

function errorHtml(title: string, message: string, detail?: string) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
    body{font-family:Arial,sans-serif;background:#f8fafc;color:#172033;margin:0;padding:40px}.box{max-width:760px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;box-shadow:0 18px 45px rgba(15,23,42,.08)}
    h1{font-size:22px;margin:0 0 10px}.muted{color:#64748b;line-height:1.55}.detail{margin-top:16px;padding:12px;border-radius:8px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412}
  </style></head><body><div class="box"><h1>${title}</h1><p class="muted">${message}</p>${detail ? `<div class="detail">${detail}</div>` : ""}</div></body></html>`;
  return new NextResponse(html, { status: 422, headers: { "content-type": "text/html; charset=utf-8" } });
}

async function createMercadoPagoBoleto(lancamento: Row, id: string, origin: string) {
  const [config, sistema, students] = await Promise.all([
    dbGet<Row>("boleto_config.json"),
    dbGet<Row>("sistema_config.json"),
    dbList<Row>("students.json"),
  ]);
  const aluno = findStudent(students, lancamento);
  const token = boletoToken(config);
  if (!token) {
    return {
      ok: false as const,
      response: errorHtml(
        "Mercado Pago nao configurado",
        "Para gerar boleto real, configure ACTIVE_MERCADO_PAGO_ACCESS_TOKEN ou MERCADO_PAGO_ACCESS_TOKEN no ambiente do Node.js, ou informe o Access Token nas configuracoes de boleto.",
      ),
    };
  }

  const amount = moneyNumber(lancamento.valor_parcela ?? lancamento.valor);
  if (!amount) {
    return { ok: false as const, response: errorHtml("Valor invalido", "Este lancamento nao tem valor valido para gerar boleto.") };
  }

  const email = payerEmail(lancamento, aluno, config);
  if (!email) {
    return { ok: false as const, response: errorHtml("E-mail do aluno obrigatorio", "O Mercado Pago exige e-mail do pagador. Preencha o e-mail no cadastro do aluno ou no lancamento financeiro.") };
  }

  const nome = text(lancamento.aluno || lancamento.nome || lancamento.pagador || "Aluno Active");
  const cpf = digits(lancamento.cpf || lancamento.aluno_cpf || lancamento.responsavel_cpf || aluno?.cpf || aluno?.responsavel_cpf);
  const address = payerAddress(lancamento, aluno, sistema);
  if (!address.zip_code) {
    return { ok: false as const, response: errorHtml("CEP obrigatorio para boleto", "O Mercado Pago exige CEP do pagador para gerar boleto. Preencha o CEP no cadastro do aluno ou nas configuracoes da escola.") };
  }
  const payload: Record<string, unknown> = {
    transaction_amount: amount,
    description: text(lancamento.descricao) || "Mensalidade escolar",
    payment_method_id: "bolbradesco",
    date_of_expiration: expirationDate(lancamento.vencimento || lancamento.data_vencimento),
    external_reference: id,
    binary_mode: true,
    statement_descriptor: "ACTIVE EDUCACIONAL",
    payer: {
      email,
      first_name: firstName(nome),
      last_name: lastName(nome),
      ...(cpf.length === 11 ? { identification: { type: "CPF", number: cpf } } : {}),
      address,
    },
    additional_info: {
      items: [{
        id,
        title: text(lancamento.descricao) || "Mensalidade escolar",
        description: text(lancamento.observacoes) || text(lancamento.categoria) || "Servico educacional",
        quantity: 1,
        unit_price: amount,
        category_id: "services",
      }],
      payer: {
        first_name: firstName(nome),
        last_name: lastName(nome),
      },
    },
    metadata: {
      sistema: "active_educacional",
      lancamento_id: id,
      aluno: nome,
      aluno_id: text(lancamento.aluno_id || aluno?.id),
      aluno_login: text(lancamento.aluno_login || aluno?.login || aluno?.usuario),
    },
  };

  const notificationUrl = text(process.env.ACTIVE_MERCADO_PAGO_WEBHOOK_URL || config?.webhook_url) || `${origin}/api/financeiro/mercado-pago/webhook`;
  if (notificationUrl) payload.notification_url = notificationUrl;

  const res = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Idempotency-Key": `active-boleto-${id}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({})) as Row;
  if (!res.ok) {
    const detail = text(data.message || data.error || JSON.stringify(data).slice(0, 220));
    return {
      ok: false as const,
      response: errorHtml("Falha ao gerar boleto Mercado Pago", "O Mercado Pago recusou a geracao do boleto. Revise token, e-mail, CPF e valor do lancamento.", detail),
    };
  }

  const details = (data.transaction_details || {}) as Row;
  const point = (data.point_of_interaction || {}) as Row;
  const transactionData = (point.transaction_data || {}) as Row;
  const barcode = (data.barcode || {}) as Row;
  const boletoUrl = text(details.external_resource_url || data.external_resource_url || transactionData.ticket_url);
  const linha = text(details.digitable_line || barcode.content);
  if (!boletoUrl) {
    return {
      ok: false as const,
      response: errorHtml("Boleto gerado sem link", "O Mercado Pago retornou pagamento, mas nao enviou o link do boleto. Verifique a conta Mercado Pago.", text(data.id)),
    };
  }

  const recebimentos = await dbList<Row>("receivables.json");
  await dbSet("receivables.json", recebimentos.map((item) => text(item.id) === id ? {
    ...item,
    mercado_pago_payment_id: text(data.id),
    mercado_pago_status: text(data.status),
    mercado_pago_detail: text(data.status_detail),
    mercado_pago_ticket_url: boletoUrl,
    boleto_pdf_url: boletoUrl,
    boleto_linha_digitavel: linha,
    boleto_status: "Mercado Pago",
    boleto_codigo: text(data.id) || text(item.boleto_codigo),
    boleto_gerado_em: new Date().toISOString(),
    status: text(item.status) || "Boleto gerado",
  } : item));

  return { ok: true as const, url: boletoUrl };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });

  const recebimentos = await dbList<Row>("receivables.json");
  const lancamento = recebimentos.find((r) => text(r.id) === id);
  if (!lancamento) return NextResponse.json({ error: "Boleto nao encontrado" }, { status: 404 });
  if (session.perfil === "Aluno" && text(lancamento.aluno || lancamento.nome) !== session.pessoa) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 403 });
  }

  const existingMercadoPagoUrl = text(lancamento.mercado_pago_ticket_url || lancamento.boleto_pdf_url);
  if (existingMercadoPagoUrl.startsWith("http")) return NextResponse.redirect(existingMercadoPagoUrl);

  const generated = await createMercadoPagoBoleto(lancamento, id, new URL(req.url).origin);
  if (generated.ok) return NextResponse.redirect(generated.url);

  const codigo = text(lancamento.boleto_codigo) || `AE-${id.slice(0, 8).toUpperCase()}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Boleto ${codigo}</title><style>
    body{font-family:Arial,sans-serif;margin:40px;color:#172033} .box{border:2px solid #172033;padding:24px;border-radius:10px;max-width:760px;margin:auto}
    h1{margin:0 0 8px;font-size:24px}.muted{color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.08em}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:24px}.value{font-weight:700;font-size:18px}.bar{font-family:monospace;font-size:22px;letter-spacing:3px;border:1px dashed #64748b;padding:18px;text-align:center;margin-top:24px}
    @media print{button{display:none}}
  </style></head><body><div class="box">
    <div class="muted">Ativo Educacional - Boleto / Fatura</div><h1>${text(lancamento.descricao) || "Mensalidade escolar"}</h1>
    <div class="grid"><div><div class="muted">Aluno</div><div class="value">${text(lancamento.aluno || lancamento.nome)}</div></div>
    <div><div class="muted">Vencimento</div><div class="value">${text(lancamento.vencimento || lancamento.data_vencimento)}</div></div>
    <div><div class="muted">Valor</div><div class="value">${money(lancamento.valor)}</div></div>
    <div><div class="muted">Codigo</div><div class="value">${codigo}</div></div></div>
    <div class="bar">${codigo.replace(/-/g, " ")} ${String(lancamento.valor || "0").replace(/\D/g, "").padStart(8, "0")}</div>
    <p>Documento gerado pelo sistema Ativo Educacional. Use a opcao imprimir do navegador para salvar em PDF.</p>
    <button onclick="window.print()">Gerar PDF</button>
  </div></body></html>`;

  return generated.response || new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
