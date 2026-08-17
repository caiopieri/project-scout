import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Scout — Projetos de pesquisa',
  description: 'Pesquisa estruturada de oportunidades no eBay.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
