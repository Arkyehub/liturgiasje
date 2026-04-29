import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/shared/ui/sonner";
import Script from "next/script";
import { GoogleOneTap } from "@/features/auth/ui/GoogleOneTap";
import { PWAHandler } from "@/features/pwa/ui/PWAHandler";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { VersionChecker } from "@/features/pwa/ui/VersionChecker";
import { AuthProvider } from "@/app/providers/AuthProvider";
import { PersistentHeader } from "@/shared/ui/PersistentHeader";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://liturgiasje.vercel.app"),
  title: "Gestão de Leitores - Liturgia SJE",
  description: "Sistema de gestão de escalas e comunicação para o ministério de leitores.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Liturgia SJE",
  },
  icons: {
    icon: [
      { url: '/icons/favicon.ico' },
      { url: '/icons/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png' },
    ],
  },
};

export const viewport = {
  themeColor: "#322113",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full" suppressHydrationWarning>
      <head>
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
      </head>
      <body className={`${inter.className} min-h-full bg-background text-foreground antialiased`}>
        <AuthProvider>
          <PersistentHeader />
          <VersionChecker />
          <PWAHandler />
          {children}
          <Toaster />
          <GoogleOneTap />
        </AuthProvider>
        <Script 
          src="https://accounts.google.com/gsi/client" 
          strategy="afterInteractive"
        />
        <SpeedInsights />
      </body>
    </html>
  );
}
