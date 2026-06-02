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
  dateOfExpiration?: string;
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
 *
 * Exemplo de uso:
 * ```ts
 * const result = await criarPagamentoBoleto({
 *   accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN!,
 *   transactionAmount: 150,
 *   description: "Mensalidade escolar",
 *   externalReference: "lancamento-123",
 *   dateOfExpiration: "2026-06-10T23:59:00.000-03:00",
 *   payer: {
 *     email: "responsavel@email.com",
 *     firstName: "Maria",
 *     lastName: "Silva",
 *     identificationType: "CPF",
 *     identificationNumber: "12345678901",
 *     address: {
 *       zip_code: "01310100",
 *       street_name: "Av Paulista",
 *       street_number: "1000",
 *       neighborhood: "Bela Vista",
 *       city: "Sao Paulo",
 *       federal_unit: "SP",
 *     },
 *   },
 * });
 *
 * if (result.ok) {
 *   console.log("PDF:", result.pdfUrl);
 *   console.log("Linha digitavel:", result.linhaDigitavel);
 * } else {
 *   console.error(result.message, result.details);
 * }
 * ```
 */
export async function criarPagamentoBoleto(
  input: CriarPagamentoBoletoInput
): Promise<CriarPagamentoBoletoSuccess | CriarPagamentoBoletoError> {
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
        metadata: input.metadata,
        payer: {
          email: input.payer.email,
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
    if (input.dateOfExpiration) body.date_of_expiration = input.dateOfExpiration;

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
      details: parsed.details,
    };
  }
}

export function resolveIdentification(document: string): { type: "CPF" | "CNPJ"; number: string } | null {
  const digits = text(document).replace(/\D/g, "");
  if (digits.length === 11) return { type: "CPF", number: digits };
  if (digits.length === 14) return { type: "CNPJ", number: digits };
  return null;
}
