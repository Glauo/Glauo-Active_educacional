type Row = Record<string, unknown>;

function text(value: unknown) {
  return String(value || "").trim();
}

function absoluteUrl(url: string, origin = "") {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  return origin ? `${origin}${url.startsWith("/") ? url : `/${url}`}` : url;
}

export function isReceiptLikeUrl(value: unknown) {
  const url = text(value).toLowerCase();
  return url.includes("recibo") || url.includes("receipt");
}

export function realBoletoTicketUrl(row: Row) {
  const mercadoPagoUrl = text(row.mercado_pago_ticket_url);
  if (mercadoPagoUrl.startsWith("http") && !isReceiptLikeUrl(mercadoPagoUrl)) {
    return mercadoPagoUrl;
  }

  const boletoUrl = text(row.boleto_url);
  if (boletoUrl.startsWith("http") && !isReceiptLikeUrl(boletoUrl)) {
    return boletoUrl;
  }

  return "";
}

export function uploadedBoletoPdfUrl(row: Row, origin = "") {
  const pdfUrl = text(row.boleto_pdf_url || row.boleto_pdf_public_url);
  if (pdfUrl) return absoluteUrl(pdfUrl, origin);

  const id = text(row.id);
  if (row.boleto_pdf_b64 && id) {
    return absoluteUrl(`/api/financeiro/boleto-pdf?id=${encodeURIComponent(id)}`, origin);
  }

  return "";
}

export function existingBoletoDocumentUrl(row: Row, origin = "") {
  return realBoletoTicketUrl(row) || uploadedBoletoPdfUrl(row, origin);
}

export function boletoAccessUrl(row: Row, origin = "") {
  const existing = existingBoletoDocumentUrl(row, origin);
  if (existing) return existing;

  const id = text(row.id);
  return id ? absoluteUrl(`/api/financeiro/boleto?id=${encodeURIComponent(id)}`, origin) : "";
}
