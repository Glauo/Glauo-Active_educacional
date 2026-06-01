"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AppLocale } from "@/lib/locale";

const OPTIONS: AppLocale[] = ["pt-BR", "en-US"];

type Props = {
  className?: string;
  compact?: boolean;
};

export function LocaleSwitcher({ className = "", compact = false }: Props) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("locale");
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function onChange(next: string) {
    if (next === locale || saving) return;
    setSaving(true);
    try {
      await fetch("/api/me/locale", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const labelFor = (value: AppLocale) => (value === "pt-BR" ? t("ptBR") : t("enUS"));

  return (
    <label className={`locale-switcher ${className}`.trim()} title={t("label")}>
      {!compact && <span className="locale-switcher-label">{t("label")}</span>}
      <select
        className="form-input locale-switcher-select"
        value={locale}
        onChange={(e) => void onChange(e.target.value)}
        disabled={saving}
        aria-label={t("label")}
      >
        {OPTIONS.map((value) => (
          <option key={value} value={value}>
            {labelFor(value)}
          </option>
        ))}
      </select>
    </label>
  );
}
