import { dbGet } from "./db";

function enabled(value: unknown) {
  return ["1", "true", "yes", "sim", "on"].includes(String(value || "").trim().toLowerCase());
}

function disabled(value: unknown) {
  return ["0", "false", "no", "nao", "não", "off", "inativo"].includes(String(value || "").trim().toLowerCase());
}

export async function automaticStudentMessagesEnabled() {
  const environmentValue = process.env.ACTIVE_AUTOMATIC_STUDENT_MESSAGES;
  if (environmentValue !== undefined && String(environmentValue).trim() !== "") {
    return enabled(environmentValue);
  }

  const config = await dbGet<Record<string, unknown>>("sistema_config.json");
  const configuredValue = config?.envio_automatico_comunicados;
  return !disabled(configuredValue);
}

export function automaticFinanceMessagesEnabled() {
  return enabled(process.env.ACTIVE_FINANCE_WHATSAPP_AUTOSEND);
}
