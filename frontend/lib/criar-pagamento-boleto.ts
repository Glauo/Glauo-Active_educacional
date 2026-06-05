import { MercadoPagoConfig, Payment } from "mercadopago";

export type PagadorBoleto = {
  email: string;
  firstName: string;
  lastName: string;
  identificationType: "CPF" | "CNPJ";
  identificationNumber: string;
  address: {
    zip_code: string;
    street_name: string;
    street_number: string;
    neighborhood: string;
    city: string;
    federal_unit: string;
  };
};

export type CriarPagamentoBoletoInput = {
  accessToken: string;
  transactionAmount: number;
  description: string;
  externalReference: string;
  payer: PagadorBoleto;
  notificationUrl?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
};

export type CriarPagamentoBoletoSuccess = {
  ok: true;
  paymentId: string;
  status: string;
  pdfUrl: string;
  linhaDigitavel: string;
  raw: Record<string, unknown>;
};

export type CriarPagamentoBoletoError = {
  ok: false;
  message: string;
  details: unknown;
};

function text(value: unknown) {
  return String(value || "").trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function sanitizeEmail(value: unknown) {
  return text(value).replace(/^mailto:/i, "").replace(/\s+/g, "").toLowerCase();
}

function isValidEmail(value: unknown) {
  const email = sanitizeEmail(value);
  return /^[^@<>(),;:\\"\[\]\s]+@[^@<>(),;:\\"\[\]\s]+\.[^@<>(),;:\\"\[\]\s]{2,}$/.test(email);
}

function safePayerEmail(value: unknown, externalReference: string) {
  const email = sanitizeEmail(value);
  if (isValidEmail(email)) return email;
  const suffix = text(externalReference).replace(/[^a-zA-Z0-9]/g, "").slice(0, 16).toLowerCase() || "boleto";
  return `financeiro.${suffix}@ativoeducacional.tech`;
}

function extractMercadoPagoError(error: unknown) {
  const row = asRecord(error);
  const cause = asRecord(row.cause);
  const causes = Array.isArray(row.cause) ? row.cause : [];
  const firstCause = asRecord(causes[0]);

  const message = text(
    row.message ||
    firstCause.description ||
    cause.description ||
    row.error ||
    "Erro desconhecido ao criar boleto no Mercado Pago."
  );

  const details = {
    message,
    status: row.status,
    error: row.error,
    cause: row.cause,
  };

  return { message, details };
}

function extractBoletoPdfUrl(raw: Record<string, unknown>) {
  const transactionDetails = asRecord(raw.transaction_details);
  const paymentMethod = asRecord(raw.payment_method);
  const paymentMethodData = asRecord(paymentMethod.data);
  const point = asRecord(raw.point_of_interaction);
  const transactionData = asRecord(point.transaction_data);

  return text(
    transactionDetails.external_resource_url ||
    paymentMethodData.external_resource_url ||
    transactionData.ticket_url ||
    raw.external_resource_url
  );
}

function extractLinhaDigitavel(raw: Record<string, unknown>) {
  const transactionDetails = asRecord(raw.transaction_details);
  const transactionBarcode = asRecord(transactionDetails.barcode);
  const rootBarCode = asRecord(raw.bar_code);
  const transactionBarCode = asRecord(transactionDetails.bar_code);

  return text(
    rootBarCode.formatted_search_text ||
    transactionBarCode.formatted_search_text ||
    transactionDetails.digitable_line ||
    transactionBarcode.content ||
    rootBarCode.content
  );
}

/**
 * Cria um pagamento de boleto bancario via Mercado Pago SDK (API v1/payments).
 */
export async function criarPagamentoBoleto(
  input: CriarPagamentoBoletoInput
): Promise<CriarPagamentoBoletoSuccess | CriarPagamentoBoletoError> {
  const payerEmail = safePayerEmail(input.payer.email, input.externalReference);

  try {
    const client = new MercadoPagoConfig({ accessToken: input.accessToken });
    const payment = new Payment(client);

    const body: Record<string, unknown> = {
      transaction_amount: input.transactionAmount,
      description: input.description,
      payment_method_id: "bolbradesco",
      external_reference: input.externalReference,
      binary_mode: true,
      statement_descriptor: "ACTIVE EDUCACIONAL",
      notification_url: input.notificationUrl,
      metadata: {
        ...input.metadata,
        payer_email_usado: payerEmail,
      },
      payer: {
        email: payerEmail,
        first_name: input.payer.firstName,
        last_name: input.payer.lastName,
        identification: {
          type: input.payer.identificationType,
          number: input.payer.identificationNumber,
        },
        address: {
          zip_code: input.payer.address.zip_code,
          street_name: input.payer.address.street_name,
          street_number: input.payer.address.street_number,
          neighborhood: input.payer.address.neighborhood,
          city: input.payer.address.city,
          federal_unit: input.payer.address.federal_unit,
        },
      },
    };

    const response = await payment.create({
      body,
      requestOptions: {
        idempotencyKey: input.idempotencyKey || `active-boleto-${input.externalReference}`,
      },
    });

    const raw = response as unknown as Record<string, unknown>;
    const pdfUrl = extractBoletoPdfUrl(raw);
    const linhaDigitavel = extractLinhaDigitavel(raw);

    if (!pdfUrl) {
      return {
        ok: false,
        message: "O Mercado Pago retornou pagamento, mas nao enviou a URL do boleto PDF.",
        details: raw,
      };
    }

    return {
      ok: true,
      paymentId: text(raw.id),
      status: text(raw.status),
      pdfUrl,
      linhaDigitavel,
      raw,
    };
  } catch (error) {
    const parsed = extractMercadoPagoError(error);
    console.error("[criarPagamentoBoleto] Erro Mercado Pago:", parsed.details);
    return {
      ok: false,
      message: parsed.message,
      details: {
        ...(asRecord(parsed.details)),
        payer_email_usado: payerEmail,
      },
    };
  }
}

export function resolveIdentification(document: string): { type: "CPF" | "CNPJ"; number: string } | null {
  const digits = text(document).replace(/\D/g, "");
  if (digits.length === 11) return { type: "CPF", number: digits };
  if (digits.length === 14) return { type: "CNPJ", number: digits };
  return null;
}
