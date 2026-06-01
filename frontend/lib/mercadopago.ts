/**
 * Integração com a API do Mercado Pago — Boleto Bancário (Registrado)
 * Documentação: https://www.mercadopago.com.br/developers/pt/docs
 *
 * IMPORTANTE: Boleto registrado exige endereço completo do pagador.
 * Se o aluno não tiver endereço cadastrado, usa o endereço da escola como fallback.
 *
 * O Access Token é lido na seguinte ordem de prioridade:
 *  1. Variável de ambiente MP_ACCESS_TOKEN ou MERCADOPAGO_ACCESS_TOKEN
 *  2. Campo mp_access_token salvo em boleto_config.json (via tela de Configurações)
 *  3. Token padrão embutido (fallback)
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
 * Endereço padrão da escola — usado quando o aluno não tem endereço cadastrado.
 * O Mercado Pago EXIGE endereço completo para boleto registrado.
 */
const DEFAULT_ADDRESS: MpPayerAddress = {
  zip_code: "14401-000",
  street_name: "Rua Voluntarios da Franca",
  street_number: "100",
  neighborhood: "Centro",
  city: "Franca",
  federal_unit: "SP",
};

async function getAccessToken(): Promise<string> {
  // 1. Variável de ambiente
  const envToken =
    process.env.ACTIVE_MERCADO_PAGO_ACCESS_TOKEN ||
    process.env.MERCADO_PAGO_ACCESS_TOKEN ||
    process.env.MP_ACCESS_TOKEN ||
    process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (envToken) return envToken;

  // 2. Configuração salva no banco de dados
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

  // 3. Fallback: token padrão
  return "";
}

/**
 * Busca o endereço padrão da escola nas configurações do sistema.
 * Se não encontrar, usa o DEFAULT_ADDRESS hardcoded.
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
      // Só retorna se tem pelo menos CEP e cidade preenchidos
      if (addr.zip_code && addr.city) return addr;
    }
  } catch {
    // ignora
  }
  return DEFAULT_ADDRESS;
}

/**
 * Cria um boleto bancário registrado via API do Mercado Pago.
 * Retorna a URL do boleto (external_resource_url), código de barras e linha digitável.
 */
export async function criarBoleteMercadoPago(input: MpBoletoInput): Promise<MpBoletoResult> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return {
      ok: false,
      error: "Mercado Pago Access Token nao configurado. Configure ACTIVE_MERCADO_PAGO_ACCESS_TOKEN no EasyPanel ou nas configuracoes de boleto.",
    };
  }

  // Data de expiração padrão: 3 dias a partir de hoje
  const expiration =
    input.date_of_expiration ||
    (() => {
      const d = new Date();
      d.setDate(d.getDate() + 3);
      d.setHours(23, 59, 59, 0);
      const offset = "-03:00";
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.000${offset}`;
    })();

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
  // Só envia CPF se tiver 11 dígitos e não for sequência de zeros
  const cpfValido = (cpfLimpo.length === 11 || cpfLimpo.length === 14) && !/^0+$/.test(cpfLimpo) && !/^(\d)\1+$/.test(cpfLimpo);
  const cpfFinal = cpfValido ? cpfLimpo : null;
  const cpfTipo = cpfFinal?.length === 14 ? "CNPJ" : "CPF";

  // Endereço: usa o do aluno se fornecido, senão busca o padrão da escola
  let address: MpPayerAddress;
  if (input.payer_address && input.payer_address.zip_code && input.payer_address.city) {
    address = input.payer_address;
  } else {
    address = await getDefaultAddress();
  }

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
      address: {
        zip_code: address.zip_code || DEFAULT_ADDRESS.zip_code,
        street_name: address.street_name || DEFAULT_ADDRESS.street_name,
        street_number: address.street_number || DEFAULT_ADDRESS.street_number,
        neighborhood: address.neighborhood || DEFAULT_ADDRESS.neighborhood,
        city: address.city || DEFAULT_ADDRESS.city,
        federal_unit: address.federal_unit || DEFAULT_ADDRESS.federal_unit,
      },
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
      redirect: "follow", // CORREÇÃO: segue redirects (incluindo 307)
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

    const txDetails = (data.transaction_details as Record<string, unknown>) || {};
    const boletoUrl = String(txDetails.external_resource_url || "");
    const barcodeObj = (txDetails.barcode as Record<string, unknown>) || (data.barcode as Record<string, unknown>) || {};
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
