import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = { title: "Closer", description: "Delegate selling to an AI agent with hard limits." };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b bg-white">
          <nav className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3 text-sm">
            <Link href="/" className="text-lg font-bold">Closer</Link>
            <Link href="/sell/new" className="text-slate-600 hover:underline">Sell</Link>
            <Link href="/dashboard" className="text-slate-600 hover:underline">Dashboard</Link>
            <Link href="/agent-buyer" className="text-slate-600 hover:underline">Buyer agent</Link>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
