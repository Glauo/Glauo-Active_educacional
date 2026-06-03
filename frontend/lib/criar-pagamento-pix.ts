import { MercadoPagoConfig, Payment } from "mercadopago";
import { resolveIdentification } from "@/lib/criar-pagamento-boleto";

export type PagadorPix = {
  email: string;
  firstName: string;
  lastName: string;
  identificationType: "CPF" | "CNPJ";
  identificationNumber: string;
};

export type CriarPagamentoPixInput = {
  accessToken: string;
  transactionAmount: number;
  description: string;
  externalReference: string;
  payer: PagadorPix;
  notificationUrl?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
};

export type CriarPagamentoPixSuccess = {
  ok: true;
  paymentId: string;
  status: string;
  ticketUrl: string;
  qrCode: string;
  qrCodeBase64: string;
  raw: Record<string, unknown>;
};

export type CriarPagamentoPixError = {
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
  const suffix = text(externalReference).replace(/[^a-zA-Z0-9]/g, "").slice(0, 16).toLowerCase() || "pix";
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
    "Erro desconhecido ao criar PIX no Mercado Pago."
  );
  return { message, details: { message, status: row.status, error: row.error, cause: row.cause } };
}

function pixTransactionData(raw: Record<string, unknown>) {
  const point = asRecord(raw.point_of_interaction);
  return asRecord(point.transaction_data);
}

export async function criarPagamentoPix(
  input: CriarPagamentoPixInput
): Promise<CriarPagamentoPixSuccess | CriarPagamentoPixError> {
  const payerEmail = safePayerEmail(input.payer.email, input.externalReference);

  try {
    const client = new MercadoPagoConfig({ accessToken: input.accessToken });
    const payment = new Payment(client);

    const body: Record<string, unknown> = {
      transaction_amount: input.transactionAmount,
      description: input.description,
      payment_method_id: "pix",
      external_reference: input.externalReference,
      notification_url: input.notificationUrl,
      metadata: {
        ...input.metadata,
        payer_email_usado: payerEmail,
        meio_pagamento: "pix",
      },
      payer: {
        email: payerEmail,
        first_name: input.payer.firstName,
        last_name: input.payer.lastName,
        identification: {
          type: input.payer.identificationType,
          number: input.payer.identificationNumber,
        },
      },
    };

    const response = await payment.create({
      body,
      requestOptions: {
        idempotencyKey: input.idempotencyKey || `active-pix-${input.externalReference}`,
      },
    });

    const raw = response as unknown as Record<string, unknown>;
    const transactionData = pixTransactionData(raw);
    const qrCode = text(transactionData.qr_code);
    const qrCodeBase64 = text(transactionData.qr_code_base64);
    const ticketUrl = text(transactionData.ticket_url);

    if (!qrCode && !ticketUrl) {
      return {
        ok: false,
        message: "O Mercado Pago retornou pagamento, mas nao enviou QR Code ou link PIX.",
        details: raw,
      };
    }

    return {
      ok: true,
      paymentId: text(raw.id),
      status: text(raw.status),
      ticketUrl,
      qrCode,
      qrCodeBase64,
      raw,
    };
  } catch (error) {
    const parsed = extractMercadoPagoError(error);
    console.error("[criarPagamentoPix] Erro Mercado Pago:", parsed.details);
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

export { resolveIdentification };
