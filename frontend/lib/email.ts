import net from "node:net";
import tls from "node:tls";
import { dbGet, dbList, dbSet } from "./db";
import type { SessionUser } from "./auth";

type SendEmailResult = { ok: boolean; status: string };

function text(value: unknown) {
  return String(value || "").trim();
}

function isValidEmail(value: unknown) {
  const email = text(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
    const value = text(process.env[name] || smtp?.[name] || sistema?.[name]);
    if (value) return value;
  }
  return "";
}

async function smtpConfig() {
  const contactEmail = await configValue("email_contato");
  const host = await configValue("ACTIVE_SMTP_HOST", "SMTP_HOST", "host", "smtp_host");
  const port = Number(await configValue("ACTIVE_SMTP_PORT", "SMTP_PORT", "port", "smtp_port") || 587);
  const rawUser = await configValue("ACTIVE_SMTP_USER", "SMTP_USER", "user", "smtp_user");
  const password = await configValue("ACTIVE_SMTP_PASS", "SMTP_PASS", "senha", "password", "pass", "smtp_pass");
  const rawFromEmail = await configValue("ACTIVE_EMAIL_FROM", "SMTP_FROM", "from_email", "from", "smtp_from", "user", "email_contato");
  const fromName = await configValue("ACTIVE_EMAIL_FROM_NAME", "SMTP_FROM_NAME", "from_name");
  const enabled = (await configValue("enabled", "smtp_enabled")).toLowerCase();
  const tlsFlag = (await configValue("ACTIVE_SMTP_TLS", "SMTP_TLS", "tls", "smtp_tls") || "1").toLowerCase();
  const user = isValidEmail(rawUser) ? rawUser : "";
  const fromEmail = isValidEmail(rawFromEmail)
    ? rawFromEmail
    : isValidEmail(rawUser)
      ? rawUser
      : isValidEmail(contactEmail)
        ? contactEmail
        : "";
  return {
    host,
    port,
    user,
    password,
    fromEmail,
    fromName: fromName || "Active Educacional",
    enabled: enabled !== "false" && enabled !== "0" && enabled !== "inativo",
    useTls: tlsFlag !== "0" && tlsFlag !== "false" && tlsFlag !== "no",
  };
}

function encodeHeader(value: string) {
  return /[^\x00-\x7F]/.test(value) ? `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=` : value;
}

function dotStuff(value: string) {
  return value.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
}

function readResponse(socket: net.Socket) {
  return new Promise<string>((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => cleanup(() => reject(new Error("timeout smtp"))), 20000);
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || "";
      if (/^\d{3}\s/.test(last)) cleanup(() => resolve(buffer));
    };
    const onError = (err: Error) => cleanup(() => reject(err));
    const cleanup = (done: () => void) => {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
      done();
    };
    socket.on("data", onData);
    socket.on("error", onError);
  });
}

async function command(socket: net.Socket, line: string, okCodes: number[]) {
  socket.write(`${line}\r\n`);
  const response = await readResponse(socket);
  const code = Number(response.slice(0, 3));
  if (!okCodes.includes(code)) throw new Error(response.trim().slice(0, 180));
  return response;
}

function connectPlain(host: string, port: number) {
  return new Promise<net.Socket>((resolve, reject) => {
    const socket = net.connect(port, host);
    socket.setTimeout(25000);
    socket.once("connect", () => resolve(socket));
    socket.once("error", reject);
    socket.once("timeout", () => reject(new Error("timeout smtp")));
  });
}

function connectTls(host: string, port: number) {
  return new Promise<tls.TLSSocket>((resolve, reject) => {
    const socket = tls.connect(port, host, { servername: host });
    socket.setTimeout(25000);
    socket.once("secureConnect", () => resolve(socket));
    socket.once("error", reject);
    socket.once("timeout", () => reject(new Error("timeout smtp tls")));
  });
}

function upgradeTls(socket: net.Socket, host: string) {
  return new Promise<tls.TLSSocket>((resolve, reject) => {
    const secure = tls.connect({ socket, servername: host });
    secure.setTimeout(25000);
    secure.once("secureConnect", () => resolve(secure));
    secure.once("error", reject);
    secure.once("timeout", () => reject(new Error("timeout starttls")));
  });
}

async function smtpSend(to: string, subject: string, body: string) {
  const cfg = await smtpConfig();
  if (!cfg.enabled) return { ok: false, status: "smtp desativado" };
  if (!cfg.host || !cfg.port) return { ok: false, status: "smtp nao configurado" };
  if (!cfg.user || !cfg.password) return { ok: false, status: "smtp login incompleto" };
  if (!isValidEmail(cfg.user)) return { ok: false, status: "smtp usuario invalido" };
  if (!isValidEmail(cfg.fromEmail)) return { ok: false, status: "smtp remetente invalido" };

  let socket: net.Socket = cfg.port === 465
    ? await connectTls(cfg.host, cfg.port)
    : await connectPlain(cfg.host, cfg.port);
  try {
    await readResponse(socket);
    await command(socket, `EHLO ${cfg.host}`, [250]);
    if (cfg.port !== 465 && cfg.useTls) {
      await command(socket, "STARTTLS", [220]);
      socket = await upgradeTls(socket, cfg.host);
      await command(socket, `EHLO ${cfg.host}`, [250]);
    }
    if (cfg.user && cfg.password) {
      await command(socket, "AUTH LOGIN", [334]);
      await command(socket, Buffer.from(cfg.user).toString("base64"), [334]);
      await command(socket, Buffer.from(cfg.password).toString("base64"), [235]);
    }
    const from = cfg.fromName ? `${encodeHeader(cfg.fromName)} <${cfg.fromEmail}>` : cfg.fromEmail;
    const message = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${encodeHeader(subject)}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      body,
    ].join("\r\n");
    await command(socket, `MAIL FROM:<${cfg.fromEmail}>`, [250]);
    await command(socket, `RCPT TO:<${to}>`, [250, 251]);
    await command(socket, "DATA", [354]);
    await command(socket, `${dotStuff(message)}\r\n.`, [250]);
    await command(socket, "QUIT", [221, 250]);
    return { ok: true, status: "enviado_smtp" };
  } finally {
    socket.destroy();
  }
}

export async function sendEmail(to: unknown, subject: string, body: string, session?: Pick<SessionUser, "usuario" | "pessoa" | "perfil"> | null): Promise<SendEmailResult> {
  const email = text(to);
  const assunto = text(subject || "Active Educacional");
  const mensagem = text(body);
  if (!email || !mensagem) return { ok: false, status: "email ou mensagem vazio" };
  if (!isValidEmail(email)) return { ok: false, status: "email destino invalido" };

  try {
    const result = await smtpSend(email, assunto, mensagem);
    await logEmail(email, assunto, mensagem, result.status, session);
    return result;
  } catch (err) {
    const status = `falha smtp ${err instanceof Error ? err.message : "erro"}`.slice(0, 220);
    await logEmail(email, assunto, mensagem, status, session);
    return { ok: false, status };
  }
}

export async function logEmail(destinatario: string, assunto: string, mensagem: string, status: string, session?: Pick<SessionUser, "usuario" | "pessoa" | "perfil"> | null) {
  const logs = await dbList<Record<string, unknown>>("email_log.json");
  await dbSet("email_log.json", [
    ...logs,
    {
      id: crypto.randomUUID(),
      data: new Date().toISOString(),
      canal: "email",
      destinatario,
      email: destinatario,
      assunto,
      mensagem,
      origem: "SMTP",
      status,
      usuario: session?.pessoa || session?.usuario || "",
      perfil: session?.perfil || "",
    },
  ]);
}

export function isEmailConfiguredFromEnv() {
  return Boolean(env("ACTIVE_SMTP_HOST", "SMTP_HOST") && env("ACTIVE_EMAIL_FROM", "SMTP_FROM", "ACTIVE_SMTP_USER", "SMTP_USER"));
}

export function isEmailConfigurationValid(config: Record<string, unknown> | null | undefined, sistema?: Record<string, unknown> | null | undefined) {
  if (!config) return false;
  const host = text(config.host || config.smtp_host);
  const user = text(config.user || config.smtp_user);
  const fromEmail = text(config.from_email || config.from || config.smtp_from || sistema?.email_contato);
  const password = text(config.senha || config.password || config.pass || config.smtp_pass);
  const enabled = text(config.enabled ?? "true").toLowerCase();
  if (enabled === "false" || enabled === "0" || enabled === "inativo") return false;
  return Boolean(host && password && isValidEmail(user) && isValidEmail(fromEmail));
}
