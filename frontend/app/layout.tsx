import "./globals.css";
import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hanken",
});

const ibmMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-mono",
});

export const metadata: Metadata = {
  title: "OralVerse — AI Orthodontic CAD",
  description: "AI-assisted orthodontic treatment planning and aligner simulation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider afterSignInUrl="/dashboard" afterSignUpUrl="/dashboard">
      <html lang="en" className={`${hanken.variable} ${ibmMono.variable}`}>
        <body className="min-h-screen">{children}</body>
      </html>
    </ClerkProvider>
  );
}
