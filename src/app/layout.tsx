import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { ScanLine } from "lucide-react";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pegou, Pagou",
  description: "Kiosk de auto-atendimento do escritório",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background font-sans text-[13px] text-fg">
        <header className="border-b border-border bg-background">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
            <Link href="/" className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface text-fg-muted">
                <ScanLine size={15} strokeWidth={1.5} />
              </span>
              <span className="text-[13px] font-semibold tracking-tight text-fg">
                Pegou, Pagou
              </span>
            </Link>
            <nav className="flex items-center gap-1">
              <Link
                href="/resumo"
                className="rounded-md px-3 py-1.5 text-[13px] font-medium text-fg-muted transition-colors duration-[120ms] hover:bg-surface hover:text-fg"
              >
                Resumo
              </Link>
              <Link
                href="/config"
                className="rounded-md px-3 py-1.5 text-[13px] font-medium text-fg-muted transition-colors duration-[120ms] hover:bg-surface hover:text-fg"
              >
                Configurações
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}
