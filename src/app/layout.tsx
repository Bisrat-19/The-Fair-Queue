import type { Metadata } from "next";
import { Bricolage_Grotesque, Public_Sans } from "next/font/google";
import Link from "next/link";
import { NavLink } from "@/components/nav-link";
import { Toaster } from "@/components/toaster";
import "./globals.css";

const publicSans = Public_Sans({ variable: "--font-public-sans", subsets: ["latin"] });
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "The Fair Queue",
  description: "Fair access to university study rooms.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${publicSans.variable} ${bricolage.variable} antialiased`}>
      <body className="min-h-dvh font-sans text-[15px] leading-relaxed">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight">
              <span aria-hidden className="grid h-7 w-7 place-items-center rounded-md bg-signal text-sm text-ink">
                Q
              </span>
              The Fair Queue
            </Link>
            <nav className="flex gap-1 text-sm" aria-label="Main">
              <NavLink href="/">Students</NavLink>
              <NavLink href="/admin">Staff</NavLink>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8 pb-24 sm:px-6 sm:py-10">{children}</main>
        <Toaster />
      </body>
    </html>
  );
}
