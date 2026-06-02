"use client";

import { CSSProperties } from "react";
import { manualWhatsAppUrl } from "@/lib/manual-whatsapp";

type Props = {
  phone: unknown;
  message: string;
  label?: string;
  className?: string;
  style?: CSSProperties;
};

function text(value: unknown) {
  return String(value || "").trim();
}

export function AutoWhatsAppButton({
  phone,
  message,
  label = "WhatsApp",
  className = "btn btn-secondary btn-sm",
  style,
}: Props) {
  const telefone = text(phone);
  const href = manualWhatsAppUrl(telefone, message);

  if (!href) {
    return <button className={className} style={style} type="button" disabled>{label}</button>;
  }

  return <a className={className} style={style} href={href} target="_blank" rel="noreferrer">{label}</a>;
}
