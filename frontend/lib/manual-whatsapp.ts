function text(value: unknown) {
  return String(value || "").trim();
}

export function normalizeWhatsAppPhone(value: unknown) {
  let digits = text(value).replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits;
}

export function manualWhatsAppUrl(phone: unknown, message: string) {
  const digits = normalizeWhatsAppPhone(phone);
  const body = text(message);
  if (!digits || !body) return "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(body)}`;
}
