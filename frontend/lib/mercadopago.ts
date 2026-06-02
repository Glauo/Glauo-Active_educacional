/**
 * IntegraÃ§Ã£o com a API do Mercado Pago â€” Boleto BancÃ¡rio (Registrado)
 * DocumentaÃ§Ã£o: https://www.mercadopago.com.br/developers/pt/docs
 *
 * IMPORTANTE: Boleto registrado exige endereÃ§o completo do pagador.
 * Se o aluno nÃ£o tiver endereÃ§o cadastrado, usa o endereÃ§o da escola como fallback.
 *
 * O Access Token Ã© lido na seguinte ordem de prioridade:
 *  1. VariÃ¡vel de ambiente MP_ACCESS_TOKEN ou MERCADOPAGO_ACCESS_TOKEN
 *  2. Campo mp_access_token salvo em boleto_config.json (via tela de ConfiguraÃ§Ãµes)
 *  3. Token padrÃ£o embutido (fallback)
 */

import { dbGet } from "@/lib/db";

export interface MpPayerAddress {
  zip_code?: string;
  street_name?: string;
  street_number?: string;
  neighborhood?: string;
  city?: string;
  federal_unit?: string;
}

export interface MpBoletoInput {
  transaction_amount: number;
  description: string;
  payer_email: string;
  payer_first_name?: string;
  payer_last_name?: string;
  payer_cpf?: string;
  payer_address?: MpPayerAddress;
  date_of_expiration?: string; // ISO 8601: "2025-06-10T23:59:59.000-03:00"
  external_reference?: string;
  notification_url?: string;
}

export interface MpBoletoResult {
  ok: boolean;
  payment_id?: number;
  status?: string;
  status_detail?: string;
  boleto_url?: string;
  barcode?: string;
  digitable_line?: string;
  date_of_expiration?: string;
  error?: string;
  raw?: unknown;
}

/**
 * EndereÃ§o padrÃ£o da escola â€” usado quando o aluno nÃ£o tem endereÃ§o cadastrado.
 * O Mercado Pago EXIGE endereÃ§o completo para boleto registrado.
 */
const DEFAULT_ADDRESS: MpPayerAddress = {
  zip_code: "14401-000",
  street_name: "Rua Voluntarios da Franca",
  street_number: "100",
  neighborhood: "Centro",
  city: "Franca",
  federal_unit: "SP",
};

function formatMpDate(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T23:59:59.000-03:00`;
}

function normalizeExpiration(value?: string) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  let date = value ? new Date(value) : new Date(NaN);
  if (Number.isNaN(date.getTime()) || date < now) {
    date = new Date(now);
    date.setDate(date.getDate() + 3);
  }

  const maxDate = new Date(now);
  maxDate.setDate(maxDate.getDate() + 29);
  if (date > maxDate) date = maxDate;

  return formatMpDate(date);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function deepText(root: Record<string, unknown>, path: string[]) {
  let current: unknown = root;
  for (const key of path) {
    current = asRecord(current)[key];
  }
  return String(current || "").trim();
}

function normalizeZipCode(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 8 ? digits : String(value || "").trim();
}

function normalizeFederalUnit(value: unknown) {
  return String(value || DEFAULT_ADDRESS.federal_unit).trim().toUpperCase().slice(0, 2) || DEFAULT_ADDRESS.federal_unit;
}

function normalizeAddress(address: MpPayerAddress): Required<MpPayerAddress> {
  return {
    zip_code: normalizeZipCode(address.zip_code || DEFAULT_ADDRESS.zip_code),
    street_name: String(address.street_name || DEFAULT_ADDRESS.street_name).trim() || DEFAULT_ADDRESS.street_name,
    street_number: String(address.street_number || DEFAULT_ADDRESS.street_number || "S/N").trim() || "S/N",
    neighborhood: String(address.neighborhood || DEFAULT_ADDRESS.neighborhood).trim() || DEFAULT_ADDRESS.neighborhood,
    city: String(address.city || DEFAULT_ADDRESS.city).trim() || DEFAULT_ADDRESS.city,
    federal_unit: normalizeFederalUnit(address.federal_unit),
  };
}

function extractBoletoUrl(data: Record<string, unknown>) {
  const candidates = [
    deepText(data, ["transaction_details", "external_resource_url"]),
    deepText(data, ["point_of_interaction", "transaction_data", "ticket_url"]),
    deepText(data, ["point_of_interaction", "transaction_data", "external_resource_url"]),
    String(data.external_resource_url || "").trim(),
    String(data.ticket_url || "").trim(),
  ];
  return candidates.find((url) => url.startsWith("http")) || "";
}

function firstNonEmptyRecord(...values: unknown[]) {
  for (const value of values) {
    const record = asRecord(value);
    if (Object.keys(record).length > 0) return record;
  }
  return {};
}

async function getAccessToken(): Promise<string> {
  // 1. VariÃ¡vel de ambiente
  const envToken =
    process.env.ACTIVE_MERCADO_PAGO_ACCESS_TOKEN ||
    process.env.MERCADO_PAGO_ACCESS_TOKEN ||
    process.env.MP_ACCESS_TOKEN ||
    process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (envToken) return envToken;

  // 2. ConfiguraÃ§Ã£o salva no banco de dados
  try {
    const boletoConfig = await dbGet<Record<string, unknown>>("boleto_config.json");
    const dbToken = String(
      boletoConfig?.mp_access_token ||
      boletoConfig?.mercado_pago_access_token ||
      boletoConfig?.MERCADO_PAGO_ACCESS_TOKEN ||
      boletoConfig?.access_token ||
      ""
    ).trim();
    if (dbToken && dbToken.startsWith("APP_USR")) return dbToken;
  } catch {
    // ignora erro de leitura do banco
  }

  // 3. Fallback: token padrÃ£o
  return "";
}

/**
 * Busca o endereÃ§o padrÃ£o da escola nas configuraÃ§Ãµes do sistema.
 * Se nÃ£o encontrar, usa o DEFAULT_ADDRESS hardcoded.
 */
async function getDefaultAddress(): Promise<MpPayerAddress> {
  try {
    const config =
      await dbGet<Record<string, unknown>>("sistema_config.json") ||
      await dbGet<Record<string, unknown>>("settings.json");
    if (config) {
      const addr: MpPayerAddress = {
        zip_code: String(config.cep || config.zip_code || DEFAULT_ADDRESS.zip_code).replace(/\D/g, "").replace(/^(\d{5})(\d{3})$/, "$1-$2") || DEFAULT_ADDRESS.zip_code,
        street_name: String(config.endereco || config.rua || config.street_name || DEFAULT_ADDRESS.street_name).trim() || DEFAULT_ADDRESS.street_name,
        street_number: String(config.numero || config.street_number || DEFAULT_ADDRESS.street_number).trim() || DEFAULT_ADDRESS.street_number,
        neighborhood: String(config.bairro || config.neighborhood || DEFAULT_ADDRESS.neighborhood).trim() || DEFAULT_ADDRESS.neighborhood,
        city: String(config.cidade || config.city || DEFAULT_ADDRESS.city).trim() || DEFAULT_ADDRESS.city,
        federal_unit: String(config.estado || config.uf || config.federal_unit || DEFAULT_ADDRESS.federal_unit).trim().toUpperCase().slice(0, 2) || DEFAULT_ADDRESS.federal_unit,
      };
      // SÃ³ retorna se tem pelo menos CEP e cidade preenchidos
      if (addr.zip_code && addr.city) return addr;
    }
  } catch {
    // ignora
  }
  return DEFAULT_ADDRESS;
}

/**
 * Cria um boleto bancÃ¡rio registrado via API do Mercado Pago.
 * Retorna a URL do boleto (external_resource_url), cÃ³digo de barras e linha digitÃ¡vel.
 */
export async function criarBoletoMercadoPago(input: MpBoletoInput): Promise<MpBoletoResult> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return {
      ok: false,
      error: "Mercado Pago Access Token nao configurado. Configure ACTIVE_MERCADO_PAGO_ACCESS_TOKEN no EasyPanel ou nas configuracoes de boleto.",
    };
  }

  const expiration = normalizeExpiration(input.date_of_expiration);
  const [boletoConfig, sistemaConfig] = await Promise.all([
    dbGet<Record<string, unknown>>("boleto_config.json").catch(() => null),
    dbGet<Record<string, unknown>>("sistema_config.json").catch(() => null),
  ]);
  const cpfLimpo = String(
    input.payer_cpf ||
    boletoConfig?.payer_document ||
    boletoConfig?.cpf ||
    boletoConfig?.cnpj ||
    sistemaConfig?.cnpj ||
    sistemaConfig?.cpf ||
    process.env.ACTIVE_MERCADO_PAGO_PAYER_DOCUMENT ||
    process.env.MERCADO_PAGO_PAYER_DOCUMENT ||
    ""
  ).replace(/\D/g, "");
  // SÃ³ envia CPF se tiver 11 dÃ­gitos e nÃ£o for sequÃªncia de zeros
  const cpfValido = (cpfLimpo.length === 11 || cpfLimpo.length === 14) && !/^0+$/.test(cpfLimpo) && !/^(\d)\1+$/.test(cpfLimpo);
  const cpfFinal = cpfValido ? cpfLimpo : null;
  const cpfTipo = cpfFinal?.length === 14 ? "CNPJ" : "CPF";

  // EndereÃ§o: usa o do aluno se fornecido, senÃ£o busca o padrÃ£o da escola
  let address: MpPayerAddress;
  if (input.payer_address && input.payer_address.zip_code && input.payer_address.city) {
    address = input.payer_address;
  } else {
    address = await getDefaultAddress();
  }

  const mpAddress = normalizeAddress(address);
  const body: Record<string, unknown> = {
    transaction_amount: Number(input.transaction_amount.toFixed(2)),
    description: input.description.slice(0, 255),
    payment_method_id: "bolbradesco",
    date_of_expiration: expiration,
    payer: {
      email: input.payer_email || "pagador@activeeducacional.com.br",
      first_name: (input.payer_first_name || "Responsavel").slice(0, 60),
      last_name: (input.payer_last_name || "Financeiro").slice(0, 60),
      ...(cpfFinal ? { identification: { type: cpfTipo, number: cpfFinal } } : {}),
      address: mpAddress,
    },
  };

  if (input.external_reference) {
    body.external_reference = input.external_reference;
  }
  if (input.notification_url) {
    body.notification_url = input.notification_url;
  }

  const idempotencyKey = `ae-boleto-${input.external_reference || Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  try {
    const res = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(body),
      redirect: "follow", // CORREÃ‡ÃƒO: segue redirects (incluindo 307)
    });

    const data = (await res.json()) as Record<string, unknown>;

    if (!res.ok) {
      const cause = Array.isArray(data.cause)
        ? (data.cause as Array<Record<string, unknown>>).map((c) => c.description || c.code).join("; ")
        : "";
      const errMsg = String(data.message || data.error || `HTTP ${res.status}`) + (cause ? ` (${cause})` : "");
      console.error("[MercadoPago] Erro ao criar boleto:", errMsg, JSON.stringify(data));
      return { ok: false, error: errMsg, raw: data };
    }

    const txDetails = asRecord(data.transaction_details);
    const boletoUrl = extractBoletoUrl(data);
    if (!boletoUrl) {
      console.error("[MercadoPago] Pagamento criado sem URL de boleto:", JSON.stringify(data));
      return {
        ok: false,
        payment_id: Number(data.id),
        status: String(data.status || "pending"),
        status_detail: String(data.status_detail || ""),
        error: "Mercado Pago criou o pagamento, mas nao retornou a URL do boleto/ticket.",
        raw: data,
      };
    }

    const barcodeObj = firstNonEmptyRecord(txDetails.barcode, data.barcode);
    const barcode = String(barcodeObj.content || "");
    const digitableLine = String(txDetails.digitable_line || "");

    return {
      ok: true,
      payment_id: Number(data.id),
      status: String(data.status || "pending"),
      status_detail: String(data.status_detail || ""),
      boleto_url: boletoUrl,
      barcode,
      digitable_line: digitableLine,
      date_of_expiration: String(data.date_of_expiration || expiration),
      raw: data,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[MercadoPago] Excecao ao criar boleto:", errMsg);
    return { ok: false, error: errMsg };
  }
}

export const criarBoleteMercadoPago = criarBoletoMercadoPago;
