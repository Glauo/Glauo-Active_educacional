import { dbGet, dbList, dbSet } from "@/lib/db";
import { criarPagamentoBoleto, resolveIdentification } from "@/lib/criar-pagamento-boleto";

type Row = Record<string, unknown>;

export type MercadoPagoBoletoResult =
  | { ok: true; url: string; linha: string; paymentId: string }
  | { ok: false; title: string; message: string; detail?: string };

function text(value: unknown) {
  return String(value || "").trim();
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

export function expirationDate(value: unknown) {
  const parsed = new Date(text(value));
  let date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (date < now) {
    date = new Date();
    date.setDate(date.getDate() + 3);
  }

  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 29);
  if (date > maxDate) {
    date = new Date(maxDate);
  }

  date.setHours(23, 59, 0, 0);
  return date.toISOString();
}

function formatMercadoPagoErrorDetail(details: unknown) {
  if (!details || typeof details !== "object") return text(details);
  const row = details as Record<string, unknown>;
  const cause = Array.isArray(row.cause) ? row.cause : [];
  const firstCause = cause[0] && typeof cause[0] === "object" ? cause[0] as Record<string, unknown> : null;
  return text(firstCause?.description || row.message || row.error || JSON.stringify(details).slice(0, 220));
}

export async function createMercadoPagoBoleto(
  lancamento: Row,
  id: string,
  origin: string
): Promise<MercadoPagoBoletoResult> {
  const [config, sistema, students] = await Promise.all([
    dbGet<Row>("boleto_config.json"),
    dbGet<Row>("sistema_config.json"),
    dbList<Row>("students.json"),
  ]);
  const aluno = findStudent(students, lancamento);
  const token = boletoToken(config);
  if (!token) {
    return {
      ok: false,
      title: "Mercado Pago nao configurado",
      message: "Configure ACTIVE_MERCADO_PAGO_ACCESS_TOKEN ou MERCADO_PAGO_ACCESS_TOKEN no ambiente do Node.js, ou informe o Access Token nas configuracoes de boleto.",
    };
  }

  const amount = moneyNumber(lancamento.valor_parcela ?? lancamento.valor);
  if (!amount) {
    return { ok: false, title: "Valor invalido", message: "Este lancamento nao tem valor valido para gerar boleto." };
  }

  const email = payerEmail(lancamento, aluno, config);
  if (!email) {
    return {
      ok: false,
      title: "E-mail do aluno obrigatorio",
      message: "O Mercado Pago exige e-mail do pagador. Preencha o e-mail no cadastro do aluno ou no lancamento financeiro.",
    };
  }

  const nome = text(lancamento.aluno || lancamento.nome || lancamento.pagador || "Aluno Active");
  const documento = digits(
    lancamento.cpf ||
    lancamento.aluno_cpf ||
    lancamento.responsavel_cpf ||
    aluno?.cpf ||
    aluno?.responsavel_cpf ||
    aluno?.cnpj ||
    lancamento.cnpj
  );
  const identification = resolveIdentification(documento);
  if (!identification) {
    return {
      ok: false,
      title: "CPF/CNPJ obrigatorio",
      message: "O Mercado Pago exige CPF (11 digitos) ou CNPJ (14 digitos) do pagador para gerar boleto.",
    };
  }

  const address = payerAddress(lancamento, aluno, sistema);
  if (!address.zip_code) {
    return {
      ok: false,
      title: "CEP obrigatorio para boleto",
      message: "O Mercado Pago exige CEP do pagador para gerar boleto. Preencha o CEP no cadastro do aluno ou nas configuracoes da escola.",
    };
  }

  const notificationUrl = text(process.env.ACTIVE_MERCADO_PAGO_WEBHOOK_URL || config?.webhook_url) || `${origin}/api/financeiro/mercado-pago/webhook`;
  const result = await criarPagamentoBoleto({
    accessToken: token,
    transactionAmount: amount,
    description: text(lancamento.descricao) || "Mensalidade escolar",
    externalReference: id,
    dateOfExpiration: expirationDate(lancamento.vencimento || lancamento.data_vencimento),
    notificationUrl,
    idempotencyKey: `active-boleto-${id}`,
    metadata: {
      sistema: "active_educacional",
      lancamento_id: id,
      aluno: nome,
      aluno_id: text(lancamento.aluno_id || aluno?.id),
      aluno_login: text(lancamento.aluno_login || aluno?.login || aluno?.usuario),
    },
    payer: {
      email,
      firstName: firstName(nome),
      lastName: lastName(nome),
      identificationType: identification.type,
      identificationNumber: identification.number,
      address,
    },
  });

  if (!result.ok) {
    return {
      ok: false,
      title: "Falha ao gerar boleto Mercado Pago",
      message: result.message,
      detail: formatMercadoPagoErrorDetail(result.details),
    };
  }

  const recebimentos = await dbList<Row>("receivables.json");
  await dbSet("receivables.json", recebimentos.map((item) => text(item.id) === id ? {
    ...item,
    mercado_pago_payment_id: result.paymentId,
    mercado_pago_status: result.status,
    mercado_pago_detail: text((result.raw.status_detail as unknown) || ""),
    mercado_pago_ticket_url: result.pdfUrl,
    boleto_pdf_url: result.pdfUrl,
    boleto_linha_digitavel: result.linhaDigitavel,
    boleto_status: "Mercado Pago",
    boleto_codigo: result.paymentId || text(item.boleto_codigo),
    boleto_gerado_em: new Date().toISOString(),
    status: text(item.status) || "Boleto gerado",
  } : item));

  return { ok: true, url: result.pdfUrl, linha: result.linhaDigitavel, paymentId: result.paymentId };
}

export function applyMercadoPagoToLancamento(lancamento: Row, result: Extract<MercadoPagoBoletoResult, { ok: true }>) {
  return {
    ...lancamento,
    mercado_pago_payment_id: result.paymentId,
    mercado_pago_ticket_url: result.url,
    boleto_pdf_url: result.url,
    boleto_linha_digitavel: result.linha,
    boleto_status: "Mercado Pago",
    boleto_codigo: result.paymentId,
    boleto_gerado_em: new Date().toISOString(),
    status: text(lancamento.status) || "Boleto gerado",
  };
}

export { criarPagamentoBoleto } from "@/lib/criar-pagamento-boleto";
