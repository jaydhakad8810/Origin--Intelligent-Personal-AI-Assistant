import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import OriginOrb from "@/components/OriginOrb";
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
  title: "Origin",
  description: "One voice. One assistant. Your digital life.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <OriginOrb />
      </body>
    </html>
  );
}
