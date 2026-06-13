import type { Metadata } from "next";
import { Special_Elite, Permanent_Marker } from "next/font/google";
import "./globals.css";

// Fontes analógicas: máquina de escrever + caneta de etiqueta.
const typewriter = Special_Elite({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-typewriter",
});
const marker = Permanent_Marker({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-marker",
});

export const metadata: Metadata = {
  title: "Alexander Audio Recorder",
  description: "Grave fitas do Spotify e corte fitas do YouTube. Som analógico, jeitão dos anos 80.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${typewriter.variable} ${marker.variable}`}>
      <body>
        <div className="scanlines" aria-hidden />
        <div className="mx-auto max-w-3xl px-4 py-8">
          <header className="mb-8 text-center">
            <h1 className="title-stamp">ALEXANDER&nbsp;AUDIO&nbsp;RECORDER</h1>
            <p className="mt-2 text-sm tracking-widest text-ink/70">
              ✦ HI-FI STEREO CASSETTE &nbsp;·&nbsp; SPLICE &amp; RECORD &nbsp;·&nbsp; MODELO 1986 ✦
            </p>
          </header>
          {children}
          <footer className="mt-12 border-t-2 border-dashed border-ink/30 pt-6 text-center text-xs text-ink/60">
            Para uso pessoal/educacional. Respeite os direitos autorais e os
            Termos de Serviço do Spotify e do YouTube.
          </footer>
        </div>
      </body>
    </html>
  );
}
