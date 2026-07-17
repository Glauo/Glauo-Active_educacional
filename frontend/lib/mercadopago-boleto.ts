import { dbGet, dbList, dbSet, dbUpdate } from "@/lib/db";
import { criarPagamentoBoleto, resolveIdentification } from "@/lib/criar-pagamento-boleto";
import { criarPagamentoPix } from "@/lib/criar-pagamento-pix";

type Row = Record<string, unknown>;

export type MercadoPagoBoletoResult =
  | { ok: true; url: string; linha: string; paymentId: string; lancamento?: Row }
  | { ok: false; title: string; message: string; detail?: string };

export type MercadoPagoPixResult =
  | { ok: true; url: string; qrCode: string; qrCodeBase64: string; paymentId: string; lancamento?: Row }
  | { ok: false; title: string; message: string; detail?: string };

type MercadoPagoCreateOptions = {
  forceNewPayment?: boolean;
};

export type MercadoPagoBoletoCharge = {
  baseAmount: number;
  transactionAmount: number;
  daysLate: number;
  finePercent: number;
  dailyInterestPercent: number;
  hasPenalty: boolean;
  dueDate: string;
};

type MercadoPagoBoletoExpiration = {
  dateOfExpiration: "";
  reason: "not_sent_active_managed";
};

function text(value: unknown) {
  return String(value || "").trim();
}

function normalize(value: unknown) {
  return text(value)
    .replace(/\s+/g, " ")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
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

function roundMoney(value: number) {
  return Number(value.toFixed(2));
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

function compactRow(row: Row) {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => text(value))) as Row;
}

function parseDateOnly(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) {
    const parsed = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), 12);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function diffDays(start: Date, end: Date) {
  const safeStart = new Date(start);
  const safeEnd = new Date(end);
  safeStart.setHours(0, 0, 0, 0);
  safeEnd.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((safeEnd.getTime() - safeStart.getTime()) / 86400000));
}

function isoDateOnly(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isoExpirationEndOfDay(date: Date) {
  return `${isoDateOnly(date)}T23:59:59.000-03:00`;
}

function isSettledFinanceStatus(value: unknown) {
  const status = normalize(value);
  return status.includes("pago") || status.includes("baixado") || status.includes("liquidado");
}

function boletoPenaltyRates(_config: Row | null) {
  return {
    finePercent: 10,
    dailyInterestPercent: 1,
  };
}

function resolveMercadoPagoBoletoExpiration(lancamento: Row): MercadoPagoBoletoExpiration {
  void lancamento;
  return { dateOfExpiration: "", reason: "not_sent_active_managed" };
}

function calculateBoletoCharge(lancamento: Row, config: Row | null): MercadoPagoBoletoCharge {
  const baseAmount = moneyNumber(lancamento.valor_parcela ?? lancamento.valor);
  const dueDate = text(lancamento.vencimento || lancamento.data_vencimento);
  const due = parseDateOnly(dueDate);
  const alreadyPaid = isSettledFinanceStatus(lancamento.status || lancamento.situacao);
  const { finePercent, dailyInterestPercent } = boletoPenaltyRates(config);
  const daysLate = !alreadyPaid && due ? diffDays(due, new Date()) : 0;
  const hasPenalty = baseAmount > 0 && daysLate > 0;
  const fineAmount = hasPenalty ? baseAmount * (finePercent / 100) : 0;
  const dailyInterestAmount = hasPenalty ? baseAmount * (dailyInterestPercent / 100) * daysLate : 0;

  return {
    baseAmount,
    transactionAmount: hasPenalty ? roundMoney(baseAmount + fineAmount + dailyInterestAmount) : baseAmount,
    daysLate,
    finePercent,
    dailyInterestPercent,
    hasPenalty,
    dueDate,
  };
}

function pickNormalized(row: Row, keys: string[]) {
  return keys.map((key) => normalize(row[key])).filter(Boolean);
}

function pickDigits(row: Row, keys: string[]) {
  return keys.map((key) => digits(row[key])).filter(Boolean);
}

function firstValidDocument(...values: unknown[]) {
  for (const value of values) {
    const document = digits(value);
    if (document.length === 11 || document.length === 14) return document;
  }
  return "";
}

function slug(value: unknown) {
  return normalize(value).replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");
}

function sanitizeEmail(value: unknown) {
  return text(value).replace(/^mailto:/i, "").replace(/\s+/g, "").toLowerCase();
}

function isValidEmail(value: unknown) {
  const email = sanitizeEmail(value);
  return /^[^@<>(),;:\\"\[\]\s]+@[^@<>(),;:\\"\[\]\s]+\.[^@<>(),;:\\"\[\]\s]{2,}$/.test(email);
}

function firstValidEmail(...values: unknown[]) {
  for (const value of values) {
    const email = sanitizeEmail(value);
    if (isValidEmail(email)) return email;
  }
  return "";
}

function fallbackEmail(payerName: string, id: string) {
  return `aluno.${slug(payerName) || id.slice(0, 8)}@ativoeducacional.tech`;
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
  return firstValidEmail(
    aluno?.responsavel_email,
    aluno?.email_responsavel,
    aluno?.emailResponsavel,
    responsavel.email,
    responsavel.email_responsavel,
    responsavel.emailResponsavel,
    aluno?.aluno_email,
    aluno?.email,
    lancamento.email,
    lancamento.aluno_email,
    lancamento.responsavel_email,
    lancamento.email_responsavel,
    config?.payer_email,
    process.env.ACTIVE_MERCADO_PAGO_PAYER_EMAIL,
    process.env.MERCADO_PAGO_PAYER_EMAIL,
    fallbackEmail(payerName, id)
  );
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
    zip_code: digits(firstPresent(aluno?.cep, aluno?.zip_code, aluno?.postal_code, parsedAluno.zip_code, responsavel.cep, responsavel.zip_code, responsavel.postal_code, parsedResponsavel.zip_code, lancamento.cep, lancamento.zip_code, lancamento.postal_code, parsedLancamento.zip_code, sistema?.cep, sistema?.zip_code, sistema?.postal_code, parsedSistema.zip_code)),
    street_name: firstPresent(aluno?.rua, aluno?.logradouro, aluno?.street_name, parsedAluno.street_name, responsavel.rua, responsavel.logradouro, responsavel.street_name, parsedResponsavel.street_name, lancamento.rua, lancamento.logradouro, lancamento.street_name, parsedLancamento.street_name, sistema?.rua, sistema?.logradouro, sistema?.street_name, parsedSistema.street_name, "Rua nao informada"),
    street_number: firstPresent(aluno?.numero, aluno?.number, aluno?.street_number, parsedAluno.street_number, responsavel.numero, responsavel.number, responsavel.street_number, parsedResponsavel.street_number, lancamento.numero, lancamento.number, lancamento.street_number, parsedLancamento.street_number, sistema?.numero, sistema?.number, sistema?.street_number, parsedSistema.street_number, "S/N"),
    neighborhood: firstPresent(aluno?.bairro, aluno?.neighborhood, parsedAluno.neighborhood, responsavel.bairro, responsavel.neighborhood, parsedResponsavel.neighborhood, lancamento.bairro, lancamento.neighborhood, parsedLancamento.neighborhood, sistema?.bairro, sistema?.neighborhood, parsedSistema.neighborhood, "Centro"),
    city: firstPresent(aluno?.cidade, aluno?.city, parsedAluno.city, responsavel.cidade, responsavel.city, parsedResponsavel.city, lancamento.cidade, lancamento.city, parsedLancamento.city, sistema?.cidade, sistema?.city, parsedSistema.city, "Sao Paulo"),
    federal_unit: firstPresent(aluno?.estado, aluno?.uf, aluno?.federal_unit, parsedAluno.federal_unit, responsavel.estado, responsavel.uf, responsavel.federal_unit, parsedResponsavel.federal_unit, lancamento.estado, lancamento.uf, lancamento.federal_unit, parsedLancamento.federal_unit, sistema?.estado, sistema?.uf, sistema?.federal_unit, parsedSistema.federal_unit, "SP").slice(0, 2).toUpperCase(),
  };
}

function findStudent(students: Row[], lancamento: Row) {
  const chargeIds = pickNormalized(lancamento, [
    "aluno_id", "student_id", "studentId", "id_aluno", "idAluno", "codigo_aluno", "codigo", "matricula", "aluno_matricula", "matricula_aluno",
  ]);
  const chargeLogins = pickNormalized(lancamento, ["aluno_login", "login", "usuario", "user", "username"]);
  const chargeNames = pickNormalized(lancamento, [
    "aluno", "aluno_nome", "nome_aluno", "nome", "pagador", "estudante", "student_name", "responsavel", "responsavel_nome",
  ]);
  const chargeEmails = pickNormalized(lancamento, [
    "email", "aluno_email", "email_aluno", "responsavel_email", "email_responsavel", "payer_email",
  ]);
  const chargeDocs = pickDigits(lancamento, [
    "cpf", "cpf_aluno", "cpf_do_aluno", "aluno_cpf", "responsavel_cpf", "cpf_responsavel", "documento", "documento_pagador", "cnpj",
  ]);
  const chargePhones = pickDigits(lancamento, [
    "telefone", "celular", "whatsapp", "aluno_telefone", "aluno_celular", "responsavel_telefone", "telefone_responsavel", "responsavel_celular",
  ]);

  return students.find((student) => {
    const responsavel = asRow(student.responsavel);
    const ids = pickNormalized(student, ["id", "_id", "uuid", "codigo", "codigo_aluno", "matricula", "aluno_id"]);
    const logins = pickNormalized(student, ["login", "usuario", "aluno_login", "email"]);
    const nomes = [
      ...pickNormalized(student, ["nome", "name", "nome_completo", "aluno", "aluno_nome", "nome_aluno", "responsavel_nome", "responsavel_financeiro"]),
      ...pickNormalized(responsavel, ["nome", "name"]),
    ];
    const emails = [
      ...pickNormalized(student, ["email", "aluno_email", "email_aluno", "responsavel_email", "email_responsavel"]),
      ...pickNormalized(responsavel, ["email", "email_responsavel"]),
    ];
    const docs = [
      ...pickDigits(student, ["cpf", "cpf_aluno", "cpf_do_aluno", "aluno_cpf", "responsavel_cpf", "cpf_responsavel", "documento", "documento_pagador", "cnpj"]),
      ...pickDigits(responsavel, ["cpf", "cpf_responsavel", "documento", "cnpj"]),
    ];
    const phones = [
      ...pickDigits(student, ["telefone", "celular", "whatsapp", "aluno_telefone", "aluno_celular", "responsavel_telefone", "telefone_responsavel", "responsavel_celular"]),
      ...pickDigits(responsavel, ["telefone", "celular", "whatsapp"]),
    ];

    return Boolean(
      chargeIds.some((id) => ids.includes(id)) ||
      chargeLogins.some((login) => logins.includes(login)) ||
      chargeEmails.some((email) => emails.includes(email)) ||
      chargeDocs.some((doc) => docs.includes(doc)) ||
      chargePhones.some((phone) => phone.length >= 10 && phones.includes(phone)) ||
      chargeNames.some((nome) => nomes.some((studentName) => studentName === nome || (nome.length > 8 && (studentName.includes(nome) || nome.includes(studentName)))))
    );
  }) || null;
}

function studentFinancePatch(aluno: Row | null) {
  if (!aluno) return {};
  const responsavel = asRow(aluno.responsavel);
  const alunoNome = firstPresent(aluno.nome, aluno.name, aluno.nome_completo, aluno.aluno);
  const responsavelNome = firstPresent(aluno.responsavel_nome, aluno.responsavel_financeiro, responsavel.nome, responsavel.name);
  const responsavelEmail = firstValidEmail(aluno.responsavel_email, aluno.email_responsavel, responsavel.email, responsavel.email_responsavel);
  const alunoEmail = firstValidEmail(aluno.aluno_email, aluno.email);
  const responsavelTelefone = firstPresent(aluno.responsavel_telefone, aluno.telefone_responsavel, aluno.responsavel_celular, responsavel.celular, responsavel.telefone, responsavel.whatsapp);
  const alunoTelefone = firstPresent(aluno.celular, aluno.telefone, aluno.whatsapp, aluno.aluno_telefone, aluno.aluno_celular);

  return compactRow({
    aluno_id: firstPresent(aluno.id, aluno._id, aluno.uuid, aluno.aluno_id),
    aluno: alunoNome,
    nome: alunoNome,
    aluno_login: firstPresent(aluno.login, aluno.usuario, aluno.aluno_login),
    matricula: firstPresent(aluno.matricula, aluno.codigo, aluno.codigo_aluno),
    email: firstPresent(responsavelEmail, alunoEmail),
    aluno_email: alunoEmail,
    responsavel_email: responsavelEmail,
    telefone: firstPresent(responsavelTelefone, alunoTelefone),
    whatsapp: firstPresent(responsavelTelefone, alunoTelefone),
    aluno_telefone: alunoTelefone,
    responsavel_telefone: responsavelTelefone,
    responsavel_nome: responsavelNome,
    responsavel_cpf: firstPresent(aluno.responsavel_cpf, aluno.cpf_responsavel, responsavel.cpf, responsavel.documento),
    cpf: firstPresent(aluno.cpf, aluno.cpf_aluno, aluno.cpf_do_aluno, aluno.aluno_cpf),
    cpf_aluno: firstPresent(aluno.cpf_aluno, aluno.cpf, aluno.cpf_do_aluno, aluno.aluno_cpf),
    cep: firstPresent(aluno.cep, aluno.zip_code, aluno.postal_code, responsavel.cep, responsavel.zip_code, responsavel.postal_code),
    rua: firstPresent(aluno.rua, aluno.logradouro, aluno.street_name, responsavel.rua, responsavel.logradouro, responsavel.street_name),
    numero: firstPresent(aluno.numero, aluno.number, aluno.street_number, responsavel.numero, responsavel.number, responsavel.street_number),
    bairro: firstPresent(aluno.bairro, aluno.neighborhood, responsavel.bairro, responsavel.neighborhood),
    cidade: firstPresent(aluno.cidade, aluno.city, responsavel.cidade, responsavel.city),
    estado: firstPresent(aluno.estado, aluno.uf, aluno.federal_unit, responsavel.estado, responsavel.uf, responsavel.federal_unit),
  });
}

function formatMercadoPagoErrorDetail(details: unknown) {
  if (!details || typeof details !== "object") return text(details);
  const row = details as Record<string, unknown>;
  const cause = Array.isArray(row.cause) ? row.cause : [];
  const firstCause = cause[0] && typeof cause[0] === "object" ? cause[0] as Record<string, unknown> : null;
  return text(firstCause?.description || row.message || row.error || JSON.stringify(details).slice(0, 220));
}

export async function resolveMercadoPagoBoletoCharge(lancamento: Row): Promise<MercadoPagoBoletoCharge> {
  const config = await dbGet<Row>("boleto_config.json");
  return calculateBoletoCharge(lancamento, config);
}

export async function createMercadoPagoBoleto(
  lancamento: Row,
  id: string,
  origin: string,
  options: MercadoPagoCreateOptions = {}
): Promise<MercadoPagoBoletoResult> {
  const [config, sistema, students] = await Promise.all([
    dbGet<Row>("boleto_config.json"),
    dbGet<Row>("sistema_config.json"),
    dbList<Row>("students.json"),
  ]);
  const aluno = findStudent(students, lancamento);
  const alunoPatch = studentFinancePatch(aluno);
  const boletoLancamento = { ...lancamento, ...alunoPatch };
  const responsavel = asRow(aluno?.responsavel);
  const token = boletoToken(config);
  if (!token) {
    return {
      ok: false,
      title: "Mercado Pago nao configurado",
      message: "Configure ACTIVE_MERCADO_PAGO_ACCESS_TOKEN ou MERCADO_PAGO_ACCESS_TOKEN no ambiente do Node.js, ou informe o Access Token nas configuracoes de boleto.",
    };
  }

  const charge = calculateBoletoCharge(boletoLancamento, config);
  if (!charge.baseAmount) {
    return { ok: false, title: "Valor invalido", message: "Este lancamento nao tem valor valido para gerar boleto." };
  }

  const nome = text(
    responsavel.nome ||
    responsavel.name ||
    aluno?.responsavel_nome ||
    aluno?.responsavel_financeiro ||
    aluno?.nome ||
    aluno?.name ||
    boletoLancamento.aluno ||
    boletoLancamento.nome ||
    boletoLancamento.pagador ||
    "Aluno Active"
  );
  const email = payerEmail(boletoLancamento, aluno, config, nome, id);
  if (!email) {
    return {
      ok: false,
      title: "E-mail do aluno obrigatorio",
      message: "O Mercado Pago exige e-mail do pagador. Preencha o e-mail no cadastro do aluno ou no lancamento financeiro.",
    };
  }

  const documento = firstValidDocument(
    aluno?.cpf_do_aluno,
    aluno?.cpf_aluno,
    aluno?.cpf,
    aluno?.aluno_cpf,
    aluno?.responsavel_cpf,
    aluno?.cpf_responsavel,
    aluno?.documento,
    aluno?.documento_pagador,
    responsavel.cpf,
    responsavel.cpf_responsavel,
    responsavel.documento,
    responsavel.cnpj,
    aluno?.cnpj,
    boletoLancamento.cpf,
    boletoLancamento.cpf_aluno,
    boletoLancamento.cpf_do_aluno,
    boletoLancamento.aluno_cpf,
    boletoLancamento.responsavel_cpf,
    boletoLancamento.cpf_responsavel,
    boletoLancamento.documento,
    boletoLancamento.documento_pagador,
    boletoLancamento.cnpj,
    config?.payer_document,
    config?.cpf,
    config?.cnpj,
    sistema?.cnpj,
    sistema?.cpf,
    process.env.ACTIVE_MERCADO_PAGO_PAYER_DOCUMENT,
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

  const address = payerAddress(boletoLancamento, aluno, sistema);
  if (!address.zip_code) {
    return {
      ok: false,
      title: "CEP obrigatorio para boleto",
      message: "O Mercado Pago exige CEP do pagador para gerar boleto. Preencha o CEP no cadastro do aluno ou nas configuracoes da escola.",
    };
  }

  const notificationUrl = text(process.env.ACTIVE_MERCADO_PAGO_WEBHOOK_URL || config?.webhook_url) || `${origin}/api/financeiro/mercado-pago/webhook`;
  const expiration = resolveMercadoPagoBoletoExpiration(boletoLancamento);
  const idempotencyKey = options.forceNewPayment
    ? `active-boleto-${id}-${Date.now()}`
    : `active-boleto-${id}`;
  const result = await criarPagamentoBoleto({
    accessToken: token,
    transactionAmount: charge.transactionAmount,
    description: text(boletoLancamento.descricao) || "Mensalidade escolar",
    externalReference: id,
    dateOfExpiration: expiration.dateOfExpiration || undefined,
    notificationUrl,
    idempotencyKey,
    metadata: {
      sistema: "active_educacional",
      lancamento_id: id,
      aluno: nome,
      aluno_id: text(boletoLancamento.aluno_id || aluno?.id),
      aluno_login: text(boletoLancamento.aluno_login || aluno?.login || aluno?.usuario),
      regenerated_at: options.forceNewPayment ? new Date().toISOString() : "",
      boleto_sem_validade: true,
      valor_original: charge.baseAmount,
      valor_atualizado: charge.transactionAmount,
      dias_atraso: charge.daysLate,
      multa_percentual: charge.finePercent,
      juros_dia_percentual: charge.dailyInterestPercent,
      vencimento_lancamento: text(boletoLancamento.vencimento || boletoLancamento.data_vencimento),
      vencimento_tecnico_mp: expiration.dateOfExpiration,
      vencimento_tecnico_mp_regra: expiration.reason,
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

  let savedLancamento: Row = boletoLancamento;
  await dbUpdate<Row[]>("receivables.json", (recebimentos) => (Array.isArray(recebimentos) ? recebimentos : []).map((item) => {
    if (text(item.id) !== id) return item;
    const updated = {
      ...item,
      ...alunoPatch,
      external_reference: id,
      payment_external_reference: id,
      mercado_pago_payment_id: result.paymentId,
      mercado_pago_previous_payment_id: text(item.mercado_pago_payment_id) && text(item.mercado_pago_payment_id) !== result.paymentId
        ? text(item.mercado_pago_payment_id)
        : text(item.mercado_pago_previous_payment_id),
      mercado_pago_payment_history: Array.from(new Set([
        ...(Array.isArray(item.mercado_pago_payment_history) ? item.mercado_pago_payment_history.map(text) : []),
        text(item.mercado_pago_payment_id),
        result.paymentId,
      ].filter(Boolean))),
      mercado_pago_status: result.status,
      mercado_pago_detail: text((result.raw.status_detail as unknown) || ""),
      mercado_pago_transaction_amount: charge.transactionAmount,
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
      boleto_mercado_pago_payment_id: result.paymentId,
      boleto_gerado_em: new Date().toISOString(),
      boleto_valor_original: charge.baseAmount,
      boleto_valor_atualizado: charge.transactionAmount,
      boleto_dias_atraso: charge.daysLate,
      boleto_multa_percentual: charge.finePercent,
      boleto_juros_dia_percentual: charge.dailyInterestPercent,
      boleto_vencimento_lancamento: text(item.vencimento || item.data_vencimento),
      boleto_vencimento_tecnico_mp: expiration.dateOfExpiration,
      boleto_vencimento_tecnico_mp_regra: expiration.reason,
      boleto_atualizado_em: new Date().toISOString(),
      boleto_permite_pagamento_apos_vencimento: true,
      boleto_sem_validade: true,
      status: isSettledFinanceStatus(item.status || item.situacao) ? text(item.status || item.situacao) : "Pendente",
      situacao: isSettledFinanceStatus(item.status || item.situacao) ? text(item.situacao || item.status) : "Pendente",
    };
    savedLancamento = updated;
    return updated;
  }), []);

  return { ok: true, url: result.pdfUrl, linha: result.linhaDigitavel, paymentId: result.paymentId, lancamento: savedLancamento };
}

export async function createMercadoPagoPix(
  lancamento: Row,
  id: string,
  origin: string,
  options: MercadoPagoCreateOptions = {}
): Promise<MercadoPagoPixResult> {
  const [config, sistema, students] = await Promise.all([
    dbGet<Row>("boleto_config.json"),
    dbGet<Row>("sistema_config.json"),
    dbList<Row>("students.json"),
  ]);
  const aluno = findStudent(students, lancamento);
  const alunoPatch = studentFinancePatch(aluno);
  const pixLancamento = { ...lancamento, ...alunoPatch };
  const responsavel = asRow(aluno?.responsavel);
  const token = boletoToken(config);
  if (!token) {
    return {
      ok: false,
      title: "Mercado Pago nao configurado",
      message: "Configure ACTIVE_MERCADO_PAGO_ACCESS_TOKEN ou MERCADO_PAGO_ACCESS_TOKEN no ambiente do Node.js, ou informe o Access Token nas configuracoes.",
    };
  }

  const charge = calculateBoletoCharge(pixLancamento, config);
  if (!charge.baseAmount) {
    return { ok: false, title: "Valor invalido", message: "Este lancamento nao tem valor valido para gerar PIX." };
  }

  const nome = text(
    responsavel.nome ||
    responsavel.name ||
    aluno?.responsavel_nome ||
    aluno?.responsavel_financeiro ||
    aluno?.nome ||
    aluno?.name ||
    pixLancamento.aluno ||
    pixLancamento.nome ||
    pixLancamento.pagador ||
    "Aluno Active"
  );
  const email = payerEmail(pixLancamento, aluno, config, nome, id);
  const documento = firstValidDocument(
    aluno?.cpf_do_aluno,
    aluno?.cpf_aluno,
    aluno?.cpf,
    aluno?.aluno_cpf,
    aluno?.responsavel_cpf,
    aluno?.cpf_responsavel,
    aluno?.documento,
    aluno?.documento_pagador,
    responsavel.cpf,
    responsavel.cpf_responsavel,
    responsavel.documento,
    responsavel.cnpj,
    aluno?.cnpj,
    pixLancamento.cpf,
    pixLancamento.cpf_aluno,
    pixLancamento.cpf_do_aluno,
    pixLancamento.aluno_cpf,
    pixLancamento.responsavel_cpf,
    pixLancamento.cpf_responsavel,
    pixLancamento.documento,
    pixLancamento.documento_pagador,
    pixLancamento.cnpj,
    config?.payer_document,
    config?.cpf,
    config?.cnpj,
    sistema?.cnpj,
    sistema?.cpf,
    process.env.ACTIVE_MERCADO_PAGO_PAYER_DOCUMENT,
    process.env.MERCADO_PAGO_PAYER_DOCUMENT
  );
  const identification = resolveIdentification(documento);
  if (!identification) {
    return {
      ok: false,
      title: "CPF/CNPJ obrigatorio",
      message: "O Mercado Pago exige CPF (11 digitos) ou CNPJ (14 digitos) do pagador para gerar PIX.",
    };
  }

  const notificationUrl = text(process.env.ACTIVE_MERCADO_PAGO_WEBHOOK_URL || config?.webhook_url) || `${origin}/api/financeiro/mercado-pago/webhook`;
  const amountKey = Math.round(charge.transactionAmount * 100);
  const idempotencyKey = options.forceNewPayment
    ? `active-pix-${id}-${amountKey}-${Date.now()}`
    : `active-pix-${id}-${amountKey}-${charge.daysLate}`;
  const result = await criarPagamentoPix({
    accessToken: token,
    transactionAmount: charge.transactionAmount,
    description: text(pixLancamento.descricao) || "Mensalidade escolar",
    externalReference: id,
    notificationUrl,
    idempotencyKey,
    metadata: {
      sistema: "active_educacional",
      lancamento_id: id,
      aluno: nome,
      aluno_id: text(pixLancamento.aluno_id || aluno?.id),
      aluno_login: text(pixLancamento.aluno_login || aluno?.login || aluno?.usuario),
      meio_pagamento: "pix",
      valor_original: charge.baseAmount,
      valor_atualizado: charge.transactionAmount,
      dias_atraso: charge.daysLate,
      multa_percentual: charge.finePercent,
      juros_dia_percentual: charge.dailyInterestPercent,
      vencimento_lancamento: charge.dueDate,
    },
    payer: {
      email,
      firstName: firstName(nome),
      lastName: lastName(nome),
      identificationType: identification.type,
      identificationNumber: identification.number,
    },
  });

  if (!result.ok) {
    return {
      ok: false,
      title: "Falha ao gerar PIX Mercado Pago",
      message: result.message,
      detail: formatMercadoPagoErrorDetail(result.details),
    };
  }

  let savedLancamento: Row = pixLancamento;
  await dbUpdate<Row[]>("receivables.json", (recebimentos) => (Array.isArray(recebimentos) ? recebimentos : []).map((item) => {
    if (text(item.id) !== id) return item;
    const updated = {
      ...item,
      ...alunoPatch,
      external_reference: id,
      payment_external_reference: id,
      mercado_pago_payment_id: result.paymentId,
      mercado_pago_previous_payment_id: text(item.mercado_pago_payment_id) && text(item.mercado_pago_payment_id) !== result.paymentId
        ? text(item.mercado_pago_payment_id)
        : text(item.mercado_pago_previous_payment_id),
      mercado_pago_payment_history: Array.from(new Set([
        ...(Array.isArray(item.mercado_pago_payment_history) ? item.mercado_pago_payment_history.map(text) : []),
        text(item.mercado_pago_payment_id),
        result.paymentId,
      ].filter(Boolean))),
      mercado_pago_status: result.status,
      mercado_pago_detail: text((result.raw.status_detail as unknown) || ""),
      mercado_pago_payment_method: "pix",
      pix_ticket_url: result.ticketUrl,
      pix_qr_code: result.qrCode,
      pix_qr_code_base64: result.qrCodeBase64,
      pix_status: "Mercado Pago",
      pix_codigo: result.paymentId || text(item.pix_codigo),
      pix_mercado_pago_payment_id: result.paymentId,
      pix_previous_payment_id: text(item.pix_mercado_pago_payment_id || item.pix_codigo),
      pix_gerado_em: new Date().toISOString(),
      pix_valor_original: charge.baseAmount,
      pix_valor_atualizado: charge.transactionAmount,
      pix_dias_atraso: charge.daysLate,
      pix_multa_percentual: charge.finePercent,
      pix_juros_dia_percentual: charge.dailyInterestPercent,
      pix_vencimento_lancamento: charge.dueDate,
      pix_atualizado_em: new Date().toISOString(),
      pix_permite_pagamento_apos_vencimento: true,
      status: text(item.status) || "PIX gerado",
    };
    savedLancamento = updated;
    return updated;
  }), []);

  return {
    ok: true,
    url: result.ticketUrl,
    qrCode: result.qrCode,
    qrCodeBase64: result.qrCodeBase64,
    paymentId: result.paymentId,
    lancamento: savedLancamento,
  };
}

export function applyMercadoPagoToLancamento(lancamento: Row, result: Extract<MercadoPagoBoletoResult, { ok: true }>) {
  return {
    ...lancamento,
    external_reference: text(lancamento.external_reference || lancamento.id),
    payment_external_reference: text(lancamento.payment_external_reference || lancamento.id),
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
    boleto_permite_pagamento_apos_vencimento: true,
    boleto_sem_validade: true,
    status: isSettledFinanceStatus(lancamento.status || lancamento.situacao) ? text(lancamento.status || lancamento.situacao) : "Pendente",
    situacao: isSettledFinanceStatus(lancamento.status || lancamento.situacao) ? text(lancamento.situacao || lancamento.status) : "Pendente",
  };
}

export { criarPagamentoBoleto } from "@/lib/criar-pagamento-boleto";
