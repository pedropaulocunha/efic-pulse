import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, IBM_Plex_Sans, IBM_Plex_Serif } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Fontes da logo (components/marca.tsx): Efic em Serif negrito, Pulse em Sans normal.
// A Serif 600 é a da pergunta no telão.
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400"],
});

const plexSerif = IBM_Plex_Serif({
  variable: "--font-plex-serif",
  subsets: ["latin"],
  weight: ["600", "700"],
});

// Variações só da nuvem de palavras no telão (itálicos e pesos extras).
// Sem pré-carregamento: o navegador só baixa se a nuvem aparecer.
const plexSerifItalico = IBM_Plex_Serif({
  variable: "--font-plex-serif-italico",
  subsets: ["latin"],
  weight: ["600", "700"],
  style: ["italic"],
  preload: false,
});

const plexSansNuvem = IBM_Plex_Sans({
  variable: "--font-plex-sans-nuvem",
  subsets: ["latin"],
  weight: ["300", "500", "600"],
  style: ["normal", "italic"],
  preload: false,
});

export const metadata: Metadata = {
  title: "Pulse · Efic",
  description: "Plataforma de sala da Efic Soluções para treinamentos presenciais.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} ${plexSans.variable} ${plexSerif.variable} ${plexSerifItalico.variable} ${plexSansNuvem.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
