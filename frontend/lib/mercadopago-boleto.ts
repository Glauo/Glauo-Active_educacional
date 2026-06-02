import { dbGet, dbList, dbSet } from "@/lib/db";
import { criarPagamentoBoleto, resolveIdentification } from "@/lib/criar-pagamento-boleto";

type Row = Record<string, unknown>;

export type MercadoPagoBoletoResult =
  | { ok: true; url: string; linha: string; paymentId: string }
  | { ok: false; title: string; message: string; detail?: string };

function text(value: unknown) {
  return String(value || "").trim();
}

function normalize(value: unknown) {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function asRow(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function moneyNumber(value: unknown) {
  const raw = String(value || "0").replace(/[^\d.,-]/g, "");
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const n = parseFloat(normalized);
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

function slug(value: unknown) {
  return normalize(value).replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");
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

function payerEmail(lancamento: Row, aluno: Row | null, config: Row | null, payerName: string, id: string) {
  const responsavel = asRow(aluno?.responsavel);
  const found = text(
    lancamento.email ||
    lancamento.aluno_email ||
    lancamento.responsavel_email ||
    lancamento.email_responsavel ||
    aluno?.responsavel_email ||
    aluno?.email_responsavel ||
    aluno?.emailResponsavel ||
    responsavel.email ||
    responsavel.email_responsavel ||
    responsavel.emailResponsavel ||
    aluno?.aluno_email ||
    aluno?.email ||
    config?.payer_email ||
    process.env.ACTIVE_MERCADO_PAGO_PAYER_EMAIL ||
    process.env.MERCADO_PAGO_PAYER_EMAIL
  );
  if (found) return found;
  return `aluno.${slug(payerName) || id.slice(0, 8)}@ativoeducacional.tech`;
}

function splitAddress(value: unknown) {
  const row = asRow(value);
  if (Object.keys(row).length > 0) {
    return {
      zip_code: firstPresent(row.cep, row.zip_code, row.zipCode, row.postal_code),
      street_name: firstPresent(row.rua, row.logradouro, row.endereco, row.street, row.street_name),
      street_number: firstPresent(row.numero, row.number, row.street_number),
      neighborhood: firstPresent(row.bairro, row.neighborhood, row.district),
      city: firstPresent(row.cidade, row.city),
      federal_unit: firstPresent(row.estado, row.uf, row.federal_unit, row.state),
    };
  }
  const parts = text(value).split(",").map((item) => item.trim()).filter(Boolean);
  return {
    zip_code: "",
    street_name: parts[0] || "",
    street_number: parts[1] || "",
    neighborhood: parts[2] || "",
    city: parts[3] || "",
  };
}

function payerAddress(lancamento: Row, aluno: Row | null, sistema: Row | null) {
  const responsavel = asRow(aluno?.responsavel);
  const parsedLancamento = splitAddress(lancamento.endereco || lancamento.address || lancamento.endereco_completo);
  const parsedAluno = splitAddress(aluno?.endereco || aluno?.address || aluno?.endereco_completo);
  const parsedResponsavel = splitAddress(responsavel.endereco || responsavel.address || responsavel.endereco_completo);
  const parsedSistema = splitAddress(sistema?.endereco || sistema?.address || sistema?.endereco_completo);
  return {
    zip_code: digits(firstPresent(lancamento.cep, lancamento.zip_code, lancamento.postal_code, parsedLancamento.zip_code, aluno?.cep, aluno?.zip_code, aluno?.postal_code, parsedAluno.zip_code, responsavel.cep, responsavel.zip_code, responsavel.postal_code, parsedResponsavel.zip_code, sistema?.cep, sistema?.zip_code, sistema?.postal_code, parsedSistema.zip_code)),
    street_name: firstPresent(lancamento.rua, lancamento.logradouro, lancamento.street_name, parsedLancamento.street_name, aluno?.rua, aluno?.logradouro, aluno?.street_name, parsedAluno.street_name, responsavel.rua, responsavel.logradouro, responsavel.street_name, parsedResponsavel.street_name, sistema?.rua, sistema?.logradouro, sistema?.street_name, parsedSistema.street_name, "Rua nao informada"),
    street_number: firstPresent(lancamento.numero, lancamento.number, lancamento.street_number, parsedLancamento.street_number, aluno?.numero, aluno?.number, aluno?.street_number, parsedAluno.street_number, responsavel.numero, responsavel.number, responsavel.street_number, parsedResponsavel.street_number, sistema?.numero, sistema?.number, sistema?.street_number, parsedSistema.street_number, "S/N"),
    neighborhood: firstPresent(lancamento.bairro, lancamento.neighborhood, parsedLancamento.neighborhood, aluno?.bairro, aluno?.neighborhood, parsedAluno.neighborhood, responsavel.bairro, responsavel.neighborhood, parsedResponsavel.neighborhood, sistema?.bairro, sistema?.neighborhood, parsedSistema.neighborhood, "Centro"),
    city: firstPresent(lancamento.cidade, lancamento.city, parsedLancamento.city, aluno?.cidade, aluno?.city, parsedAluno.city, responsavel.cidade, responsavel.city, parsedResponsavel.city, sistema?.cidade, sistema?.city, parsedSistema.city, "Sao Paulo"),
    federal_unit: firstPresent(lancamento.estado, lancamento.uf, lancamento.federal_unit, parsedLancamento.federal_unit, aluno?.estado, aluno?.uf, aluno?.federal_unit, parsedAluno.federal_unit, responsavel.estado, responsavel.uf, responsavel.federal_unit, parsedResponsavel.federal_unit, sistema?.estado, sistema?.uf, sistema?.federal_unit, parsedSistema.federal_unit, "SP").slice(0, 2).toUpperCase(),
  };
}

function findStudent(students: Row[], lancamento: Row) {
  const id = normalize(lancamento.aluno_id || lancamento.student_id || lancamento.id_aluno);
  const login = normalize(lancamento.aluno_login || lancamento.login || lancamento.usuario);
  const nome = normalize(lancamento.aluno || lancamento.nome || lancamento.pagador);
  const email = normalize(lancamento.email || lancamento.aluno_email || lancamento.responsavel_email || lancamento.email_responsavel);
  return students.find((student) => {
    const ids = [student.id, student._id, student.uuid, student.codigo, student.matricula].map(normalize).filter(Boolean);
    const logins = [student.login, student.usuario, student.aluno_login, student.email].map(normalize).filter(Boolean);
    const nomes = [student.nome, student.name, student.nome_completo, student.aluno].map(normalize).filter(Boolean);
    const emails = [student.email, student.aluno_email, student.responsavel_email, student.email_responsavel].map(normalize).filter(Boolean);
    return Boolean(
      (id && ids.includes(id)) ||
      (login && logins.includes(login)) ||
      (email && emails.includes(email)) ||
      (nome && nomes.some((studentName) => studentName === nome || (nome.length > 8 && (studentName.includes(nome) || nome.includes(studentName)))))
    );
  }) || null;
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
  const responsavel = asRow(aluno?.responsavel);
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

  const nome = text(lancamento.aluno || lancamento.nome || lancamento.pagador || aluno?.nome || aluno?.name || "Aluno Active");
  const email = payerEmail(lancamento, aluno, config, nome, id);
  if (!email) {
    return {
      ok: false,
      title: "E-mail do aluno obrigatorio",
      message: "O Mercado Pago exige e-mail do pagador. Preencha o e-mail no cadastro do aluno ou no lancamento financeiro.",
    };
  }

  const documento = digits(
    lancamento.cpf ||
    lancamento.cpf_aluno ||
    lancamento.cpf_do_aluno ||
    lancamento.aluno_cpf ||
    lancamento.responsavel_cpf ||
    lancamento.cpf_responsavel ||
    lancamento.documento ||
    lancamento.documento_pagador ||
    aluno?.cpf_aluno ||
    aluno?.cpf_do_aluno ||
    aluno?.cpf ||
    aluno?.aluno_cpf ||
    aluno?.responsavel_cpf ||
    aluno?.cpf_responsavel ||
    aluno?.documento ||
    aluno?.documento_pagador ||
    responsavel.cpf ||
    responsavel.cpf_responsavel ||
    responsavel.documento ||
    responsavel.cnpj ||
    aluno?.cnpj ||
    lancamento.cnpj ||
    config?.payer_document ||
    config?.cpf ||
    config?.cnpj ||
    sistema?.cnpj ||
    sistema?.cpf ||
    process.env.ACTIVE_MERCADO_PAGO_PAYER_DOCUMENT ||
    process.env.MERCADO_PAGO_PAYER_DOCUMENT
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
    boleto_url: result.pdfUrl,
    boleto_pdf_url: result.pdfUrl,
    boleto_pdf_public_url: "",
    boleto_pdf_b64: "",
    boleto_pdf_mime: "",
    boleto_pdf_nome: "",
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
    boleto_url: result.url,
    boleto_pdf_url: result.url,
    boleto_pdf_public_url: "",
    boleto_pdf_b64: "",
    boleto_pdf_mime: "",
    boleto_pdf_nome: "",
    boleto_linha_digitavel: result.linha,
    boleto_status: "Mercado Pago",
    boleto_codigo: result.paymentId,
    boleto_gerado_em: new Date().toISOString(),
    status: text(lancamento.status) || "Boleto gerado",
  };
}

export { criarPagamentoBoleto } from "@/lib/criar-pagamento-boleto";
