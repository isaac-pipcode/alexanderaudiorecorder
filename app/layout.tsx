import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alexander Audio Recorder",
  description: "Grave e corte músicas do Spotify e do YouTube em arquivos MP3 organizados.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="mx-auto max-w-3xl px-4 py-8">
          <header className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">
              🎵 Alexander Audio Recorder
            </h1>
            <p className="mt-1 text-sm text-neutral-400">
              Transforme músicas do Spotify e do YouTube em arquivos MP3 organizados.
            </p>
          </header>
          {children}
          <footer className="mt-12 border-t border-neutral-800 pt-6 text-xs text-neutral-500">
            Ferramenta para uso pessoal/educacional. Respeite os Termos de Serviço
            do Spotify e do YouTube e os direitos autorais do conteúdo.
          </footer>
        </div>
      </body>
    </html>
  );
}
