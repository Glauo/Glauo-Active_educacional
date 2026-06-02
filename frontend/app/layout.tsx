import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { PWARegister } from "@/components/pwa-register";
import { AppRecovery } from "@/components/app-recovery";
import { TextPolisher } from "@/components/text-polisher";

export const metadata: Metadata = {
  title: {
    template: "%s | Ativo Educacional",
    default: "Ativo Educacional - Sistema de Gestão Educacional"
  },
  description: "Plataforma completa de gestão educacional: alunos, turmas, professores, financeiro e muito mais.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Ativo Edu"
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }
    ]
  },
  other: {
    "mobile-web-app-capable": "yes"
  }
};

export const viewport: Viewport = {
  themeColor: "#0a1628",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => { try { const clearCaches = () => "caches" in window ? caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("ativo-edu-")).map((key) => caches.delete(key)))) : Promise.resolve(); const unregister = () => "serviceWorker" in navigator ? navigator.serviceWorker.getRegistrations().then((regs) => Promise.all(regs.map((reg) => reg.unregister()))) : Promise.resolve(); Promise.all([clearCaches(), unregister()]).then(() => { if ("serviceWorker" in navigator && navigator.serviceWorker.controller) { const key = "active_sw_cleanup_reload"; const last = Number(sessionStorage.getItem(key) || "0"); if (Date.now() - last > 15000) { sessionStorage.setItem(key, String(Date.now())); window.location.reload(); } } }); } catch (_) {} })();`,
          }}
        />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Ativo Edu" />
        <meta name="application-name" content="Ativo Educacional" />
        <meta name="msapplication-TileColor" content="#0a1628" />
        <meta name="msapplication-TileImage" content="/icons/icon-192.png" />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <PWARegister />
          <AppRecovery />
          {locale === "pt-BR" ? <TextPolisher /> : null}
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
