function enabled(value: unknown) {
  return ["1", "true", "yes", "sim", "on"].includes(String(value || "").trim().toLowerCase());
}

export function automaticStudentMessagesEnabled() {
  return enabled(process.env.ACTIVE_AUTOMATIC_STUDENT_MESSAGES);
}

export function automaticFinanceMessagesEnabled() {
  return enabled(process.env.ACTIVE_FINANCE_WHATSAPP_AUTOSEND);
}
