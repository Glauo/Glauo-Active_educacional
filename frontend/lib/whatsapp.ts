import { dbGet, dbList, dbSet } from "./db";
import type { SessionUser } from "./auth";

type SendResult = { ok: boolean; status: string; attempts?: Record<string, unknown>[] };

function text(value: unknown) {
  return String(value || "").trim();
}

function normalizePhone(value: unknown) {
  let digits = text(value).replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits;
}

function successPreview(preview: string) {
  return /sent|success|sucesso|enviado|queued|accepted|created|message sent|mensagem enviada/i.test(preview);
}

function failurePreview(preview: string) {
  return /error|erro|invalid|unauthorized|forbidden|not found|failed|fail|expired|disconnect/i.test(preview);
}

function env(...names: string[]) {
  for (const name of names) {
    const value = text(process.env[name]);
    if (value) return value;
  }
  return "";
}

async function configValue(...names: string[]) {
  const [sistema, smtp] = await Promise.all([
    dbGet<Record<string, unknown>>("sistema_config.json"),
    dbGet<Record<string, unknown>>("smtp_config.json"),
  ]);
  for (const name of names) {
    const value = text(process.env[name] || sistema?.[name] || smtp?.[name]);
    if (value) return value;
  }
  return "";
}

async function wapiConfig() {
  const baseUrl = (await configValue("WAPI_BASE_URL", "W_API_URL", "WAPI_URL", "ACTIVE_WAPI_URL")).replace(/\/+$/, "");
  const token = await configValue("WAPI_TOKEN", "W_API_TOKEN", "WAPI_API_KEY", "ACTIVE_WAPI_TOKEN");
  const instance = await configValue("WAPI_INSTANCE_ID", "W_API_INSTANCE_ID", "WAPI_INSTANCE", "W_API_INSTANCE", "ACTIVE_WAPI_INSTANCE");
  return { baseUrl, token, instance };
}

function endpointCandidates(baseUrl: string, instance: string) {
  const direct = /send-?text|send-?message/i.test(baseUrl);
  if (direct) return [baseUrl];
  const roots = Array.from(new Set([baseUrl, (() => {
    try {
      const u = new URL(baseUrl);
      return `${u.protocol}//${u.host}`;
    } catch {
      return "";
    }
  })()].filter(Boolean)));
  const inst = encodeURIComponent(instance);
  const paths = [
    "/v1/message/send-text",
    `/v1/message/send-text?instanceId=${inst}`,
    `/v1/message/send-text?instance_id=${inst}`,
    `/v1/message/send-text/${inst}`,
    "/v1/messages/send-text",
    `/v1/messages/send-text?instanceId=${inst}`,
    `/v1/messages/send-text/${inst}`,
    "/api/v1/message/send-text",
    `/api/v1/message/send-text?instanceId=${inst}`,
    `/api/v1/message/send-text/${inst}`,
    "/message/send-text",
    `/message/send-text?instanceId=${inst}`,
    "/message/sendText",
    `/message/sendText?instanceId=${inst}`,
    "/message/send-message",
    `/message/send-message?instanceId=${inst}`,
    "/message/send",
    `/message/send?instanceId=${inst}`,
    "/send-text",
    `/send-text?instanceId=${inst}`,
    "/send-message",
    `/send-message?instanceId=${inst}`,
    "/api/send-text",
    `/api/send-text?instanceId=${inst}`,
    "/api/send-message",
    `/api/send-message?instanceId=${inst}`,
    `/instance/${inst}/send-text`,
    `/instance/${inst}/send-message`,
    `/instances/${inst}/send-text`,
    `/instances/${inst}/send-message`,
  ];
  return roots.flatMap((root) => paths.map((path) => `${root}${path}`));
}

export async function sendWhatsApp(number: unknown, message: string, session?: Pick<SessionUser, "usuario" | "pessoa" | "perfil"> | null): Promise<SendResult> {
  const phone = normalizePhone(number);
  const body = text(message);
  if (!phone || !body) return { ok: false, status: "telefone ou mensagem vazio" };

  const { baseUrl, token, instance } = await wapiConfig();
  if (!baseUrl || !token || !instance) return { ok: false, status: "wapi nao configurado" };

  const headersList: Record<string, string>[] = [
    { Authorization: token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}` },
    { Authorization: token },
    { apikey: token },
    { "x-api-key": token },
    { token },
    { Authorization: token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}`, instanceId: instance },
    { Authorization: token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}`, instance_id: instance },
    { apikey: token, instanceId: instance },
    { apikey: token, instance_id: instance },
  ];
  const payloads = [
    { phone, message: body },
    { phone, text: body },
    { phone, body },
    { number: phone, message: body },
    { number: phone, text: body },
    { number: phone, body },
    { to: phone, message: body },
    { to: phone, text: body },
    { to: phone, body },
    { recipient: phone, message: body },
    { recipient: phone, text: body },
    { recipient: phone, body },
    { chatId: `${phone}@c.us`, message: body },
    { chatId: `${phone}@c.us`, text: body },
    { chatId: `${phone}@c.us`, body },
    { jid: `${phone}@c.us`, message: body },
    { jid: `${phone}@c.us`, text: body },
    { instanceId: instance, phone, message: body },
    { instanceId: instance, phone, text: body },
    { instanceId: instance, number: phone, message: body },
    { instanceId: instance, number: phone, text: body },
    { instance_id: instance, phone, message: body },
    { instance_id: instance, phone, text: body },
    { instance: instance, phone, message: body },
    { instance: instance, number: phone, text: body },
    { session: instance, phone, message: body },
    { session: instance, number: phone, text: body },
  ];
  const attempts: Record<string, unknown>[] = [];
  const maxAttempts = 24;

  for (const url of endpointCandidates(baseUrl, instance)) {
    for (const authHeaders of headersList) {
      for (const payload of payloads) {
        if (attempts.length >= maxAttempts) break;
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { Accept: "application/json", "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(2500),
          });
          const preview = await res.text().catch(() => "");
          attempts.push({ url, status: res.status, auth: Object.keys(authHeaders)[0], payload: Object.keys(payload), preview: preview.slice(0, 160) });
          if ((res.ok && !failurePreview(preview)) || successPreview(preview)) {
            await logWhatsApp(phone, body, "enviado", session);
            return { ok: true, status: `enviado HTTP ${res.status}`, attempts };
          }
        } catch (err) {
          attempts.push({ url, error: err instanceof Error ? err.message : "erro" });
        }
      }
      if (attempts.length >= maxAttempts) break;
    }
    if (attempts.length >= maxAttempts) break;
  }

  const last = attempts[attempts.length - 1];
  const status = attempts.length >= maxAttempts ? "falha wapi limite de tentativas" : `falha wapi ${text(last?.status || last?.error || "sem resposta")}`;
  console.error("[sendWhatsApp]", {
    phone,
    baseUrl,
    instance,
    attempts: attempts.slice(-5),
    status,
  });
  await logWhatsApp(phone, body, status, session);
  return { ok: false, status, attempts };
}

export async function logWhatsApp(destinatario: string, mensagem: string, status: string, session?: Pick<SessionUser, "usuario" | "pessoa" | "perfil"> | null) {
  const logs = await dbList<Record<string, unknown>>("email_log.json");
  await dbSet("email_log.json", [
    ...logs,
    {
      id: crypto.randomUUID(),
      data: new Date().toISOString(),
      canal: "whatsapp",
      destinatario,
      whatsapp: destinatario,
      assunto: "Envio automatico Active",
      mensagem,
      origem: "W-API",
      status,
      usuario: session?.pessoa || session?.usuario || "",
      perfil: session?.perfil || "",
    },
  ]);
}

export function isWhatsAppConfiguredFromEnv() {
  return Boolean(env("WAPI_BASE_URL", "W_API_URL", "WAPI_URL") && env("WAPI_TOKEN", "W_API_TOKEN", "WAPI_API_KEY"));
}
